import type { TranscriptEntry } from "@paperclipai/adapter-utils";

function parse(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function parseDirectOpenRouterStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const event = parse(line);
  if (!event) return [];
  const type = typeof event.type === "string" ? event.type : "";
  if (type === "assistant_message") {
    const text = typeof event.text === "string" ? event.text.trim() : "";
    return text ? [{ kind: "assistant", ts, text }] : [];
  }
  if (type === "tool_result") {
    return [{
      kind: "tool_result",
      ts,
      toolUseId: "direct-openrouter",
      content: JSON.stringify(event, null, 2),
      isError: false,
    }];
  }
  if (type === "error") {
    const text = typeof event.message === "string" ? event.message : "Direct OpenRouter error";
    return [{ kind: "stderr", ts, text }];
  }
  if (type === "usage") {
    const input = Number(event.input_tokens ?? 0);
    const output = Number(event.output_tokens ?? 0);
    const cached = Number(event.cached_input_tokens ?? 0);
    const cost = Number(event.cost_usd ?? 0);
    return [{ kind: "system", ts, text: `tokens: in=${input} out=${output} cached=${cached} cost=$${cost.toFixed(6)}` }];
  }
  return [];
}
