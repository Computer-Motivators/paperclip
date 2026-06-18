import { z } from "zod";
import { PAPERCLIP_VISION_IMAGE_SOURCES } from "../types/vision-image.js";

export const paperclipVisionImageSourceSchema = z.enum(PAPERCLIP_VISION_IMAGE_SOURCES);

export const paperclipVisionImageRefSchema = z
  .object({
    attachmentId: z.string().uuid().optional(),
    workspaceRelativePath: z.string().trim().min(1).max(1024).optional(),
    contentType: z.string().trim().min(1).max(200).optional(),
    source: paperclipVisionImageSourceSchema,
    label: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    const hasAttachment = Boolean(value.attachmentId);
    const hasWorkspacePath = Boolean(value.workspaceRelativePath);
    if (!hasAttachment && !hasWorkspacePath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vision image ref requires attachmentId or workspaceRelativePath",
      });
    }
    if (hasAttachment && hasWorkspacePath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vision image ref cannot include both attachmentId and workspaceRelativePath",
      });
    }
  });

export const paperclipVisionImageRefListSchema = z.array(paperclipVisionImageRefSchema).max(32);

export const paperclipVisionQueueEntrySchema = z
  .object({
    attachmentId: z.string().uuid().optional(),
    workspaceRelativePath: z.string().trim().min(1).max(1024).optional(),
    contentType: z.string().trim().min(1).max(200).optional(),
    label: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    const hasAttachment = Boolean(value.attachmentId);
    const hasWorkspacePath = Boolean(value.workspaceRelativePath);
    if (!hasAttachment && !hasWorkspacePath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vision queue entry requires attachmentId or workspaceRelativePath",
      });
    }
    if (hasAttachment && hasWorkspacePath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vision queue entry cannot include both attachmentId and workspaceRelativePath",
      });
    }
  });

export const paperclipVisionQueueManifestSchema = z.object({
  images: z.array(paperclipVisionQueueEntrySchema).max(32),
});

export type PaperclipVisionImageRefInput = z.infer<typeof paperclipVisionImageRefSchema>;
export type PaperclipVisionQueueManifestInput = z.infer<typeof paperclipVisionQueueManifestSchema>;
