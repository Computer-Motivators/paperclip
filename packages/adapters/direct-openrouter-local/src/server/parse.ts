import { asNumber, asString, parseJson, parseObject } from "@paperclipai/adapter-utils/server-utils";

export interface ParsedDirectOpenRouterOutput {
  messages: string[];
  errors: string[];
  summary: string | null;
  model: string | null;
  provider: string | null;
  sessionId: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    costUsd: number;
  };
  sessionParams: Record<string, unknown> | null;
}

export function parseDirectOpenRouterJsonl(stdout: string): ParsedDirectOpenRouterOutput {
  const out: ParsedDirectOpenRouterOutput = {
    messages: [],
    errors: [],
    summary: null,
    model: null,
    provider: null,
    sessionId: null,
    usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, costUsd: 0 },
    sessionParams: null,
  };

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const event = parseJson(line);
    if (!event) continue;
    const type = asString(event.type, "");
    if (type === "assistant_message") {
      const text = asString(event.text, "").trim();
      if (text) out.messages.push(text);
      continue;
    }
    if (type === "error") {
      const text = asString(event.message, "").trim();
      if (text) out.errors.push(text);
      continue;
    }
    if (type === "usage") {
      out.usage.inputTokens += asNumber(event.input_tokens, 0);
      out.usage.outputTokens += asNumber(event.output_tokens, 0);
      out.usage.cachedInputTokens += asNumber(event.cached_input_tokens, 0);
      out.usage.costUsd += asNumber(event.cost_usd, 0);
      continue;
    }
    if (type === "result") {
      out.summary = asString(event.summary, out.summary ?? "") || out.summary;
      out.model = asString(event.model, out.model ?? "") || out.model;
      out.provider = asString(event.provider, out.provider ?? "") || out.provider;
      out.sessionId = asString(event.session_id, out.sessionId ?? "") || out.sessionId;
      out.sessionParams = parseObject(event.session_params) ?? out.sessionParams;
    }
  }

  if (!out.summary && out.messages.length > 0) {
    out.summary = out.messages[out.messages.length - 1] ?? null;
  }
  return out;
}
