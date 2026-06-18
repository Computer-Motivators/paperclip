import type { AdapterModelProfileDefinition } from "@paperclipai/adapter-utils";

export const type = "codex_openrouter_local";
export const label = "Codex (OpenRouter local)";

export const SANDBOX_INSTALL_COMMAND = "npm install -g @openai/codex";

export const OPENROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";

export const DEFAULT_CODEX_OPENROUTER_LOCAL_MODEL = "openai/gpt-5.3-codex";
export const DEFAULT_CODEX_OPENROUTER_LOCAL_BYPASS_APPROVALS_AND_SANDBOX = true;
export const CODEX_OPENROUTER_LOCAL_FAST_MODE_SUPPORTED_MODELS = ["openai/gpt-5.4", "gpt-5.4"] as const;

function normalizeModelId(model: string | null | undefined): string {
  return typeof model === "string" ? model.trim() : "";
}

export function isCodexOpenRouterLocalKnownModel(model: string | null | undefined): boolean {
  const normalizedModel = normalizeModelId(model);
  if (!normalizedModel) return false;
  return models.some((entry) => entry.id === normalizedModel);
}

export function isCodexOpenRouterLocalManualModel(model: string | null | undefined): boolean {
  const normalizedModel = normalizeModelId(model);
  return Boolean(normalizedModel) && !isCodexOpenRouterLocalKnownModel(normalizedModel);
}

export function isCodexOpenRouterLocalFastModeSupported(model: string | null | undefined): boolean {
  if (isCodexOpenRouterLocalManualModel(model)) return true;
  const normalizedModel = typeof model === "string" ? model.trim() : "";
  return CODEX_OPENROUTER_LOCAL_FAST_MODE_SUPPORTED_MODELS.includes(
    normalizedModel as (typeof CODEX_OPENROUTER_LOCAL_FAST_MODE_SUPPORTED_MODELS)[number],
  );
}

export const models = [
  { id: "openai/gpt-5.4", label: "openai/gpt-5.4", supportsImageInput: true, inputModalities: ["text", "image"] },
  { id: DEFAULT_CODEX_OPENROUTER_LOCAL_MODEL, label: DEFAULT_CODEX_OPENROUTER_LOCAL_MODEL, supportsImageInput: true, inputModalities: ["text", "image"] },
  { id: "openai/gpt-5.3-codex-spark", label: "openai/gpt-5.3-codex-spark", supportsImageInput: true, inputModalities: ["text", "image"] },
  { id: "openai/gpt-5", label: "openai/gpt-5", supportsImageInput: true, inputModalities: ["text", "image"] },
  { id: "openai/o3", label: "openai/o3", supportsImageInput: true, inputModalities: ["text", "image"] },
  { id: "openai/o4-mini", label: "openai/o4-mini", supportsImageInput: true, inputModalities: ["text", "image"] },
  { id: "openai/gpt-5-mini", label: "openai/gpt-5-mini", supportsImageInput: true, inputModalities: ["text", "image"] },
  { id: "openai/gpt-5-nano", label: "openai/gpt-5-nano", supportsImageInput: false, inputModalities: ["text"] },
  { id: "openai/o3-mini", label: "openai/o3-mini", supportsImageInput: true, inputModalities: ["text", "image"] },
  { id: "openai/codex-mini-latest", label: "openai/codex-mini-latest", supportsImageInput: true, inputModalities: ["text", "image"] },
];

export const modelProfiles: AdapterModelProfileDefinition[] = [
  {
    key: "cheap",
    label: "Cheap",
    description: "Use the lowest-cost known OpenRouter Codex model lane without changing the primary model.",
    adapterConfig: {
      model: "openai/gpt-5.3-codex-spark",
      modelReasoningEffort: "high",
    },
    source: "adapter_default",
  },
];

export const agentConfigurationDoc = `# codex_openrouter_local agent configuration

Adapter: codex_openrouter_local

Core fields:
- cwd (string, optional): default absolute working directory fallback for the agent process (created if missing when possible)
- instructionsFilePath (string, optional): absolute path to a markdown instructions file prepended to stdin prompt at runtime
- model (string, optional): OpenRouter model slug (provider/model format, e.g. openai/gpt-5.3-codex)
- modelReasoningEffort (string, optional): reasoning effort override (minimal|low|medium|high|xhigh) passed via -c model_reasoning_effort=...
- promptTemplate (string, optional): run prompt template
- search (boolean, optional): run codex with --search
- fastMode (boolean, optional): enable Codex Fast mode when supported by the selected model
- dangerouslyBypassApprovalsAndSandbox (boolean, optional): run with bypass flag
- command (string, optional): defaults to "codex"
- extraArgs (string[], optional): additional CLI args
- env (object, optional): KEY=VALUE environment variables; OPENROUTER_API_KEY is required for inference
- workspaceStrategy (object, optional): execution workspace strategy; currently supports { type: "git_worktree", baseRef?, branchTemplate?, worktreeParentDir? }
- workspaceRuntime (object, optional): reserved for workspace runtime metadata

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds
- visionMode (string, optional): auto (default) or off
- maxVisionImages (number, optional): max images attached per run (default 8)
- maxVisionImageBytes (number, optional): max bytes per staged image (default 10 MiB)

Notes:
- Inference always routes through OpenRouter via a managed CODEX_HOME with model_provider=openrouter.
- Set OPENROUTER_API_KEY in adapter env or server environment. OPENAI_API_KEY is not used.
- Prompt caching: Paperclip preserves Codex sessions, stable instruction bundles, and wake deltas; OpenRouter applies provider-side caching when supported.
- Managed home: ~/.paperclip/instances/<id>/companies/<companyId>/codex-openrouter-home/
- Vision: when visionMode=auto, issue image attachments are staged locally and passed via codex exec --image when the OpenRouter model supports image input. Queue mid-run images in .paperclip/vision-queue.json for supplemental resume in the same heartbeat.
`;
