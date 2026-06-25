import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  INSIDE_OUT_DEFAULT_QUEUE_TIMEOUT_SEC,
  type InsideOutCompletionOutcome,
} from "@paperclipai/shared";
import { asNumber } from "@paperclipai/adapter-utils/server-utils";
import { getInsideOutClaimStore } from "./claim-store.js";

const TERMINAL_RUN_STATUSES = new Set(["succeeded", "failed", "cancelled", "timed_out"]);
const POLL_INTERVAL_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildResultFromClaim(input: {
  outcome: InsideOutCompletionOutcome;
  summary?: string | null;
  resultJson?: Record<string, unknown> | null;
}): AdapterExecutionResult {
  const succeeded = input.outcome === "succeeded";
  return {
    exitCode: succeeded ? 0 : 1,
    signal: null,
    timedOut: false,
    errorMessage: succeeded ? null : input.summary ?? "External worker reported failure",
    summary: input.summary ?? (succeeded ? "Inside-out work completed" : "Inside-out work failed"),
    resultJson: {
      insideOut: true,
      ...(input.resultJson ?? {}),
    },
  };
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, config, context, onLog } = ctx;
  const store = getInsideOutClaimStore();
  const queueTimeoutSec = Math.max(0, asNumber(config.queueTimeoutSec, INSIDE_OUT_DEFAULT_QUEUE_TIMEOUT_SEC));

  await store.createClaim({
    runId,
    companyId: agent.companyId,
    agentId: agent.id,
  });

  await onLog(
    "stdout",
    `${JSON.stringify({
      type: "inside_out_queued",
      runId,
      issueId: typeof context.issueId === "string" ? context.issueId : null,
      wakeReason: typeof context.wakeReason === "string" ? context.wakeReason : null,
    })}\n`,
  );

  const deadline = Date.now() + queueTimeoutSec * 1000;

  while (Date.now() < deadline) {
    const runStatus = await store.getRunStatus(runId);
    if (runStatus && TERMINAL_RUN_STATUSES.has(runStatus)) {
      if (runStatus === "cancelled") {
        return {
          exitCode: null,
          signal: null,
          timedOut: false,
          errorMessage: "Run cancelled",
          errorCode: "cancelled",
        };
      }
      if (runStatus === "timed_out") {
        return {
          exitCode: null,
          signal: null,
          timedOut: true,
          errorMessage: "Run timed out before external worker completed",
          errorCode: "timeout",
        };
      }
    }

    const claim = await store.getClaim(runId);
    if (claim?.status === "completed" && claim.completionOutcome) {
      await onLog(
        "stdout",
        `${JSON.stringify({
          type: "inside_out_complete",
          runId,
          outcome: claim.completionOutcome,
          summary: claim.completionSummary ?? null,
          claimedBy: claim.claimedBy ?? null,
        })}\n`,
      );
      return buildResultFromClaim({
        outcome: claim.completionOutcome,
        summary: claim.completionSummary,
        resultJson: claim.completionResultJson ?? undefined,
      });
    }

    if (claim?.status === "claimed" && claim.claimedBy) {
      await onLog(
        "stdout",
        `${JSON.stringify({
          type: "inside_out_claimed",
          runId,
          claimedBy: claim.claimedBy,
        })}\n`,
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return {
    exitCode: null,
    signal: null,
    timedOut: true,
    errorMessage: `No external agent claimed work within ${queueTimeoutSec}s`,
    errorCode: "timeout",
    summary: "Inside-out queue timeout",
  };
}
