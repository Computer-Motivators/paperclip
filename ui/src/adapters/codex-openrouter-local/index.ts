import type { UIAdapterModule } from "../types";
import { parseCodexStdoutLine } from "@computermotivators/adapter-codex-openrouter-local/ui";
import { CodexOpenRouterLocalConfigFields } from "./config-fields";
import { buildCodexOpenRouterLocalConfig } from "@computermotivators/adapter-codex-openrouter-local/ui";

export const codexOpenRouterLocalUIAdapter: UIAdapterModule = {
  type: "codex_openrouter_local",
  label: "Codex (OpenRouter local)",
  parseStdoutLine: parseCodexStdoutLine,
  ConfigFields: CodexOpenRouterLocalConfigFields,
  buildAdapterConfig: buildCodexOpenRouterLocalConfig,
};
