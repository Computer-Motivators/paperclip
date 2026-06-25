import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, heartbeatRuns, insideOutRunClaims } from "@paperclipai/db";
import {
  INSIDE_OUT_DEFAULT_HEARTBEAT_INTERVAL_SEC,
  INSIDE_OUT_DEFAULT_MAX_LEASE_SEC,
  INSIDE_OUT_DEFAULT_MAX_REQUEUE_ATTEMPTS,
  INSIDE_OUT_DEFAULT_QUEUE_TIMEOUT_SEC,
  INSIDE_OUT_DEFAULT_WORK_LEASE_SEC,
  INSIDE_OUT_PROTOCOL_VERSION,
  type InsideOutClaimStatus,
  type InsideOutCompletionOutcome,
  type InsideOutLeaseExpiryPolicy,
  isAgentInvokable,
} from "@paperclipai/shared";
import { conflict, forbidden, notFound, unprocessable } from "../errors.js";
import { createLocalAgentJwt } from "../agent-auth-jwt.js";
import { issueService } from "./issues.js";
import { DEFAULT_INSIDE_OUT_SYSTEM_PROMPT } from "./inside-out-defaults.js";

export interface InsideOutAdapterConfig {
  pullToken: string;
  queueTimeoutSec: number;
  workLeaseSec: number;
  maxLeaseSec: number;
  heartbeatIntervalSec: number;
  onLeaseExpiry: InsideOutLeaseExpiryPolicy;
  maxRequeueAttempts: number;
  externalAgentIdHeader: string;
  promptTemplate: string;
  includeInstructionsBundle: boolean;
  includeMcpManifest: boolean;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return fallback;
}

function readPositiveInt(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === "number" ? value : Number(typeof value === "string" ? value.trim() : NaN);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

export function generateInsideOutPullToken(): string {
  return `pcio_${randomBytes(24).toString("hex")}`;
}

export function parseInsideOutAdapterConfig(raw: unknown): InsideOutAdapterConfig {
  const config = isPlainRecord(raw) ? raw : {};
  return {
    pullToken: readString(config.pullToken, ""),
    queueTimeoutSec: readPositiveInt(config.queueTimeoutSec, INSIDE_OUT_DEFAULT_QUEUE_TIMEOUT_SEC, 604_800),
    workLeaseSec: readPositiveInt(config.workLeaseSec, INSIDE_OUT_DEFAULT_WORK_LEASE_SEC, 86_400),
    maxLeaseSec: readPositiveInt(config.maxLeaseSec, INSIDE_OUT_DEFAULT_MAX_LEASE_SEC, 604_800),
    heartbeatIntervalSec: readPositiveInt(
      config.heartbeatIntervalSec,
      INSIDE_OUT_DEFAULT_HEARTBEAT_INTERVAL_SEC,
      86_400,
    ),
    onLeaseExpiry: config.onLeaseExpiry === "fail" ? "fail" : "requeue",
    maxRequeueAttempts: readPositiveInt(config.maxRequeueAttempts, INSIDE_OUT_DEFAULT_MAX_REQUEUE_ATTEMPTS, 100),
    externalAgentIdHeader: readString(config.externalAgentIdHeader, "X-External-Agent-Id"),
    promptTemplate: readString(config.promptTemplate, DEFAULT_INSIDE_OUT_SYSTEM_PROMPT),
    includeInstructionsBundle: readBoolean(config.includeInstructionsBundle, true),
    includeMcpManifest: readBoolean(config.includeMcpManifest, true),
  };
}

export function ensureInsideOutAdapterConfig(raw: unknown): Record<string, unknown> {
  const existing = isPlainRecord(raw) ? { ...raw } : {};
  const parsed = parseInsideOutAdapterConfig(existing);
  if (!parsed.pullToken) {
    existing.pullToken = generateInsideOutPullToken();
  }
  return existing;
}

function safeCompareTokens(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function parseObject(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export type InsideOutClaimRow = typeof insideOutRunClaims.$inferSelect;
export type InsideOutRunRow = typeof heartbeatRuns.$inferSelect;

export interface InsideOutWorkManifest {
  protocolVersion: typeof INSIDE_OUT_PROTOCOL_VERSION;
  runId: string;
  agent: { id: string; name: string; companyId: string };
  leaseExpiresAt: string;
  wake: Record<string, unknown>;
  endpoints: {
    heartbeatContext: string;
    checkout: string;
    complete: string;
    heartbeat: string;
    release: string;
    bootstrap: string;
  };
  auth: {
    apiUrl: string;
    runHeader: string;
    runId: string;
    apiKey?: string | null;
  };
  guidance: {
    paperclipSkillPath: string;
    mcpServer: string;
    systemPrompt: string;
    heartbeatIntervalSec: number;
  };
  instructionsBundleUrl?: string | null;
}

export function insideOutService(db: Db) {
  const issuesSvc = issueService(db);

  async function getAgent(agentId: string) {
    return db.select().from(agents).where(eq(agents.id, agentId)).then((rows) => rows[0] ?? null);
  }

  async function getRun(runId: string) {
    return db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, runId)).then((rows) => rows[0] ?? null);
  }

  async function getClaim(runId: string) {
    return db
      .select()
      .from(insideOutRunClaims)
      .where(eq(insideOutRunClaims.runId, runId))
      .then((rows) => rows[0] ?? null);
  }

  async function createClaim(input: { runId: string; companyId: string; agentId: string }) {
    const now = new Date();
    const existing = await getClaim(input.runId);
    if (existing) return existing;

    const [created] = await db
      .insert(insideOutRunClaims)
      .values({
        runId: input.runId,
        companyId: input.companyId,
        agentId: input.agentId,
        status: "awaiting_pickup",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();

    if (created) return created;
    const row = await getClaim(input.runId);
    if (!row) throw new Error("Failed to create inside-out claim row");
    return row;
  }

  async function findAgentByPullToken(token: string) {
    if (!token) return null;
    const rows = await db
      .select()
      .from(agents)
      .where(eq(agents.adapterType, "inside_out_webhook"));
    for (const row of rows) {
      const config = parseInsideOutAdapterConfig(row.adapterConfig);
      if (config.pullToken && safeCompareTokens(config.pullToken, token)) {
        return row;
      }
    }
    return null;
  }

  async function resolveAgentFromBearerToken(token: string) {
    const byPull = await findAgentByPullToken(token);
    return byPull;
  }

  function assertInsideOutAgent(agent: typeof agents.$inferSelect) {
    if (agent.adapterType !== "inside_out_webhook") {
      throw unprocessable("Agent is not configured with the inside_out_webhook adapter");
    }
    if (!isAgentInvokable({ agent, agents: [agent] })) {
      throw forbidden("Agent is not invokable");
    }
  }

  function buildManifest(input: {
    run: InsideOutRunRow;
    agent: typeof agents.$inferSelect;
    companyName?: string | null;
    leaseExpiresAt: Date;
    apiBaseUrl: string;
    authToken?: string | null;
  }): InsideOutWorkManifest {
    const config = parseInsideOutAdapterConfig(input.agent.adapterConfig);
    const context = parseObject(input.run.contextSnapshot);
    const issueId = readNonEmptyString(context.issueId);
    const issuePath = issueId ? issueId : "{issueId}";
    const prompt = config.promptTemplate
      .replaceAll("{agentName}", input.agent.name)
      .replaceAll("{companyName}", input.companyName ?? input.agent.companyId)
      .replaceAll("{operatorInstructions}", "");

    return {
      protocolVersion: INSIDE_OUT_PROTOCOL_VERSION,
      runId: input.run.id,
      agent: {
        id: input.agent.id,
        name: input.agent.name,
        companyId: input.agent.companyId,
      },
      leaseExpiresAt: input.leaseExpiresAt.toISOString(),
      wake: {
        issueId: issueId ?? null,
        wakeReason: readNonEmptyString(context.wakeReason),
        paperclipWake: context.paperclipWake ?? null,
        context,
      },
      endpoints: {
        heartbeatContext: `/api/issues/${issuePath}/heartbeat-context`,
        checkout: `/api/issues/${issuePath}/checkout`,
        complete: `/api/inside-out/runs/${input.run.id}/complete`,
        heartbeat: `/api/inside-out/runs/${input.run.id}/heartbeat`,
        release: `/api/inside-out/runs/${input.run.id}/release`,
        bootstrap: `/api/inside-out/agents/${input.agent.id}/bootstrap`,
      },
      auth: {
        apiUrl: input.apiBaseUrl.replace(/\/$/, ""),
        runHeader: "X-Paperclip-Run-Id",
        runId: input.run.id,
        ...(input.authToken ? { apiKey: input.authToken } : {}),
      },
      guidance: {
        paperclipSkillPath: "skills/paperclip/SKILL.md",
        mcpServer: "npx -y @paperclipai/mcp-server",
        systemPrompt: prompt,
        heartbeatIntervalSec: config.heartbeatIntervalSec,
      },
      instructionsBundleUrl: config.includeInstructionsBundle
        ? `/api/agents/${input.agent.id}/instructions-bundle`
        : null,
    };
  }

  async function maybeAutoCheckout(input: {
    run: InsideOutRunRow;
    agent: typeof agents.$inferSelect;
  }) {
    const context = parseObject(input.run.contextSnapshot);
    const issueId = readNonEmptyString(context.issueId);
    if (!issueId) return;

    const issue = await issuesSvc.getById(issueId);
    if (!issue || issue.companyId !== input.agent.companyId) return;
    if (issue.assigneeAgentId !== input.agent.id) return;

    const readiness = await issuesSvc
      .listDependencyReadiness(input.agent.companyId, [issueId])
      .then((map) => map.get(issueId) ?? null);
    if (!readiness?.isDependencyReady) return;

    const status = issue.status;
    if (status !== "todo" && status !== "backlog" && status !== "blocked" && status !== "in_progress") {
      return;
    }

    try {
      await issuesSvc.checkout(issueId, input.agent.id, ["todo", "backlog", "blocked"], input.run.id);
    } catch (error) {
      if (error instanceof Error && "status" in error && (error as { status?: number }).status === 409) {
        return;
      }
      throw error;
    }
  }

  async function pullWork(input: {
    agentId: string;
    leaseSec?: number;
    externalAgentId?: string;
    preferRunId?: string | null;
    apiBaseUrl: string;
    companyName?: string | null;
  }): Promise<InsideOutWorkManifest | null> {
    const agent = await getAgent(input.agentId);
    if (!agent) throw notFound("Agent not found");
    assertInsideOutAgent(agent);

    const config = parseInsideOutAdapterConfig(agent.adapterConfig);
    const leaseSec = Math.min(
      input.leaseSec ?? config.workLeaseSec,
      config.maxLeaseSec,
    );
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseSec * 1000);
    const externalAgentId = input.externalAgentId ?? "external-agent";

    const manifest = await db.transaction(async (tx) => {
      const claimableStatuses: InsideOutClaimStatus[] = ["awaiting_pickup", "claimed"];
      const conditions = [
        eq(insideOutRunClaims.agentId, agent.id),
        inArray(insideOutRunClaims.status, claimableStatuses),
        eq(heartbeatRuns.status, "running"),
      ];

      const candidates = await tx
        .select({
          claim: insideOutRunClaims,
          run: heartbeatRuns,
        })
        .from(insideOutRunClaims)
        .innerJoin(heartbeatRuns, eq(heartbeatRuns.id, insideOutRunClaims.runId))
        .where(
          and(
            ...conditions,
            input.preferRunId
              ? eq(insideOutRunClaims.runId, input.preferRunId)
              : sql`true`,
          ),
        )
        .orderBy(asc(insideOutRunClaims.createdAt))
        .for("update");

      let selected: (typeof candidates)[number] | null = null;
      for (const row of candidates) {
        if (row.claim.status === "awaiting_pickup") {
          selected = row;
          break;
        }
        if (
          row.claim.status === "claimed" &&
          row.claim.leaseExpiresAt &&
          row.claim.leaseExpiresAt < now &&
          row.claim.requeueCount < config.maxRequeueAttempts
        ) {
          selected = row;
          break;
        }
      }

      if (!selected) return null;

      const [updatedClaim] = await tx
        .update(insideOutRunClaims)
        .set({
          status: "claimed",
          claimedBy: externalAgentId,
          claimedAt: now,
          leaseExpiresAt,
          lastHeartbeatAt: now,
          requeueCount:
            selected.claim.status === "claimed" && selected.claim.leaseExpiresAt && selected.claim.leaseExpiresAt < now
              ? selected.claim.requeueCount + 1
              : selected.claim.requeueCount,
          updatedAt: now,
        })
        .where(eq(insideOutRunClaims.runId, selected.claim.runId))
        .returning();

      if (!updatedClaim) return null;

      const run = selected.run;
      const authToken = createLocalAgentJwt(agent.id, agent.companyId, agent.adapterType, run.id);
      return buildManifest({
        run,
        agent,
        companyName: input.companyName,
        leaseExpiresAt,
        apiBaseUrl: input.apiBaseUrl,
        authToken,
      });
    });

    if (!manifest) return null;

    const run = await getRun(manifest.runId);
    if (run) {
      await maybeAutoCheckout({ run, agent });
      await db
        .update(heartbeatRuns)
        .set({
          lastOutputAt: new Date(),
          lastOutputStream: "stdout",
          updatedAt: new Date(),
        })
        .where(eq(heartbeatRuns.id, run.id));
    }

    return manifest;
  }

  async function assertActiveClaimHolder(input: {
    runId: string;
    agentId: string;
    externalAgentId?: string;
  }) {
    const claim = await getClaim(input.runId);
    if (!claim) throw notFound("Inside-out claim not found");
    if (claim.agentId !== input.agentId) throw forbidden("Claim belongs to a different agent");
    if (claim.status !== "claimed") {
      throw conflict("Run is not actively claimed");
    }
    if (claim.leaseExpiresAt && claim.leaseExpiresAt < new Date()) {
      throw conflict("Claim lease has expired");
    }
    if (input.externalAgentId && claim.claimedBy && claim.claimedBy !== input.externalAgentId) {
      throw conflict("Run is claimed by a different external worker");
    }
    return claim;
  }

  async function heartbeatClaim(input: {
    runId: string;
    agentId: string;
    leaseSec?: number;
    externalAgentId?: string;
    message?: string | null;
  }) {
    const agent = await getAgent(input.agentId);
    if (!agent) throw notFound("Agent not found");
    const config = parseInsideOutAdapterConfig(agent.adapterConfig);
    const claim = await assertActiveClaimHolder(input);
    const now = new Date();
    const requestedLease = input.leaseSec ?? config.workLeaseSec;
    const maxLeaseMs = config.maxLeaseSec * 1000;
    const nextExpiry = new Date(
      Math.min(now.getTime() + requestedLease * 1000, now.getTime() + maxLeaseMs),
    );

    await db
      .update(insideOutRunClaims)
      .set({
        leaseExpiresAt: nextExpiry,
        lastHeartbeatAt: now,
        updatedAt: now,
      })
      .where(eq(insideOutRunClaims.runId, claim.runId));

    await db
      .update(heartbeatRuns)
      .set({
        lastOutputAt: now,
        lastOutputStream: "stdout",
        updatedAt: now,
      })
      .where(eq(heartbeatRuns.id, claim.runId));

    return { leaseExpiresAt: nextExpiry.toISOString(), message: input.message ?? null };
  }

  async function completeClaim(input: {
    runId: string;
    agentId: string;
    outcome: InsideOutCompletionOutcome;
    summary?: string | null;
    resultJson?: Record<string, unknown> | null;
    externalAgentId?: string;
  }) {
    await assertActiveClaimHolder(input);
    const now = new Date();
    const [updated] = await db
      .update(insideOutRunClaims)
      .set({
        status: "completed",
        completionOutcome: input.outcome,
        completionSummary: input.summary ?? null,
        completionResultJson: input.resultJson ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(insideOutRunClaims.runId, input.runId),
          eq(insideOutRunClaims.status, "claimed"),
        ),
      )
      .returning();

    if (!updated) throw conflict("Unable to complete claim — run is not actively claimed");
    return updated;
  }

  async function releaseClaim(input: {
    runId: string;
    agentId: string;
    externalAgentId?: string;
    reason?: string | null;
  }) {
    await assertActiveClaimHolder(input);
    const now = new Date();
    const [updated] = await db
      .update(insideOutRunClaims)
      .set({
        status: "awaiting_pickup",
        claimedBy: null,
        claimedAt: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(insideOutRunClaims.runId, input.runId),
          eq(insideOutRunClaims.status, "claimed"),
        ),
      )
      .returning();

    if (!updated) throw conflict("Unable to release claim");
    return updated;
  }

  async function sweepExpiredLeases() {
    const now = new Date();
    const expired = await db
      .select({
        claim: insideOutRunClaims,
        agent: agents,
        run: heartbeatRuns,
      })
      .from(insideOutRunClaims)
      .innerJoin(agents, eq(agents.id, insideOutRunClaims.agentId))
      .innerJoin(heartbeatRuns, eq(heartbeatRuns.id, insideOutRunClaims.runId))
      .where(
        and(
          eq(insideOutRunClaims.status, "claimed"),
          lt(insideOutRunClaims.leaseExpiresAt, now),
          eq(heartbeatRuns.status, "running"),
        ),
      );

    let requeued = 0;
    let failed = 0;

    for (const row of expired) {
      const config = parseInsideOutAdapterConfig(row.agent.adapterConfig);
      const nextRequeueCount = row.claim.requeueCount + 1;
      const shouldFail =
        config.onLeaseExpiry === "fail" || nextRequeueCount >= config.maxRequeueAttempts;

      if (shouldFail) {
        await db
          .update(insideOutRunClaims)
          .set({
            status: "completed",
            completionOutcome: "failed",
            completionSummary: "External worker lease expired",
            completionResultJson: { errorCode: "lease_expired" },
            updatedAt: now,
          })
          .where(eq(insideOutRunClaims.runId, row.claim.runId));
        failed += 1;
        continue;
      }

      await db
        .update(insideOutRunClaims)
        .set({
          status: "awaiting_pickup",
          claimedBy: null,
          claimedAt: null,
          leaseExpiresAt: null,
          lastHeartbeatAt: null,
          requeueCount: nextRequeueCount,
          updatedAt: now,
        })
        .where(eq(insideOutRunClaims.runId, row.claim.runId));
      requeued += 1;
    }

    return { requeued, failed, scanned: expired.length };
  }

  async function getBootstrap(agentId: string, apiBaseUrl: string) {
    const agent = await getAgent(agentId);
    if (!agent) throw notFound("Agent not found");
    assertInsideOutAgent(agent);
    const config = parseInsideOutAdapterConfig(agent.adapterConfig);
    const pending = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(insideOutRunClaims)
      .innerJoin(heartbeatRuns, eq(heartbeatRuns.id, insideOutRunClaims.runId))
      .where(
        and(
          eq(insideOutRunClaims.agentId, agentId),
          inArray(insideOutRunClaims.status, ["awaiting_pickup", "claimed"]),
          eq(heartbeatRuns.status, "running"),
        ),
      )
      .then((rows) => rows[0]?.count ?? 0);

    return {
      protocolVersion: INSIDE_OUT_PROTOCOL_VERSION,
      agent: { id: agent.id, name: agent.name, companyId: agent.companyId },
      endpoints: {
        pull: "/api/inside-out/pull",
        bootstrap: `/api/inside-out/agents/${agent.id}/bootstrap`,
      },
      config: {
        workLeaseSec: config.workLeaseSec,
        queueTimeoutSec: config.queueTimeoutSec,
        heartbeatIntervalSec: config.heartbeatIntervalSec,
        externalAgentIdHeader: config.externalAgentIdHeader,
        includeInstructionsBundle: config.includeInstructionsBundle,
        includeMcpManifest: config.includeMcpManifest,
      },
      pendingRunCount: pending,
      auth: {
        apiUrl: apiBaseUrl.replace(/\/$/, ""),
        pullTokenConfigured: Boolean(config.pullToken),
      },
      guidance: {
        paperclipSkillPath: "skills/paperclip/SKILL.md",
        mcpServer: config.includeMcpManifest ? "npx -y @paperclipai/mcp-server" : null,
        systemPrompt: config.promptTemplate
          .replaceAll("{agentName}", agent.name)
          .replaceAll("{companyName}", agent.companyId),
      },
    };
  }

  return {
    parseInsideOutAdapterConfig,
    ensureInsideOutAdapterConfig,
    generateInsideOutPullToken,
    resolveAgentFromBearerToken,
    safeCompareTokens,
    createClaim,
    getClaim,
    getRun,
    pullWork,
    heartbeatClaim,
    completeClaim,
    releaseClaim,
    sweepExpiredLeases,
    getBootstrap,
    buildManifest,
  };
}
