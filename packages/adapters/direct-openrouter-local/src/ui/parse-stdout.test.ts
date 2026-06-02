import { describe, expect, it } from "vitest";
import { parseDirectOpenRouterStdoutLine } from "./parse-stdout.js";

describe("parseDirectOpenRouterStdoutLine", () => {
  it("parses assistant output lines", () => {
    const out = parseDirectOpenRouterStdoutLine(
      JSON.stringify({ type: "assistant_message", text: "ok" }),
      "2026-01-01T00:00:00.000Z",
    );
    expect(out).toEqual([{ kind: "assistant", ts: "2026-01-01T00:00:00.000Z", text: "ok" }]);
  });

  it("parses usage events", () => {
    const out = parseDirectOpenRouterStdoutLine(
      JSON.stringify({ type: "usage", input_tokens: 2, output_tokens: 3, cached_input_tokens: 1, cost_usd: 0.004 }),
      "2026-01-01T00:00:00.000Z",
    );
    expect(out[0]?.kind).toBe("system");
    expect(out[0]?.text).toContain("cached=1");
  });
});
