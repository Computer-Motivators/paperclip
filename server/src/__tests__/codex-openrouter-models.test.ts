import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CODEX_OPENROUTER_LOCAL_MODEL,
  models as codexOpenRouterFallbackModels,
} from "@computermotivators/adapter-codex-openrouter-local";
import {
  listCodexOpenRouterModels,
  resetCodexOpenRouterModelsCacheForTests,
} from "../adapters/codex-openrouter-models.js";

describe("codex openrouter model listing", () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    resetCodexOpenRouterModelsCacheForTests();
    vi.restoreAllMocks();
  });

  it("returns fallback models when no OpenRouter key is available", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const models = await listCodexOpenRouterModels();

    expect(models).toHaveLength(codexOpenRouterFallbackModels.length);
    for (const fallback of codexOpenRouterFallbackModels) {
      expect(models).toContainEqual(fallback);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loads OpenRouter models and merges fallback options", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "openai/gpt-5.3-codex", name: "GPT-5.3 Codex", architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] } },
          { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] } },
        ],
      }),
    } as Response);

    const first = await listCodexOpenRouterModels();
    const second = await listCodexOpenRouterModels();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.some((model) => model.id === "openai/gpt-5.3-codex")).toBe(true);
    expect(first.some((model) => model.id === DEFAULT_CODEX_OPENROUTER_LOCAL_MODEL)).toBe(true);
    expect(first.some((model) => model.id === "anthropic/claude-sonnet-4")).toBe(false);
    expect(first.find((model) => model.id === "openai/gpt-5.3-codex")?.supportsImageInput).toBe(true);
  });
});
