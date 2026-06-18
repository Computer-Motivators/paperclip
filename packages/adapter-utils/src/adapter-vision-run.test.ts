import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareAdapterVisionRun } from "./adapter-vision-run.js";

describe("prepareAdapterVisionRun", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  async function makeWorkspace() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-vision-run-"));
    tempDirs.push(dir);
    return dir;
  }

  it("merges workspace queue refs when vision is enabled", async () => {
    const workspace = await makeWorkspace();
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await fs.mkdir(path.join(workspace, "tmp"), { recursive: true });
    await fs.writeFile(path.join(workspace, "tmp", "shot.png"), pngBytes);
    await fs.mkdir(path.join(workspace, ".paperclip"), { recursive: true });
    await fs.writeFile(
      path.join(workspace, ".paperclip", "vision-queue.json"),
      JSON.stringify({ images: [{ workspaceRelativePath: "tmp/shot.png" }] }),
      "utf8",
    );

    const result = await prepareAdapterVisionRun({
      config: { visionMode: "auto", model: "gpt-5.4" },
      context: {},
      runId: "run-1",
      cwd: workspace,
      workspaceRoot: workspace,
      modelId: "gpt-5.4",
      provider: "openai_codex",
      fallbackModels: [{ id: "gpt-5.4", label: "gpt-5.4", supportsImageInput: true }],
    });

    expect(result.enabled).toBe(true);
    expect(result.imagePaths).toHaveLength(1);
    expect(result.refs.some((ref) => ref.source === "workspace_queue")).toBe(true);
  });

  it("skips vision on resume delta when attachOnResume is false", async () => {
    const workspace = await makeWorkspace();
    const result = await prepareAdapterVisionRun({
      config: { visionMode: "auto", visionAttachOnResume: false },
      context: {
        paperclipVisionImages: [
          {
            attachmentId: "11111111-1111-4111-8111-111111111111",
            source: "explicit_context",
          },
        ],
      },
      runId: "run-1",
      cwd: workspace,
      workspaceRoot: workspace,
      modelId: "gpt-5.4",
      provider: "openai_codex",
      fallbackModels: [{ id: "gpt-5.4", label: "gpt-5.4", supportsImageInput: true }],
      isResumeDelta: true,
    });

    expect(result.enabled).toBe(false);
    expect(result.notes.join(" ")).toContain("Skipped vision image attachment for resumed session wake delta");
  });
});
