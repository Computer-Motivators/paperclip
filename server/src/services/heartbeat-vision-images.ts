import { and, desc, eq, inArray, like } from "drizzle-orm";
import { issueAttachments, assets } from "@paperclipai/db";
import {
  DEFAULT_ADAPTER_MAX_VISION_IMAGES,
  PAPERCLIP_VISION_IMAGES_CONTEXT_KEY,
  paperclipVisionImageRefListSchema,
  type PaperclipVisionImageRef,
  type PaperclipVisionImageSource,
} from "@paperclipai/shared";
import type { Db } from "@paperclipai/db";

const ATTACHMENT_CONTENT_PATH_RE =
  /\/api\/attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/content/gi;

const MAX_RECENT_ISSUE_VISION_IMAGE_CANDIDATES = 10;

function isImageContentType(contentType: string | null | undefined): boolean {
  return typeof contentType === "string" && contentType.trim().toLowerCase().startsWith("image/");
}

function parseObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readWakeComments(context: Record<string, unknown>): Array<{ id?: string; body?: string }> {
  const wake = parseObject(context.paperclipWake);
  if (!wake) return [];
  const comments = Array.isArray(wake.comments) ? wake.comments : [];
  return comments
    .map((entry) => parseObject(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : undefined,
      body: typeof entry.body === "string" ? entry.body : "",
    }));
}

export function extractAttachmentIdsFromMarkdown(body: string): string[] {
  const ids: string[] = [];
  for (const match of body.matchAll(ATTACHMENT_CONTENT_PATH_RE)) {
    const id = match[1];
    if (id) ids.push(id);
  }
  return ids;
}

function dedupeVisionRefs(refs: PaperclipVisionImageRef[]): PaperclipVisionImageRef[] {
  const seen = new Set<string>();
  const deduped: PaperclipVisionImageRef[] = [];
  for (const ref of refs) {
    const key = ref.attachmentId
      ? `attachment:${ref.attachmentId}`
      : ref.workspaceRelativePath
        ? `workspace:${ref.workspaceRelativePath}`
        : null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(ref);
  }
  return deduped;
}

function pushAttachmentRef(
  refs: PaperclipVisionImageRef[],
  input: {
    attachmentId: string;
    contentType?: string | null;
    source: PaperclipVisionImageSource;
    label?: string | null;
  },
) {
  if (!input.attachmentId) return;
  refs.push({
    attachmentId: input.attachmentId,
    contentType: input.contentType ?? undefined,
    source: input.source,
    label: input.label ?? undefined,
  });
}

export async function collectPaperclipVisionImages(input: {
  db: Db;
  companyId: string;
  issueId: string | null;
  context: Record<string, unknown>;
  maxImages?: number;
}): Promise<PaperclipVisionImageRef[]> {
  const maxImages = Math.max(0, Math.min(32, input.maxImages ?? DEFAULT_ADAPTER_MAX_VISION_IMAGES));
  const refs: PaperclipVisionImageRef[] = [];

  const explicit = input.context[PAPERCLIP_VISION_IMAGES_CONTEXT_KEY];
  if (Array.isArray(explicit)) {
    const parsed = paperclipVisionImageRefListSchema.safeParse(explicit);
    if (parsed.success) {
      for (const ref of parsed.data) {
        refs.push(ref);
      }
    }
  }

  const wakeComments = readWakeComments(input.context);
  const wakeCommentIds = wakeComments
    .map((comment) => comment.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  for (const comment of wakeComments) {
    for (const attachmentId of extractAttachmentIdsFromMarkdown(comment.body ?? "")) {
      pushAttachmentRef(refs, {
        attachmentId,
        source: "wake_comment",
        label: comment.id ? `wake-comment:${comment.id}` : undefined,
      });
    }
  }

  if (wakeCommentIds.length > 0 && input.issueId) {
    const commentAttachmentRows = await input.db
      .select({
        id: issueAttachments.id,
        contentType: assets.contentType,
        originalFilename: assets.originalFilename,
        issueCommentId: issueAttachments.issueCommentId,
      })
      .from(issueAttachments)
      .innerJoin(assets, eq(issueAttachments.assetId, assets.id))
      .where(
        and(
          eq(issueAttachments.companyId, input.companyId),
          eq(issueAttachments.issueId, input.issueId),
          inArray(issueAttachments.issueCommentId, wakeCommentIds),
          like(assets.contentType, "image/%"),
        ),
      );

    for (const row of commentAttachmentRows) {
      pushAttachmentRef(refs, {
        attachmentId: row.id,
        contentType: row.contentType,
        source: "wake_comment",
        label: row.originalFilename ?? row.issueCommentId ?? undefined,
      });
    }
  }

  if (input.issueId) {
    const includedAttachmentIds = new Set(
      refs.map((ref) => ref.attachmentId).filter((id): id is string => Boolean(id)),
    );
    const recentRows = await input.db
      .select({
        id: issueAttachments.id,
        contentType: assets.contentType,
        originalFilename: assets.originalFilename,
      })
      .from(issueAttachments)
      .innerJoin(assets, eq(issueAttachments.assetId, assets.id))
      .where(
        and(
          eq(issueAttachments.companyId, input.companyId),
          eq(issueAttachments.issueId, input.issueId),
          like(assets.contentType, "image/%"),
        ),
      )
      .orderBy(desc(issueAttachments.createdAt))
      .limit(MAX_RECENT_ISSUE_VISION_IMAGE_CANDIDATES);

    for (const row of recentRows) {
      if (includedAttachmentIds.has(row.id)) continue;
      if (!isImageContentType(row.contentType)) continue;
      pushAttachmentRef(refs, {
        attachmentId: row.id,
        contentType: row.contentType,
        source: "issue_attachment",
        label: row.originalFilename ?? undefined,
      });
      includedAttachmentIds.add(row.id);
    }
  }

  return dedupeVisionRefs(refs).slice(0, maxImages);
}
