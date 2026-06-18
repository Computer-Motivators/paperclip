import fs from "node:fs/promises";
import path from "node:path";
import {
  ADAPTER_VISION_IMAGE_MIME_TYPES,
  type PaperclipVisionImageRef,
} from "@paperclipai/shared";

export type StagedVisionImage = {
  localPath: string;
  mimeType: string;
  source: PaperclipVisionImageRef["source"];
  label?: string;
  attachmentId?: string;
  workspaceRelativePath?: string;
};

export type SkippedVisionImage = {
  ref: PaperclipVisionImageRef;
  reason: string;
};

export type StageVisionImagesInput = {
  refs: PaperclipVisionImageRef[];
  runId: string;
  cwd: string;
  workspaceRoot: string;
  apiUrl?: string | null;
  apiKey?: string | null;
  maxImages: number;
  maxBytes: number;
};

export type StageVisionImagesResult = {
  staged: StagedVisionImage[];
  skipped: SkippedVisionImage[];
};

const VISION_MIME_SET = new Set<string>(ADAPTER_VISION_IMAGE_MIME_TYPES);

function normalizeMimeType(contentType: string | undefined, filePath: string): string | null {
  const fromHeader = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (fromHeader && VISION_MIME_SET.has(fromHeader)) return fromHeader;

  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return null;
  }
}

function isInsideRoot(rootReal: string, targetReal: string): boolean {
  const relative = path.relative(rootReal, targetReal);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeWorkspaceRelativePath(input: string): string | null {
  const trimmed = input.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.startsWith("~") || path.posix.isAbsolute(trimmed)) return null;
  const normalized = path.posix.normalize(trimmed);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) return null;
  return normalized;
}

async function fetchAttachmentBytes(
  apiUrl: string,
  apiKey: string,
  attachmentId: string,
): Promise<{ bytes: Buffer; contentType: string | null }> {
  const base = apiUrl.replace(/\/+$/, "");
  const response = await fetch(`${base}/api/attachments/${attachmentId}/content`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`attachment fetch failed with status ${response.status}`);
  }
  const contentType = response.headers.get("content-type");
  const arrayBuffer = await response.arrayBuffer();
  return { bytes: Buffer.from(arrayBuffer), contentType };
}

async function writeStagedImage(
  stagingDir: string,
  index: number,
  ext: string,
  bytes: Buffer,
): Promise<string> {
  await fs.mkdir(stagingDir, { recursive: true });
  const fileName = `vision-${index + 1}${ext}`;
  const localPath = path.join(stagingDir, fileName);
  await fs.writeFile(localPath, bytes);
  return localPath;
}

function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".png";
  }
}

export async function stageVisionImages(input: StageVisionImagesInput): Promise<StageVisionImagesResult> {
  const staged: StagedVisionImage[] = [];
  const skipped: SkippedVisionImage[] = [];
  const stagingDir = path.join(input.cwd, ".paperclip", "vision-staging", input.runId);
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const apiUrl = input.apiUrl?.trim() ?? "";
  const apiKey = input.apiKey?.trim() ?? "";

  for (const ref of input.refs) {
    if (staged.length >= input.maxImages) {
      skipped.push({ ref, reason: "max_vision_images_reached" });
      continue;
    }

    try {
      if (ref.attachmentId) {
        if (!apiUrl || !apiKey) {
          skipped.push({ ref, reason: "missing_api_credentials" });
          continue;
        }
        const { bytes, contentType } = await fetchAttachmentBytes(apiUrl, apiKey, ref.attachmentId);
        if (bytes.length > input.maxBytes) {
          skipped.push({ ref, reason: "image_too_large" });
          continue;
        }
        const mimeType = normalizeMimeType(ref.contentType ?? contentType ?? undefined, ref.attachmentId);
        if (!mimeType) {
          skipped.push({ ref, reason: "unsupported_mime_type" });
          continue;
        }
        const localPath = await writeStagedImage(
          stagingDir,
          staged.length,
          extensionForMime(mimeType),
          bytes,
        );
        staged.push({
          localPath,
          mimeType,
          source: ref.source,
          label: ref.label,
          attachmentId: ref.attachmentId,
          workspaceRelativePath: ref.workspaceRelativePath,
        });
        continue;
      }

      const relativePath = ref.workspaceRelativePath
        ? normalizeWorkspaceRelativePath(ref.workspaceRelativePath)
        : null;
      if (!relativePath) {
        skipped.push({ ref, reason: "invalid_workspace_path" });
        continue;
      }

      const targetReal = path.resolve(workspaceRoot, relativePath);
      if (!isInsideRoot(workspaceRoot, targetReal)) {
        skipped.push({ ref, reason: "workspace_path_outside_root" });
        continue;
      }

      const stat = await fs.stat(targetReal).catch(() => null);
      if (!stat || !stat.isFile()) {
        skipped.push({ ref, reason: "workspace_file_not_found" });
        continue;
      }
      if (stat.size > input.maxBytes) {
        skipped.push({ ref, reason: "image_too_large" });
        continue;
      }

      const bytes = await fs.readFile(targetReal);
      const mimeType = normalizeMimeType(ref.contentType, targetReal);
      if (!mimeType) {
        skipped.push({ ref, reason: "unsupported_mime_type" });
        continue;
      }

      const localPath = await writeStagedImage(
        stagingDir,
        staged.length,
        path.extname(targetReal) || extensionForMime(mimeType),
        bytes,
      );
      staged.push({
        localPath,
        mimeType,
        source: ref.source,
        label: ref.label,
        attachmentId: ref.attachmentId,
        workspaceRelativePath: ref.workspaceRelativePath,
      });
    } catch (error) {
      skipped.push({
        ref,
        reason: error instanceof Error ? error.message : "staging_failed",
      });
    }
  }

  return { staged, skipped };
}

export async function readStagedVisionImageBase64(localPath: string): Promise<string> {
  const bytes = await fs.readFile(localPath);
  return bytes.toString("base64");
}
