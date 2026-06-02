import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issues } from "@paperclipai/db/schema";
import type { BoardChatState, Issue } from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";
import { agentService } from "./agents.js";
import { issueService } from "./issues.js";

const BOARD_CHAT_ORIGIN_KIND = "board_chat";

async function readBoardChatIssueId(db: Db, companyId: string, userId: string): Promise<string | null> {
  const row = await db
    .select({ id: issues.id })
    .from(issues)
    .where(
      and(
        eq(issues.companyId, companyId),
        eq(issues.originKind, BOARD_CHAT_ORIGIN_KIND),
        eq(issues.originId, userId),
        isNotNull(issues.hiddenAt),
        ne(issues.status, "cancelled"),
      ),
    )
    .orderBy(desc(issues.updatedAt), desc(issues.createdAt))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  return row?.id ?? null;
}

export function boardChatService(db: Db) {
  const issuesSvc = issueService(db);
  const agentsSvc = agentService(db);

  async function resolveAgent(companyId: string, agentId: string | null) {
    if (!agentId) return null;
    const agent = await agentsSvc.getById(agentId);
    if (!agent || agent.companyId !== companyId || agent.status === "terminated") return null;
    return agent;
  }

  async function assertRunnableAgent(companyId: string, agentId: string) {
    const agent = await agentsSvc.getById(agentId);
    if (!agent || agent.companyId !== companyId) throw notFound("Agent not found");
    if (agent.status === "terminated") throw unprocessable("Terminated agents cannot be selected for chat");
    return agent;
  }

  async function buildState(companyId: string, issue: Issue | null): Promise<BoardChatState> {
    if (!issue) return { issue: null, agent: null };
    return { issue, agent: await resolveAgent(companyId, issue.assigneeAgentId ?? null) };
  }

  async function get(companyId: string, userId: string): Promise<BoardChatState> {
    const issueId = await readBoardChatIssueId(db, companyId, userId);
    if (!issueId) return { issue: null, agent: null };
    const issue = await issuesSvc.getById(issueId);
    if (!issue || issue.companyId !== companyId) return { issue: null, agent: null };
    return buildState(companyId, issue);
  }

  async function updateAssignee(companyId: string, issueId: string, agentId: string): Promise<BoardChatState> {
    await assertRunnableAgent(companyId, agentId);
    const updated = await issuesSvc.update(issueId, {
      assigneeAgentId: agentId,
      assigneeUserId: null,
      status: "in_progress",
    });
    if (!updated || updated.companyId !== companyId) throw notFound("Issue not found");
    return buildState(companyId, updated);
  }

  async function ensure(companyId: string, userId: string, agentId: string): Promise<BoardChatState> {
    await assertRunnableAgent(companyId, agentId);
    const existingIssueId = await readBoardChatIssueId(db, companyId, userId);
    if (existingIssueId) {
      return updateAssignee(companyId, existingIssueId, agentId);
    }
    try {
      const issue = await issuesSvc.create(companyId, {
        title: "Chat",
        description: null,
        status: "in_progress",
        priority: "medium",
        workMode: "standard",
        assigneeAgentId: agentId,
        assigneeUserId: null,
        createdByUserId: userId,
        originKind: BOARD_CHAT_ORIGIN_KIND,
        originId: userId,
        originFingerprint: `board_chat:${companyId}:${userId}`,
        hiddenAt: new Date(),
      });
      return buildState(companyId, issue);
    } catch (error) {
      const maybe = error as { code?: string; constraint?: string; message?: string };
      const conflict = maybe.code === "23505"
        && (
          maybe.constraint === "issues_active_board_chat_uq"
          || typeof maybe.message === "string" && maybe.message.includes("issues_active_board_chat_uq")
        );
      if (!conflict) throw error;
      const racedIssueId = await readBoardChatIssueId(db, companyId, userId);
      if (!racedIssueId) throw error;
      return updateAssignee(companyId, racedIssueId, agentId);
    }
  }

  async function updateAgent(companyId: string, userId: string, agentId: string): Promise<BoardChatState> {
    const issueId = await readBoardChatIssueId(db, companyId, userId);
    if (!issueId) throw notFound("Board chat not found");
    return updateAssignee(companyId, issueId, agentId);
  }

  return { get, ensure, updateAgent };
}
