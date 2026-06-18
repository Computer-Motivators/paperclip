import {
  PAPERCLIP_VISION_IMAGES_CONTEXT_KEY,
  paperclipVisionImageRefListSchema,
  type PaperclipVisionImageRef,
} from "@paperclipai/shared";
import type { AdapterModel } from "./types.js";
import {
  resolveOpenAiCodexImageInputSupport,
  resolveOpenRouterImageInputSupport,
} from "./model-vision-capabilities.js";
import { isAdapterVisionEnabled, readAdapterVisionConfig } from "./vision-config.js";
import { clearVisionQueueEntries, mergeVisionRefs } from "./vision-queue.js";
import { stageVisionImages, type SkippedVisionImage, type StagedVisionImage } from "./vision-images.js";

export type PrepareAdapterVisionRunInput = {
  config: unknown;
  context: Record<string, unknown>;
  runId: string;
  cwd: string;
  workspaceRoot: string;
  modelId: string;
  apiUrl?: string | null;
  apiKey?: string | null;
  openRouterApiKey?: string | null;
  provider: "openai_codex" | "openrouter";
  fallbackModels?: AdapterModel[];
  attachOnResume?: boolean;
  isResumeDelta?: boolean;
  includeVisionQueue?: boolean;
  excludeAttachmentIds?: ReadonlySet<string>;
  excludeWorkspacePaths?: ReadonlySet<string>;
  clearVisionQueueOnSuccess?: boolean;
};

export type PrepareAdapterVisionRunResult = {
  enabled: boolean;
  modelSupportsImageInput: boolean;
  imagePaths: string[];
  staged: StagedVisionImage[];
  skipped: SkippedVisionImage[];
  refs: PaperclipVisionImageRef[];
  notes: string[];
};

function readVisionRefs(context: Record<string, unknown>): PaperclipVisionImageRef[] {
  const raw = context[PAPERCLIP_VISION_IMAGES_CONTEXT_KEY];
  if (!Array.isArray(raw)) return [];
  const parsed = paperclipVisionImageRefListSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export async function prepareAdapterVisionRun(
  input: PrepareAdapterVisionRunInput,
): Promise<PrepareAdapterVisionRunResult> {
  const notes: string[] = [];
  const visionConfig = readAdapterVisionConfig(input.config);
  const attachOnResume = input.attachOnResume ?? visionConfig.visionAttachOnResume;
  const contextRefs = readVisionRefs(input.context);
  const refs = await mergeVisionRefs({
    contextRefs,
    workspaceRoot: input.workspaceRoot,
    includeVisionQueue: input.includeVisionQueue,
    excludeAttachmentIds: input.excludeAttachmentIds,
    excludeWorkspacePaths: input.excludeWorkspacePaths,
    maxImages: visionConfig.maxVisionImages,
  });

  const emptyResult = (modelSupportsImageInput: boolean): PrepareAdapterVisionRunResult => ({
    enabled: false,
    modelSupportsImageInput,
    imagePaths: [],
    staged: [],
    skipped: [],
    refs,
    notes,
  });

  if (!isAdapterVisionEnabled(input.config)) {
    notes.push("Vision injection disabled by visionMode=off.");
    return emptyResult(false);
  }

  if (refs.length === 0) {
    return emptyResult(false);
  }

  if (input.isResumeDelta && !attachOnResume) {
    notes.push("Skipped vision image attachment for resumed session wake delta.");
    return emptyResult(false);
  }

  const modelSupportsImageInput =
    input.provider === "openrouter"
      ? await resolveOpenRouterImageInputSupport(
          input.modelId,
          input.openRouterApiKey ?? input.apiKey,
          input.fallbackModels ?? [],
        )
      : resolveOpenAiCodexImageInputSupport(input.modelId, input.fallbackModels ?? []);

  if (!modelSupportsImageInput) {
    notes.push(
      `Model ${input.modelId || "(default)"} does not support image input; skipped ${refs.length} vision image ref(s).`,
    );
    return {
      enabled: false,
      modelSupportsImageInput: false,
      imagePaths: [],
      staged: [],
      skipped: refs.map((ref) => ({ ref, reason: "model_does_not_support_image_input" })),
      refs,
      notes,
    };
  }

  const stagedResult = await stageVisionImages({
    refs,
    runId: input.runId,
    cwd: input.cwd,
    workspaceRoot: input.workspaceRoot,
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    maxImages: visionConfig.maxVisionImages,
    maxBytes: visionConfig.maxVisionImageBytes,
  });

  if (stagedResult.staged.length > 0) {
    notes.push(`Staged ${stagedResult.staged.length} vision image(s) for model input.`);
  }
  if (stagedResult.skipped.length > 0) {
    notes.push(`Skipped ${stagedResult.skipped.length} vision image ref(s) during staging.`);
  }

  if (input.clearVisionQueueOnSuccess !== false && stagedResult.staged.length > 0) {
    const queueRefsToClear = stagedResult.staged
      .filter((entry) => entry.source === "workspace_queue")
      .map((entry) => ({
        attachmentId: entry.attachmentId,
        workspaceRelativePath: entry.workspaceRelativePath,
        source: "workspace_queue" as const,
        label: entry.label,
        contentType: entry.mimeType,
      }));
    if (queueRefsToClear.length > 0) {
      await clearVisionQueueEntries(input.workspaceRoot, queueRefsToClear);
    }
  }

  return {
    enabled: stagedResult.staged.length > 0,
    modelSupportsImageInput: true,
    imagePaths: stagedResult.staged.map((entry) => entry.localPath),
    staged: stagedResult.staged,
    skipped: stagedResult.skipped,
    refs,
    notes,
  };
}

export { readAdapterVisionConfig } from "./vision-config.js";
export type { AdapterVisionConfig } from "./vision-config.js";
