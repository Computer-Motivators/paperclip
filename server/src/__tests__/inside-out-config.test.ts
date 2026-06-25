import { describe, expect, it } from "vitest";
import {
  generateInsideOutPullToken,
  parseInsideOutAdapterConfig,
  ensureInsideOutAdapterConfig,
} from "../services/inside-out.js";

describe("inside-out config helpers", () => {
  it("generates a pull token when missing", () => {
    const next = ensureInsideOutAdapterConfig({});
    expect(typeof next.pullToken).toBe("string");
    expect(String(next.pullToken).startsWith("pcio_")).toBe(true);
  });

  it("parses defaults", () => {
    const parsed = parseInsideOutAdapterConfig({
      pullToken: generateInsideOutPullToken(),
      onLeaseExpiry: "fail",
    });
    expect(parsed.onLeaseExpiry).toBe("fail");
    expect(parsed.queueTimeoutSec).toBeGreaterThan(0);
  });
});
