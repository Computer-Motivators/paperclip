export function renderAdapterVisionGuidance(input: {
  adapterKind: "codex" | "direct_openrouter";
  modelSupportsImageInput: boolean;
}): string {
  if (!input.modelSupportsImageInput) return "";

  if (input.adapterKind === "direct_openrouter") {
    return [
      "## Vision input",
      "Use the read_image tool (not read_file) for image files (.png, .jpg, .webp, .gif).",
      "After downloading an image into the workspace, call read_image with its workspace-relative path.",
      "read_image also accepts attachmentId to load a Paperclip issue attachment as vision input.",
    ].join("\n");
  }

  return [
    "## Vision input",
    "After downloading or saving an image in the workspace, append an entry to .paperclip/vision-queue.json so Paperclip can attach it for vision review within this heartbeat:",
    '```json',
    '{"images":[{"workspaceRelativePath":"path/to/image.png","label":"optional"}]}',
    "```",
  ].join("\n");
}

export const CODEX_VISION_SUPPLEMENTAL_PROMPT =
  "Workspace image(s) were queued for vision review. Inspect the attached image(s) and continue the task.";
