import pc from "picocolors";

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

export function formatInsideOutStdoutEvent(line: string, debug: boolean): void {
  const event = parse(line.trim());
  if (!event) {
    if (debug) process.stdout.write(`${pc.dim(line)}\n`);
    return;
  }
  const type = typeof event.type === "string" ? event.type : "";
  if (type === "inside_out_queued") {
    process.stdout.write(`${pc.cyan("inside-out")} queued run ${String(event.runId ?? "")}\n`);
    return;
  }
  if (type === "inside_out_claimed") {
    process.stdout.write(
      `${pc.green("inside-out")} claimed by ${String(event.claimedBy ?? "external worker")}\n`,
    );
    return;
  }
  if (type === "inside_out_complete") {
    process.stdout.write(
      `${pc.green("inside-out")} complete: ${String(event.outcome ?? "unknown")}\n`,
    );
    return;
  }
  if (debug) process.stdout.write(`${pc.dim(line)}\n`);
}
