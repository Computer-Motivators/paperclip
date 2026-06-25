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

const EVENT_LABELS: Record<string, string> = {
  inside_out_queued: "Queued for external pickup",
  inside_out_claimed: "Claimed by external worker",
  inside_out_complete: "External worker completed",
  inside_out_heartbeat: "External worker heartbeat",
};

export function parseInsideOutStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const event = parse(line.trim());
  if (!event) return [];
  const type = typeof event.type === "string" ? event.type : "";
  const label = EVENT_LABELS[type];
  if (!label) return [];
  const details = JSON.stringify(event, null, 2);
  return [{ kind: "system", ts, text: `${label}\n${details}` }];
}
