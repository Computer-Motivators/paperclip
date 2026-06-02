import type { UIAdapterModule } from "../types";
import { parseDirectOpenRouterStdoutLine, buildDirectOpenRouterLocalConfig } from "@computermotivators/adapter-direct-openrouter-local/ui";
import { SchemaConfigFields } from "../schema-config-fields";

export const directOpenRouterLocalUIAdapter: UIAdapterModule = {
  type: "direct_openrouter_local",
  label: "Direct OpenRouter",
  parseStdoutLine: parseDirectOpenRouterStdoutLine,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: buildDirectOpenRouterLocalConfig,
};
