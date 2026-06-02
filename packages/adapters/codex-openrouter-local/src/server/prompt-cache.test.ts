import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

describe("codex-openrouter prompt bundle key stability", () => {
  it("produces stable keys for identical instruction and skill fingerprints", () => {
    const hashA = createHash("sha256");
    hashA.update("paperclip-codex-openrouter-prompt-bundle:v1\n");
    hashA.update("instructions\n");
    hashA.update("same instructions\n");
    hashA.update("skill:paperclip:paperclip\n");
    hashA.update("file:paperclip\n");
    hashA.update("content\n");

    const hashB = createHash("sha256");
    hashB.update("paperclip-codex-openrouter-prompt-bundle:v1\n");
    hashB.update("instructions\n");
    hashB.update("same instructions\n");
    hashB.update("skill:paperclip:paperclip\n");
    hashB.update("file:paperclip\n");
    hashB.update("content\n");

    expect(hashA.digest("hex")).toBe(hashB.digest("hex"));
  });

  it("changes keys when instructions change", () => {
    const base = (instructions: string) => {
      const hash = createHash("sha256");
      hash.update("paperclip-codex-openrouter-prompt-bundle:v1\n");
      hash.update("instructions\n");
      hash.update(instructions);
      hash.update("\n");
      return hash.digest("hex");
    };

    expect(base("alpha")).not.toBe(base("beta"));
  });
});
