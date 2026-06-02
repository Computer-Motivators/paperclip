import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { DEFAULT_DIRECT_OPENROUTER_MODEL } from "../index.js";

function parseEnvVars(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    env[key] = value;
  }
  return env;
}

function parseEnvBindings(bindings: unknown): Record<string, unknown> {
  if (typeof bindings !== "object" || bindings === null || Array.isArray(bindings)) return {};
  const env: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(bindings)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (typeof raw === "string") env[key] = { type: "plain", value: raw };
  }
  return env;
}

export function buildDirectOpenRouterLocalConfig(v: CreateConfigValues): Record<string, unknown> {
  const ac: Record<string, unknown> = {
    model: v.model || DEFAULT_DIRECT_OPENROUTER_MODEL,
    timeoutSec: 0,
    graceSec: 15,
    toolCallingMode: "native",
    maxTurns: 25,
    shellPolicy: "dev",
    shellTimeoutSec: 120,
    allowNetworkShellCommands: false,
    allowGit: true,
    allowPackageManagers: true,
    allowPython: true,
    allowWriteCommands: true,
    blockGitPush: true,
    blockPackagePublish: true,
    blockDestructiveRm: true,
    blockInlineCodeExecution: true,
    allowShellMetacharacters: false,
    allowShellAbsolutePaths: false,
    maxShellCommandLength: 4096,
  };
  if (v.adapterSchemaValues) {
    Object.assign(ac, v.adapterSchemaValues);
  }
  if (v.cwd) ac.cwd = v.cwd;
  if (v.instructionsFilePath) ac.instructionsFilePath = v.instructionsFilePath;
  const env = parseEnvBindings(v.envBindings);
  const legacy = parseEnvVars(v.envVars);
  for (const [key, value] of Object.entries(legacy)) {
    if (!Object.prototype.hasOwnProperty.call(env, key)) {
      env[key] = { type: "plain", value };
    }
  }
  if (Object.keys(env).length > 0) ac.env = env;
  if (v.command) ac.command = v.command;
  return ac;
}
