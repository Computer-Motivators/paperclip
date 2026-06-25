import type {
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const config = ctx.config ?? {};
  const checks = [];
  const pullToken = readString(config.pullToken);
  if (!pullToken) {
    checks.push({
      code: "pull_token_missing",
      level: "warn" as const,
      message: "Pull token is not configured yet",
      hint: "Save the agent once to auto-generate a pull token, or set pullToken manually.",
    });
  } else {
    checks.push({
      code: "pull_token_present",
      level: "info" as const,
      message: "Pull token is configured",
    });
  }

  checks.push({
    code: "inside_out_endpoints",
    level: "info" as const,
    message: "External workers pull work from POST /api/inside-out/pull",
    detail: "Use the agent API key or pull token, then heartbeat and complete on the returned runId.",
  });

  const hasWarn = checks.some((check) => check.level === "warn");
  return {
    adapterType: ctx.adapterType,
    status: hasWarn ? "warn" : "pass",
    checks,
    testedAt: new Date().toISOString(),
  };
}
