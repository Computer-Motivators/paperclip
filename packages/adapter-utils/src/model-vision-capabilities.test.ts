import { describe, expect, it } from "vitest";
import {
  parseOpenRouterModelCapabilities,
  resolveOpenAiCodexImageInputSupport,
  resolveOpenRouterImageInputSupportFromCapabilities,
} from "./model-vision-capabilities.js";

describe("model-vision-capabilities", () => {
  it("parses OpenRouter architecture input modalities", () => {
    const parsed = parseOpenRouterModelCapabilities({
      id: "openai/gpt-5.4",
      name: "GPT-5.4",
      architecture: {
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
      },
    });

    expect(parsed).toMatchObject({
      id: "openai/gpt-5.4",
      supportsImageInput: true,
      inputModalities: ["text", "image"],
    });
  });

  it("resolves OpenRouter support from capability list with fallback", () => {
    const capabilities = [
      {
        id: "openai/gpt-5.4",
        label: "openai/gpt-5.4",
        supportsImageInput: true,
        inputModalities: ["text", "image"],
      },
    ];

    expect(
      resolveOpenRouterImageInputSupportFromCapabilities("openai/gpt-5.4", capabilities, []),
    ).toBe(true);
    expect(
      resolveOpenRouterImageInputSupportFromCapabilities("unknown/model", capabilities, [
        { id: "unknown/model", label: "unknown/model", supportsImageInput: true },
      ]),
    ).toBe(true);
    expect(
      resolveOpenRouterImageInputSupportFromCapabilities("unknown/model", capabilities, []),
    ).toBeNull();
  });

  it("heuristically resolves OpenAI Codex vision support", () => {
    expect(resolveOpenAiCodexImageInputSupport("gpt-5.3-codex", [])).toBe(true);
    expect(resolveOpenAiCodexImageInputSupport("gpt-5-nano", [])).toBe(true);
    expect(resolveOpenAiCodexImageInputSupport("text-embedding-3-small", [])).toBe(false);
  });
});
