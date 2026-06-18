import type { AdapterModelProfileDefinition } from "@paperclipai/adapter-utils";

export const type = "direct_openrouter_local";
export const label = "Direct OpenRouter";
export const OPENROUTER_API_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_DIRECT_OPENROUTER_MODEL = "openai/gpt-5-mini";
export const DIRECT_OPENROUTER_TOOL_MODES = ["native", "text"] as const;

export const models = [
  { id: DEFAULT_DIRECT_OPENROUTER_MODEL, label: DEFAULT_DIRECT_OPENROUTER_MODEL, supportsImageInput: true, inputModalities: ["text", "image"] },
  { id: "openai/gpt-5.4", label: "openai/gpt-5.4", supportsImageInput: true, inputModalities: ["text", "image"] },
  { id: "openai/gpt-5.3-codex", label: "openai/gpt-5.3-codex", supportsImageInput: true, inputModalities: ["text", "image"] },
  { id: "anthropic/claude-sonnet-4", label: "anthropic/claude-sonnet-4", supportsImageInput: true, inputModalities: ["text", "image"] },
  { id: "google/gemini-2.5-pro", label: "google/gemini-2.5-pro", supportsImageInput: true, inputModalities: ["text", "image"] },
];

export const modelProfiles: AdapterModelProfileDefinition[] = [
  {
    key: "cheap",
    label: "Cheap",
    description: "Use a lower-cost OpenRouter model while keeping prompt caching enabled.",
    adapterConfig: {
      model: DEFAULT_DIRECT_OPENROUTER_MODEL,
      toolCallingMode: "native",
    },
    source: "adapter_default",
  },
];

export const agentConfigurationDoc = `# direct_openrouter_local agent configuration

Adapter: direct_openrouter_local

Use when:
- You want a minimal agent loop that calls OpenRouter directly (no external coding CLI).
- You need OpenRouter session_id + trace fields for Broadcast observability.
- You want prompt caching enabled by default for agentic multi-turn work.

Core fields:
- cwd (string, optional): fallback absolute working directory for execution.
- model (string, optional): OpenRouter model id (provider/model), default openai/gpt-5-mini.
- toolCallingMode (string, optional): native or text; defaults to native.
- instructionsFilePath (string, optional): path to markdown instructions prepended on each run.
- env (object, optional): environment values; OPENROUTER_API_KEY is required for inference.
- maxTurns (number, optional): max agent loop turns, default 25.
- shellPolicy (string, optional): dev | ci | custom | disabled — command allowlist for run_shell.
- allowedShellCommands (string, optional): custom allowlist when shellPolicy=custom.
- blockedShellCommands (string, optional): extra substrings to block in run_shell.
- allowNetworkShellCommands, allowGit, allowPackageManagers, allowPython, allowWriteCommands (boolean): category toggles for dev/ci presets.
- blockGitPush, blockPackagePublish, blockDestructiveRm, blockInlineCodeExecution (boolean): safety blocks (default on).
- allowShellMetacharacters, allowShellAbsolutePaths (boolean): advanced escape hatches (default off).
- shellTimeoutSec (number, optional): shell tool timeout, default 120.
- maxShellCommandLength (number, optional): max run_shell command length, default 4096.
- timeoutSec (number, optional): adapter-level timeout in seconds.
- graceSec (number, optional): SIGTERM grace period in seconds.
- visionMode (string, optional): auto (default) or off
- maxVisionImages (number, optional): max images attached per run (default 8)
- maxVisionImageBytes (number, optional): max bytes per staged image (default 10 MiB)

OpenRouter protocol:
- Always sends session_id and X-Session-Id.
- Always includes trace metadata.
- Always enables prompt caching where supported by the selected model.
- Vision: when visionMode=auto and the model supports image input, run-start issue images are sent as image_url parts; read_image (path or attachmentId) and list_workspace_images support mid-run vision.
`;
