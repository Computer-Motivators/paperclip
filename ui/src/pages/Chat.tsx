import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { IssueThreadInteraction, AskUserQuestionsAnswer } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { agentsApi } from "../api/agents";
import { companiesApi } from "../api/companies";
import { heartbeatsApi } from "../api/heartbeats";
import { issuesApi } from "../api/issues";
import { IssueChatThread } from "../components/IssueChatThread";
import { Button } from "../components/ui/button";
import { useCompany } from "../context/CompanyContext";
import { useIssueChatController } from "../hooks/useIssueChatController";
import { queryKeys } from "../lib/queryKeys";

const EMPTY_QUEUED_COMMENTS = new Map<string, string>();

export function Chat() {
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");

  const boardChatQuery = useQuery({
    queryKey: queryKeys.companies.boardChat(selectedCompanyId ?? "none"),
    queryFn: () => companiesApi.getBoardChat(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId ?? "none"),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const boardChat = boardChatQuery.data;
  const issue = boardChat?.issue ?? null;
  const issueId = issue?.id ?? null;
  const agents = agentsQuery.data ?? [];

  useEffect(() => {
    if (!selectedAgentId && boardChat?.agent?.id) {
      setSelectedAgentId(boardChat.agent.id);
      return;
    }
    if (!selectedAgentId && agents[0]?.id) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, boardChat?.agent?.id, selectedAgentId]);

  const ensureBoardChat = useMutation({
    mutationFn: (agentId: string) => companiesApi.ensureBoardChat(selectedCompanyId!, { agentId }),
    onSuccess: (state) => {
      queryClient.setQueryData(queryKeys.companies.boardChat(selectedCompanyId!), state);
      if (state.issue?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(state.issue.id) });
      }
    },
  });

  const updateBoardChatAgent = useMutation({
    mutationFn: (agentId: string) => companiesApi.updateBoardChatAgent(selectedCompanyId!, { agentId }),
    onSuccess: (state) => {
      queryClient.setQueryData(queryKeys.companies.boardChat(selectedCompanyId!), state);
      if (state.issue?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(state.issue.id) });
      }
    },
  });

  const commentsQuery = useQuery({
    queryKey: queryKeys.issues.comments(issueId ?? "none"),
    queryFn: () => issuesApi.listComments(issueId!, { order: "asc", limit: 300 }),
    enabled: Boolean(issueId),
  });
  const interactionsQuery = useQuery({
    queryKey: queryKeys.issues.interactions(issueId ?? "none"),
    queryFn: () => issuesApi.listInteractions(issueId!),
    enabled: Boolean(issueId),
  });

  const chatController = useIssueChatController({
    issueId: issueId ?? "none",
    issueStatus: issue?.status ?? "in_progress",
    executionRunId: issue?.executionRunId ?? null,
    comments: (commentsQuery.data ?? []),
    locallyQueuedCommentRunIds: EMPTY_QUEUED_COMMENTS,
    queuedCommentReason: "other",
    enabled: Boolean(issueId),
  });

  const refreshIssueChatData = () => {
    if (!issueId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.interactions(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activity(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.runs(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.liveRuns(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.activeRun(issueId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
  };

  const actionableInteractions = useMemo(
    () => interactionsQuery.data ?? [],
    [interactionsQuery.data],
  );

  async function handleAdd(body: string) {
    if (!issueId) return;
    await issuesApi.addComment(issueId, body);
    refreshIssueChatData();
  }

  async function handleStopRun(runId: string) {
    await heartbeatsApi.cancel(runId);
    refreshIssueChatData();
  }

  async function handleAcceptInteraction(interaction: Extract<IssueThreadInteraction, { kind: "suggest_tasks" | "request_confirmation" }>, selectedClientKeys?: string[]) {
    if (!issueId) return;
    await issuesApi.acceptInteraction(issueId, interaction.id, selectedClientKeys?.length ? { selectedClientKeys } : undefined);
    refreshIssueChatData();
  }

  async function handleRejectInteraction(interaction: Extract<IssueThreadInteraction, { kind: "suggest_tasks" | "request_confirmation" }>, reason?: string) {
    if (!issueId) return;
    await issuesApi.rejectInteraction(issueId, interaction.id, reason);
    refreshIssueChatData();
  }

  async function handleSubmitInteractionAnswers(interaction: IssueThreadInteraction, answers: AskUserQuestionsAnswer[]) {
    if (!issueId || interaction.kind !== "ask_user_questions") return;
    await issuesApi.respondToInteraction(issueId, interaction.id, { answers });
    refreshIssueChatData();
  }

  async function handleCancelInteraction(interaction: Extract<IssueThreadInteraction, { kind: "ask_user_questions" }>) {
    if (!issueId) return;
    await issuesApi.cancelInteraction(issueId, interaction.id);
    refreshIssueChatData();
  }

  if (!selectedCompanyId) {
    return <div className="p-6 text-sm text-muted-foreground">Select a company to use Chat.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chat</h1>
          <p className="text-sm text-muted-foreground">
            Persistent per-user conversation backed by one hidden issue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={selectedAgentId}
            onChange={(event) => setSelectedAgentId(event.target.value)}
            disabled={agentsQuery.isLoading || agents.length === 0}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
          {!issueId ? (
            <Button
              onClick={() => selectedAgentId && ensureBoardChat.mutate(selectedAgentId)}
              disabled={!selectedAgentId || ensureBoardChat.isPending}
            >
              {ensureBoardChat.isPending ? "Starting..." : "Start chat"}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => selectedAgentId && updateBoardChatAgent.mutate(selectedAgentId)}
              disabled={!selectedAgentId || updateBoardChatAgent.isPending}
            >
              {updateBoardChatAgent.isPending ? "Saving..." : "Switch agent"}
            </Button>
          )}
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No runnable agents found. Create one in <Link to="/agents/new" className="underline">New Agent</Link>.
        </div>
      ) : null}

      {issue ? (
        <div className="min-h-0 flex-1 rounded-lg border">
          <IssueChatThread
            comments={chatController.commentsWithRunMeta}
            interactions={actionableInteractions}
            linkedRuns={chatController.timelineRuns}
            timelineEvents={chatController.timelineEvents}
            liveRuns={chatController.resolvedLiveRuns}
            activeRun={chatController.resolvedActiveRun}
            issueId={issue.id}
            companyId={selectedCompanyId}
            issueStatus={issue.status}
            draftKey={`paperclip:chat:${selectedCompanyId}:${issue.id}`}
            onAdd={handleAdd}
            onStopRun={handleStopRun}
            onAcceptInteraction={handleAcceptInteraction}
            onRejectInteraction={handleRejectInteraction}
            onSubmitInteractionAnswers={handleSubmitInteractionAnswers}
            onCancelInteraction={handleCancelInteraction}
            onRefreshLatestComments={refreshIssueChatData}
            onCancelRun={chatController.runningIssueRun
              ? async () => {
                  await handleStopRun(chatController.runningIssueRun!.id);
                }
              : undefined}
            footer={(
              <div className="text-xs text-muted-foreground">
                <Link to={`/issues/${issue.id}`} className="underline">Open as issue</Link>
              </div>
            )}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Choose an agent and start chat to create your private conversation thread.
        </div>
      )}
    </div>
  );
}
