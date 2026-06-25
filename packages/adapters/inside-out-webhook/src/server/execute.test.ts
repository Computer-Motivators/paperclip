import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";
import {
  registerInsideOutClaimStore,
  resetInsideOutClaimStoreForTests,
} from "./claim-store.js";
import { execute } from "./execute.js";

function buildCtx(overrides: Partial<AdapterExecutionContext> = {}): AdapterExecutionContext {
  return {
    runId: "run-1",
    agent: {
      id: "agent-1",
      companyId: "company-1",
      name: "Worker",
      adapterType: "inside_out_webhook",
      adapterConfig: { queueTimeoutSec: 1 },
    },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: { queueTimeoutSec: 1 },
    context: { issueId: "issue-1" },
    onLog: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("inside_out_webhook execute", () => {
  beforeEach(() => {
    resetInsideOutClaimStoreForTests();
  });

  afterEach(() => {
    resetInsideOutClaimStoreForTests();
  });

  it("completes when the claim store reports completion", async () => {
    let created = false;
    registerInsideOutClaimStore({
      async createClaim() {
        created = true;
      },
      async getClaim(runId) {
        if (!created) return null;
        return {
          status: "completed",
          completionOutcome: "succeeded",
          completionSummary: "done",
          claimedBy: "cron-1",
        };
      },
      async getRunStatus() {
        return "running";
      },
    });

    const result = await execute(buildCtx());
    expect(result.exitCode).toBe(0);
    expect(result.summary).toBe("done");
  });

  it("times out when no worker claims within queueTimeoutSec", async () => {
    registerInsideOutClaimStore({
      async createClaim() {},
      async getClaim() {
        return { status: "awaiting_pickup" };
      },
      async getRunStatus() {
        return "running";
      },
    });

    const result = await execute(buildCtx({ config: { queueTimeoutSec: 0 } }));
    expect(result.timedOut).toBe(true);
    expect(result.errorCode).toBe("timeout");
  });
});
