import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ActivityEvent, Issue, IssueComment } from "@paperclipai/shared";
import { activityApi, type RunForIssue } from "../api/activity";
import { heartbeatsApi, type ActiveRunForIssue, type LiveRunForIssue } from "../api/heartbeats";
import { resolveIssueActiveRun } from "../lib/issueActiveRun";
import { extractIssueTimelineEvents } from "../lib/issue-timeline-events";
import {
  applyLocalQueuedIssueCommentState,
  isQueuedIssueComment,
  type OptimisticIssueComment,
} from "../lib/optimistic-issue-comments";
import { keepPreviousDataForSameQueryTail } from "../lib/query-placeholder-data";
import { queryKeys } from "../lib/queryKeys";

export type IssueChatControllerComment = (IssueComment | OptimisticIssueComment) & {
  runId?: string | null;
  runAgentId?: string | null;
  interruptedRunId?: string | null;
  queueState?: "queued";
  queueTargetRunId?: string | null;
  queueReason?: "hold" | "active_run" | "other";
  followUpRequested?: boolean;
};

function resolveRunningIssueRun(
  activeRun: ActiveRunForIssue | null,
  liveRuns: readonly LiveRunForIssue[],
) {
  return activeRun?.status === "running"
    ? activeRun
    : liveRuns.find((run) => run.status === "running") ?? null;
}

export function useIssueChatController(input: {
  issueId: string;
  issueStatus: Issue["status"];
  executionRunId: string | null;
  comments: IssueChatControllerComment[];
  locallyQueuedCommentRunIds: ReadonlyMap<string, string>;
  queuedCommentReason: "hold" | "active_run" | "other";
  enabled?: boolean;
}) {
  const {
    issueId,
    issueStatus,
    executionRunId,
    comments,
    locallyQueuedCommentRunIds,
    queuedCommentReason,
    enabled = true,
  } = input;
  const { data: activity } = useQuery({
    queryKey: queryKeys.issues.activity(issueId),
    queryFn: () => activityApi.forIssue(issueId),
    enabled,
    placeholderData: keepPreviousDataForSameQueryTail<ActivityEvent[]>(issueId),
  });
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.issues.liveRuns(issueId),
    queryFn: () => heartbeatsApi.liveRunsForIssue(issueId),
    enabled,
    refetchInterval: 3000,
    placeholderData: keepPreviousDataForSameQueryTail<LiveRunForIssue[]>(issueId),
  });
  const resolvedLiveRuns = liveRuns ?? [];
  const liveRunCount = resolvedLiveRuns.length;
  const { data: activeRun = null } = useQuery({
    queryKey: queryKeys.issues.activeRun(issueId),
    queryFn: () => heartbeatsApi.activeRunForIssue(issueId),
    enabled: enabled && (!!executionRunId || issueStatus === "in_progress"),
    refetchInterval: liveRunCount > 0 ? false : 3000,
    placeholderData: keepPreviousDataForSameQueryTail<ActiveRunForIssue | null>(issueId),
  });
  const resolvedActiveRun = useMemo(
    () => resolveIssueActiveRun({ status: issueStatus, executionRunId }, activeRun),
    [activeRun, executionRunId, issueStatus],
  );
  const hasLiveRuns = liveRunCount > 0 || !!resolvedActiveRun;
  const { data: linkedRuns } = useQuery({
    queryKey: queryKeys.issues.runs(issueId),
    queryFn: () => activityApi.runsForIssue(issueId),
    enabled,
    refetchInterval: hasLiveRuns ? 5000 : false,
    placeholderData: keepPreviousDataForSameQueryTail<RunForIssue[]>(issueId),
  });
  const resolvedActivity = activity ?? [];
  const resolvedLinkedRuns = linkedRuns ?? [];

  const runningIssueRun = useMemo(
    () => resolveRunningIssueRun(resolvedActiveRun, resolvedLiveRuns),
    [resolvedActiveRun, resolvedLiveRuns],
  );
  const liveRunIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of resolvedLiveRuns) ids.add(run.id);
    if (resolvedActiveRun) ids.add(resolvedActiveRun.id);
    return ids;
  }, [resolvedActiveRun, resolvedLiveRuns]);
  const timelineRuns = useMemo(() => {
    const historicalRuns = liveRunIds.size === 0
      ? resolvedLinkedRuns
      : resolvedLinkedRuns.filter((run) => !liveRunIds.has(run.runId));
    return historicalRuns.map((run) => ({
      ...run,
      adapterType: run.adapterType,
      hasStoredOutput: (run.logBytes ?? 0) > 0,
    }));
  }, [liveRunIds, resolvedLinkedRuns]);
  const commentsWithRunMeta = useMemo<IssueChatControllerComment[]>(() => {
    const activeRunStartedAt = runningIssueRun?.startedAt ?? runningIssueRun?.createdAt ?? null;
    const runMetaByCommentId = new Map<string, { runId: string; runAgentId: string | null; interruptedRunId: string | null }>();
    const followUpCommentIds = new Set<string>();
    const agentIdByRunId = new Map<string, string>();

    for (const run of resolvedLinkedRuns) {
      agentIdByRunId.set(run.runId, run.agentId);
    }
    for (const evt of resolvedActivity) {
      if (evt.action !== "issue.comment_added" || !evt.runId) continue;
      const details = evt.details ?? {};
      const commentId = typeof details["commentId"] === "string" ? details["commentId"] : null;
      if (!commentId || runMetaByCommentId.has(commentId)) continue;
      const interruptedRunId =
        typeof details["interruptedRunId"] === "string" ? details["interruptedRunId"] : null;
      runMetaByCommentId.set(commentId, {
        runId: evt.runId,
        runAgentId: evt.agentId ?? agentIdByRunId.get(evt.runId) ?? null,
        interruptedRunId,
      });
    }
    for (const evt of resolvedActivity) {
      if (evt.action !== "issue.comment_added") continue;
      const details = evt.details ?? {};
      const commentId = typeof details["commentId"] === "string" ? details["commentId"] : null;
      if (!commentId) continue;
      if (details["followUpRequested"] === true || details["resumeIntent"] === true) {
        followUpCommentIds.add(commentId);
      }
    }

    return comments.map((comment) => {
      const meta = runMetaByCommentId.get(comment.id);
      const nextComment: IssueChatControllerComment = meta ? { ...comment, ...meta } : { ...comment };
      if (followUpCommentIds.has(comment.id)) {
        nextComment.followUpRequested = true;
      }
      const queuedTargetRunId = locallyQueuedCommentRunIds.get(comment.id) ?? null;
      const locallyQueuedComment = applyLocalQueuedIssueCommentState(nextComment, {
        queuedTargetRunId,
        targetRunIsLive: queuedTargetRunId ? liveRunIds.has(queuedTargetRunId) : false,
        runningRunId: runningIssueRun?.id ?? null,
      });
      if (locallyQueuedComment !== nextComment) {
        return locallyQueuedComment as IssueChatControllerComment;
      }
      if (
        isQueuedIssueComment({
          comment: nextComment,
          activeRunStartedAt,
          activeRunAgentId: runningIssueRun?.agentId ?? null,
          activeRunCommentId: runningIssueRun?.contextCommentId ?? null,
          activeRunWakeCommentId: runningIssueRun?.contextWakeCommentId ?? null,
          runId: meta?.runId ?? nextComment.runId ?? null,
          interruptedRunId: meta?.interruptedRunId ?? nextComment.interruptedRunId ?? null,
        })
      ) {
        return {
          ...nextComment,
          queueState: "queued" as const,
          queueTargetRunId: runningIssueRun?.id ?? nextComment.queueTargetRunId ?? null,
          queueReason: queuedCommentReason,
        };
      }
      return nextComment;
    });
  }, [
    comments,
    liveRunIds,
    locallyQueuedCommentRunIds,
    queuedCommentReason,
    resolvedActivity,
    resolvedLinkedRuns,
    runningIssueRun,
  ]);
  const timelineEvents = useMemo(
    () => extractIssueTimelineEvents(resolvedActivity),
    [resolvedActivity],
  );

  return {
    commentsWithRunMeta,
    timelineEvents,
    timelineRuns,
    resolvedLiveRuns,
    resolvedActiveRun,
    runningIssueRun,
  };
}
