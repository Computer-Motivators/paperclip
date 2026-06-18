export const PAPERCLIP_VISION_IMAGE_SOURCES = [
  "wake_comment",
  "issue_attachment",
  "explicit_context",
  "workspace_queue",
] as const;

export type PaperclipVisionImageSource = (typeof PAPERCLIP_VISION_IMAGE_SOURCES)[number];

export interface PaperclipVisionImageRef {
  attachmentId?: string;
  workspaceRelativePath?: string;
  contentType?: string;
  source: PaperclipVisionImageSource;
  label?: string;
}
