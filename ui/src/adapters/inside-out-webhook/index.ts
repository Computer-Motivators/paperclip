import type { UIAdapterModule } from "../types";
import {
  parseInsideOutStdoutLine,
  buildInsideOutAdapterConfig,
} from "@computermotivators/adapter-inside-out-webhook/ui";
import { SchemaConfigFields } from "../schema-config-fields";

export const insideOutWebhookUIAdapter: UIAdapterModule = {
  type: "inside_out_webhook",
  label: "Inside-Out Webhook",
  parseStdoutLine: parseInsideOutStdoutLine,
  ConfigFields: SchemaConfigFields,
  buildAdapterConfig: buildInsideOutAdapterConfig,
};
