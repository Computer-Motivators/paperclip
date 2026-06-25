import { describe, expect, it } from "vitest";
import { resolveHeartbeatRunTimeoutPolicy } from "../services/heartbeat-stop-metadata.js";

describe("inside_out_webhook timeout policy", () => {
  it("uses queueTimeoutSec for effective timeout", () => {
    const policy = resolveHeartbeatRunTimeoutPolicy("inside_out_webhook", {
      queueTimeoutSec: 7200,
    });
    expect(policy.effectiveTimeoutSec).toBe(7200);
    expect(policy.timeoutConfigured).toBe(true);
    expect(policy.timeoutSource).toBe("config");
  });

  it("defaults queue timeout when unset", () => {
    const policy = resolveHeartbeatRunTimeoutPolicy("inside_out_webhook", {});
    expect(policy.effectiveTimeoutSec).toBe(86_400);
    expect(policy.timeoutSource).toBe("default");
  });
});
