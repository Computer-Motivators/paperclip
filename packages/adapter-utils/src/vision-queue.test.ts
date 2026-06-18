import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearVisionQueueEntries,
  dedupeVisionRefs,
  mergeVisionRefs,
  readVisionQueueRefs,
  visionQueuePath,
} from "./vision-queue.js";

describe("vision queue", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  async function makeWorkspace() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-vision-queue-"));
    tempDirs.push(dir);
    return dir;
  }

  it("reads workspace queue refs", async () => {
    const workspace = await makeWorkspace();
    const queuePath = visionQueuePath(workspace);
    await fs.mkdir(path.dirname(queuePath), { recursive: true });
    await fs.writeFile(
      queuePath,
      JSON.stringify({
        images: [{ workspaceRelativePath: "tmp/a.png", label: "download" }],
      }),
      "utf8",
    );

    const refs = await readVisionQueueRefs(workspace);
    expect(refs).toEqual([
      {
        workspaceRelativePath: "tmp/a.png",
        source: "workspace_queue",
        label: "download",
      },
    ]);
  });

  it("dedupes refs by attachment or workspace path", () => {
    const refs = dedupeVisionRefs([
      { attachmentId: "11111111-1111-4111-8111-111111111111", source: "issue_attachment" },
      { attachmentId: "11111111-1111-4111-8111-111111111111", source: "workspace_queue" },
      { workspaceRelativePath: "a.png", source: "workspace_queue" },
    ]);
    expect(refs).toHaveLength(2);
  });

  it("clears staged queue entries after staging", async () => {
    const workspace = await makeWorkspace();
    const queuePath = visionQueuePath(workspace);
    await fs.mkdir(path.dirname(queuePath), { recursive: true });
    await fs.writeFile(
      queuePath,
      JSON.stringify({
        images: [
          { workspaceRelativePath: "tmp/a.png" },
          { workspaceRelativePath: "tmp/b.png" },
        ],
      }),
      "utf8",
    );

    await clearVisionQueueEntries(workspace, [
      { workspaceRelativePath: "tmp/a.png", source: "workspace_queue" },
    ]);

    const remaining = await readVisionQueueRefs(workspace);
    expect(remaining).toEqual([
      {
        workspaceRelativePath: "tmp/b.png",
        source: "workspace_queue",
      },
    ]);
  });

  it("mergeVisionRefs excludes already staged refs", async () => {
    const workspace = await makeWorkspace();
    const queuePath = visionQueuePath(workspace);
    await fs.mkdir(path.dirname(queuePath), { recursive: true });
    await fs.writeFile(
      queuePath,
      JSON.stringify({
        images: [
          { workspaceRelativePath: "tmp/a.png" },
          { workspaceRelativePath: "tmp/b.png" },
        ],
      }),
      "utf8",
    );

    const refs = await mergeVisionRefs({
      contextRefs: [],
      workspaceRoot: workspace,
      excludeWorkspacePaths: new Set(["tmp/a.png"]),
    });

    expect(refs).toEqual([
      {
        workspaceRelativePath: "tmp/b.png",
        source: "workspace_queue",
      },
    ]);
  });
});
