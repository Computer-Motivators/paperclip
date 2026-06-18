import fs from "node:fs/promises";
import path from "node:path";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";
import { resolvePaperclipInstanceRootForAdapter } from "@paperclipai/adapter-utils/server-utils";
import { OPENROUTER_API_BASE_URL } from "../index.js";

import { detectCodexShellRuntime, shouldDisableCodexShellZshFork } from "./codex-shell-runtime.js";

const TRUTHY_ENV_RE = /^(1|true|yes|on)$/i;

function nonEmpty(value: string | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function pathExists(candidate: string): Promise<boolean> {
  return fs.access(candidate).then(() => true).catch(() => false);
}

export function resolveManagedCodexOpenRouterHomeDir(
  env: NodeJS.ProcessEnv,
  companyId?: string,
): string {
  const instanceRoot = resolvePaperclipInstanceRootForAdapter({
    homeDir: nonEmpty(env.PAPERCLIP_HOME) ?? undefined,
    instanceId: nonEmpty(env.PAPERCLIP_INSTANCE_ID) ?? undefined,
    env,
  });
  return companyId
    ? path.resolve(instanceRoot, "companies", companyId, "codex-openrouter-home")
    : path.resolve(instanceRoot, "codex-openrouter-home");
}

function isWorktreeMode(env: NodeJS.ProcessEnv): boolean {
  return TRUTHY_ENV_RE.test(env.PAPERCLIP_IN_WORKTREE ?? "");
}

export function buildOpenRouterConfigToml(
  modelReasoningEffort?: string | null,
  options: { disableShellZshFork?: boolean } = {},
): string {
  const effortLine =
    modelReasoningEffort && modelReasoningEffort.trim().length > 0
      ? `model_reasoning_effort = ${JSON.stringify(modelReasoningEffort.trim())}\n`
      : "";
  const shellForkBlock = options.disableShellZshFork
    ? [
        "",
        "[features]",
        "shell_zsh_fork = false",
      ]
    : [];
  return [
    'model_provider = "openrouter"',
    effortLine.trimEnd(),
    "",
    "[model_providers.openrouter]",
    'name = "openrouter"',
    `base_url = "${OPENROUTER_API_BASE_URL}"`,
    'env_key = "OPENROUTER_API_KEY"',
    'env_http_headers = { "X-Session-Id" = "OPENROUTER_SESSION_ID", "HTTP-Referer" = "OPENROUTER_HTTP_REFERER", "X-OpenRouter-Title" = "OPENROUTER_TITLE" }',
    ...shellForkBlock,
    "",
  ]
    .filter((line, index, arr) => !(line === "" && index === arr.length - 1))
    .join("\n");
}

/**
 * Writes auth.json with OPENROUTER_API_KEY. Codex >= 0.122 reads credentials from
 * $CODEX_HOME/auth.json using the env_key declared in config.toml.
 */
export async function writeOpenRouterAuthJson(home: string, apiKey: string): Promise<void> {
  await fs.mkdir(home, { recursive: true });
  const target = path.join(home, "auth.json");
  await fs.rm(target, { force: true });
  await fs.writeFile(
    target,
    JSON.stringify({ OPENROUTER_API_KEY: apiKey }),
    { mode: 0o600 },
  );
}

export async function writeOpenRouterConfigToml(
  home: string,
  modelReasoningEffort?: string | null,
  options: {
    disableShellZshFork?: boolean;
    codexCommand?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<boolean> {
  let disableShellZshFork = options.disableShellZshFork;
  if (disableShellZshFork === undefined) {
    const runtime = await detectCodexShellRuntime({
      codexCommand: options.codexCommand,
      env: options.env,
    });
    disableShellZshFork = shouldDisableCodexShellZshFork(runtime);
  }

  await fs.mkdir(home, { recursive: true });
  const target = path.join(home, "config.toml");
  await fs.writeFile(
    target,
    buildOpenRouterConfigToml(modelReasoningEffort, { disableShellZshFork }),
    "utf8",
  );
  return disableShellZshFork;
}

export function resolveOpenRouterApiKey(
  envConfig: Record<string, unknown>,
  processEnv: NodeJS.ProcessEnv = process.env,
): string | null {
  const fromConfig = envConfig.OPENROUTER_API_KEY;
  if (typeof fromConfig === "string" && fromConfig.trim().length > 0) {
    return fromConfig.trim();
  }
  const fromProcess = processEnv.OPENROUTER_API_KEY;
  if (typeof fromProcess === "string" && fromProcess.trim().length > 0) {
    return fromProcess.trim();
  }
  return null;
}

export async function prepareManagedCodexOpenRouterHome(
  env: NodeJS.ProcessEnv,
  onLog: AdapterExecutionContext["onLog"],
  companyId: string,
  options: {
    apiKey?: string | null;
    modelReasoningEffort?: string | null;
    codexCommand?: string;
  } = {},
): Promise<string> {
  const targetHome = resolveManagedCodexOpenRouterHomeDir(env, companyId);
  const apiKey = nonEmpty(options.apiKey ?? undefined);

  await fs.mkdir(targetHome, { recursive: true });
  const disableShellZshFork = await writeOpenRouterConfigToml(
    targetHome,
    options.modelReasoningEffort ?? null,
    {
      codexCommand: options.codexCommand,
      env,
    },
  );
  if (disableShellZshFork) {
    await onLog(
      "stdout",
      "[paperclip] Codex bundled zsh exec bridge is unavailable; wrote config.toml with features.shell_zsh_fork=false for legacy shell execution.\n",
    );
  }

  if (apiKey) {
    await writeOpenRouterAuthJson(targetHome, apiKey);
    await onLog(
      "stdout",
      `[paperclip] Wrote OpenRouter auth.json into Codex home "${targetHome}".\n`,
    );
  }

  await onLog(
    "stdout",
    `[paperclip] Using ${isWorktreeMode(env) ? "worktree-isolated" : "Paperclip-managed"} OpenRouter Codex home "${targetHome}".\n`,
  );

  return targetHome;
}
