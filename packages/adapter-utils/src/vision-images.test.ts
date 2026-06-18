import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stageVisionImages } from "./vision-images.js";

describe("stageVisionImages", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("stages workspace-relative image files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-vision-"));
    tempDirs.push(root);
    const pngPath = path.join(root, "sample.png");
    await fs.writeFile(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    const result = await stageVisionImages({
      refs: [
        {
          workspaceRelativePath: "sample.png",
          source: "explicit_context",
          contentType: "image/png",
        },
      ],
      runId: "run-1",
      cwd: root,
      workspaceRoot: root,
      maxImages: 8,
      maxBytes: 1024 * 1024,
    });

    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]?.mimeType).toBe("image/png");
    expect(result.staged[0]?.localPath).toContain(".paperclip/vision-staging/run-1");
  });
});
