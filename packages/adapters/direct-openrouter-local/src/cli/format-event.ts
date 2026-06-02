import pc from "picocolors";

export function printDirectOpenRouterStreamEvent(line: string, debug: boolean): void {
  if (!line.trim()) return;
  try {
    const event = JSON.parse(line) as Record<string, unknown>;
    const type = typeof event.type === "string" ? event.type : "";
    if (type === "assistant_message") {
      const text = typeof event.text === "string" ? event.text : "";
      if (text.trim()) console.log(pc.green(text));
      return;
    }
    if (type === "usage") {
      const input = Number(event.input_tokens ?? 0);
      const output = Number(event.output_tokens ?? 0);
      const cached = Number(event.cached_input_tokens ?? 0);
      const cost = Number(event.cost_usd ?? 0);
      console.log(pc.blue(`tokens: in=${input} out=${output} cached=${cached} cost=$${cost.toFixed(6)}`));
      return;
    }
    if (type === "error") {
      console.log(pc.red(typeof event.message === "string" ? event.message : "Direct OpenRouter error"));
      return;
    }
    if (debug) console.log(line);
  } catch {
    if (debug) console.log(line);
  }
}
