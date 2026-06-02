import { describe, expect, it } from "vitest";
import { parseDirectOpenRouterJsonl } from "./parse.js";

describe("parseDirectOpenRouterJsonl", () => {
  it("collects assistant text, usage, and result metadata", () => {
    const raw = [
      JSON.stringify({ type: "assistant_message", text: "hello" }),
      JSON.stringify({ type: "usage", input_tokens: 10, output_tokens: 4, cached_input_tokens: 3, cost_usd: 0.0012 }),
      JSON.stringify({
        type: "result",
        summary: "done",
        provider: "openrouter",
        model: "openai/gpt-5-mini",
        session_id: "pc:1:2:issue:3",
        session_params: { sessionId: "pc:1:2:issue:3", messages: [] },
      }),
    ].join("\n");

    const parsed = parseDirectOpenRouterJsonl(raw);
    expect(parsed.messages).toEqual(["hello"]);
    expect(parsed.summary).toBe("done");
    expect(parsed.model).toBe("openai/gpt-5-mini");
    expect(parsed.sessionId).toBe("pc:1:2:issue:3");
    expect(parsed.usage.inputTokens).toBe(10);
    expect(parsed.usage.cachedInputTokens).toBe(3);
  });
});
