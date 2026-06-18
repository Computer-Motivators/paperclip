import fs from "node:fs/promises";
import path from "node:path";
import {
  PAPERCLIP_VISION_QUEUE_RELATIVE_PATH,
  paperclipVisionQueueManifestSchema,
  type PaperclipVisionImageRef,
} from "@paperclipai/shared";

function visionRefKey(ref: Pick<PaperclipVisionImageRef, "attachmentId" | "workspaceRelativePath">): string | null {
  if (ref.attachmentId) return `attachment:${ref.attachmentId}`;
  if (ref.workspaceRelativePath) return `workspace:${ref.workspaceRelativePath}`;
  return null;
}

export function dedupeVisionRefs(refs: PaperclipVisionImageRef[]): PaperclipVisionImageRef[] {
  const seen = new Set<string>();
  const deduped: PaperclipVisionImageRef[] = [];
  for (const ref of refs) {
    const key = visionRefKey(ref);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(ref);
  }
  return deduped;
}

export function visionQueuePath(workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot), PAPERCLIP_VISION_QUEUE_RELATIVE_PATH);
}

export function stagedVisionExcludeSets(staged: Array<{
  attachmentId?: string;
  workspaceRelativePath?: string;
}>): {
  excludeAttachmentIds: Set<string>;
  excludeWorkspacePaths: Set<string>;
} {
  const excludeAttachmentIds = new Set<string>();
  const excludeWorkspacePaths = new Set<string>();
  for (const entry of staged) {
    if (entry.attachmentId) excludeAttachmentIds.add(entry.attachmentId);
    if (entry.workspaceRelativePath) excludeWorkspacePaths.add(entry.workspaceRelativePath);
  }
  return { excludeAttachmentIds, excludeWorkspacePaths };
}

export async function readVisionQueueRefs(workspaceRoot: string): Promise<PaperclipVisionImageRef[]> {
  const queuePath = visionQueuePath(workspaceRoot);
  let raw: string;
  try {
    raw = await fs.readFile(queuePath, "utf8");
  } catch {
    return [];
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return [];
  }

  const parsed = paperclipVisionQueueManifestSchema.safeParse(parsedJson);
  if (!parsed.success) return [];

  return parsed.data.images.map((entry) => ({
    attachmentId: entry.attachmentId,
    workspaceRelativePath: entry.workspaceRelativePath,
    contentType: entry.contentType,
    source: "workspace_queue" as const,
    label: entry.label,
  }));
}

export async function clearVisionQueueEntries(
  workspaceRoot: string,
  stagedRefs: PaperclipVisionImageRef[],
): Promise<void> {
  if (stagedRefs.length === 0) return;

  const queuePath = visionQueuePath(workspaceRoot);
  let raw: string;
  try {
    raw = await fs.readFile(queuePath, "utf8");
  } catch {
    return;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return;
  }

  const parsed = paperclipVisionQueueManifestSchema.safeParse(parsedJson);
  if (!parsed.success) return;

  const stagedKeys = new Set(
    stagedRefs.map((ref) => visionRefKey(ref)).filter((key): key is string => Boolean(key)),
  );
  const remaining = parsed.data.images.filter((entry) => {
    const key = entry.attachmentId
      ? `attachment:${entry.attachmentId}`
      : entry.workspaceRelativePath
        ? `workspace:${entry.workspaceRelativePath}`
        : null;
    return key ? !stagedKeys.has(key) : true;
  });

  if (remaining.length === parsed.data.images.length) return;

  if (remaining.length === 0) {
    await fs.rm(queuePath, { force: true }).catch(() => undefined);
    return;
  }

  await fs.mkdir(path.dirname(queuePath), { recursive: true });
  await fs.writeFile(queuePath, `${JSON.stringify({ images: remaining }, null, 2)}\n`, "utf8");
}

export function filterVisionRefs(input: {
  refs: PaperclipVisionImageRef[];
  excludeAttachmentIds?: ReadonlySet<string>;
  excludeWorkspacePaths?: ReadonlySet<string>;
}): PaperclipVisionImageRef[] {
  const excludeAttachments = input.excludeAttachmentIds ?? new Set<string>();
  const excludePaths = input.excludeWorkspacePaths ?? new Set<string>();
  return input.refs.filter((ref) => {
    if (ref.attachmentId && excludeAttachments.has(ref.attachmentId)) return false;
    if (ref.workspaceRelativePath && excludePaths.has(ref.workspaceRelativePath)) return false;
    return true;
  });
}

export async function mergeVisionRefs(input: {
  contextRefs: PaperclipVisionImageRef[];
  workspaceRoot: string;
  includeVisionQueue?: boolean;
  excludeAttachmentIds?: ReadonlySet<string>;
  excludeWorkspacePaths?: ReadonlySet<string>;
  maxImages?: number;
}): Promise<PaperclipVisionImageRef[]> {
  const queueRefs =
    input.includeVisionQueue === false ? [] : await readVisionQueueRefs(input.workspaceRoot);
  const merged = dedupeVisionRefs([...input.contextRefs, ...queueRefs]);
  const filtered = filterVisionRefs({
    refs: merged,
    excludeAttachmentIds: input.excludeAttachmentIds,
    excludeWorkspacePaths: input.excludeWorkspacePaths,
  });
  const maxImages = input.maxImages;
  if (typeof maxImages === "number" && maxImages >= 0) {
    return filtered.slice(0, maxImages);
  }
  return filtered;
}
