import type { AdapterEnvironmentTestContext, AdapterEnvironmentTestResult } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";

function checkStatus(hasError: boolean, hasWarn: boolean): "pass" | "warn" | "fail" {
  if (hasError) return "fail";
  if (hasWarn) return "warn";
  return "pass";
}

export async function testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentTestResult["checks"] = [];
  const env = parseObject(ctx.config.env) ?? {};
  const configuredKey = asString(env.OPENROUTER_API_KEY, "").trim() || asString(process.env.OPENROUTER_API_KEY, "").trim();
  checks.push(
    configuredKey
      ? {
        code: "openrouter_api_key",
        level: "info",
        message: "OPENROUTER_API_KEY is configured.",
      }
      : {
        code: "openrouter_api_key_missing",
        level: "error",
        message: "OPENROUTER_API_KEY is missing.",
        hint: "Set OPENROUTER_API_KEY in adapter env or server environment.",
      },
  );
  checks.push({
    code: "python_runtime",
    level: "info",
    message: "Direct OpenRouter uses python3 to run the local agent loop.",
    hint: "If runs fail with command-not-found, install python3 on the host runtime.",
  });
  return {
    adapterType: "direct_openrouter_local",
    status: checkStatus(checks.some((c) => c.level === "error"), checks.some((c) => c.level === "warn")),
    checks,
    testedAt: new Date().toISOString(),
  };
}
