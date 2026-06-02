import { describe, expect, it } from "vitest";
import { estimateOpenRouterCostUsd } from "./openrouter-pricing.js";

describe("estimateOpenRouterCostUsd", () => {
  const pricing = {
    promptPerToken: 0.00000075,
    completionPerToken: 0.0000045,
    cacheReadPerToken: 0.000000075,
    internalReasoningPerToken: 0,
    requestPerCall: 0,
  };

  it("charges uncached input, cache reads, and completion separately", () => {
    const cost = estimateOpenRouterCostUsd(
      "openai/gpt-5.4-mini",
      {
        inputTokens: 161_563,
        cachedInputTokens: 156_672,
        outputTokens: 821,
      },
      pricing,
    );

    expect(cost).toBeCloseTo(0.01911315, 8);
  });

  it("returns zero when there is no usage", () => {
    expect(
      estimateOpenRouterCostUsd(
        "openai/gpt-5.4-mini",
        { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
        pricing,
      ),
    ).toBe(0);
  });

  it("accounts for request and internal reasoning pricing", () => {
    const cost = estimateOpenRouterCostUsd(
      "openai/gpt-5.4-mini",
      {
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 50,
        reasoningTokens: 30,
        requestCount: 2,
      },
      {
        ...pricing,
        internalReasoningPerToken: 0.0000009,
        requestPerCall: 0.0001,
      },
    );
    expect(cost).toBeCloseTo(0.000527, 9);
  });
});
