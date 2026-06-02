export type ShellPolicyPreset = "disabled" | "dev" | "ci" | "custom";

export interface ResolvedShellPolicy {
  enabled: boolean;
  preset: ShellPolicyPreset;
  allowedCommands: readonly string[];
  blockedSubstrings: readonly string[];
  blockMetacharacters: boolean;
  blockAbsolutePaths: boolean;
  blockGitPush: boolean;
  blockInlineCodeExecution: boolean;
  blockDestructiveRm: boolean;
  blockPackagePublish: boolean;
  maxCommandLength: number;
}

export interface ShellValidationResult {
  ok: boolean;
  reason?: string;
}

const SHELL_ENABLED_WHEN = { key: "shellPolicy", notValues: ["disabled"] } as const;

/** Re-export for config-schema meta. */
export const SHELL_POLICY_VISIBLE_WHEN = SHELL_ENABLED_WHEN;

export const DEV_SHELL_ALLOWLIST = [
  "basename",
  "cat",
  "corepack",
  "cp",
  "diff",
  "dirname",
  "echo",
  "false",
  "find",
  "git",
  "grep",
  "head",
  "ls",
  "mkdir",
  "mv",
  "node",
  "npm",
  "npx",
  "pnpm",
  "pwd",
  "python",
  "python3",
  "pytest",
  "realpath",
  "rg",
  "rm",
  "sed",
  "sort",
  "tail",
  "test",
  "touch",
  "true",
  "uniq",
  "wc",
] as const;

export const CI_SHELL_ALLOWLIST = [
  "cat",
  "diff",
  "echo",
  "false",
  "find",
  "git",
  "grep",
  "head",
  "ls",
  "node",
  "npm",
  "npx",
  "pnpm",
  "pwd",
  "rg",
  "tail",
  "test",
  "true",
  "wc",
] as const;

export const NETWORK_SHELL_COMMANDS = [
  "curl",
  "wget",
  "ssh",
  "scp",
  "rsync",
  "nc",
  "ncat",
  "telnet",
  "ftp",
  "sftp",
  "socat",
] as const;

const COMMAND_CATEGORIES: Record<string, readonly string[]> = {
  git: ["git"],
  packageManagers: ["node", "npm", "npx", "pnpm", "corepack"],
  python: ["python", "python3", "pytest"],
  write: ["rm", "mv", "cp", "sed", "mkdir", "touch"],
  network: NETWORK_SHELL_COMMANDS,
};

const ALWAYS_BLOCKED_SUBSTRINGS = [
  ":(){ :|:& };:",
  "rm -rf /",
  "rm -rf /*",
  "mkfs.",
  "dd if=",
  "> /dev/",
  "shutdown",
  "reboot",
  "poweroff",
  "init 0",
  "init 6",
  "chmod 4777",
  "chmod +s",
  "chown root",
] as const;

const GIT_PUSH_BLOCKS = ["git push", "git push ", " push origin", " push --force"] as const;
const PACKAGE_PUBLISH_BLOCKS = ["npm publish", "pnpm publish", "yarn publish", "npm unpublish"] as const;
const DESTRUCTIVE_RM_BLOCKS = ["rm -rf", "rm -fr", "rm -r /"] as const;

const SHELL_INTERPRETER_COMMANDS = ["bash", "sh", "zsh", "fish", "dash", "ksh", "exec", "eval", "source", "."] as const;

const CODE_EXECUTION_RE =
  /\b(?:python3?|node|npx)\s+(?:-c\b|--eval\b|-e\b)|\b(?:bash|sh|zsh)\s+-c\b/i;

const METACHAR_RE = /[;&|`$<>()\n\r{}[\]\\]/;

const ABSOLUTE_PATH_RE =
  /(?:^|\s)(?:~\/|\/(?:etc|var|root|proc|sys|home|Users|tmp)\/|\$(?:HOME|PWD|OLDPWD)\b)/i;

function configBool(config: Record<string, unknown>, key: string, defaultValue: boolean): boolean {
  const value = config[key];
  if (value === true) return true;
  if (value === false) return false;
  return defaultValue;
}

function parseListInput(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function parseCustomAllowlist(value: unknown): string[] {
  return parseListInput(value).map((entry) => entry.replace(/^.*\//, ""));
}

function subtractCategory(commands: string[], category: keyof typeof COMMAND_CATEGORIES): string[] {
  const remove = new Set(COMMAND_CATEGORIES[category].map((c) => c.toLowerCase()));
  return commands.filter((cmd) => !remove.has(cmd.toLowerCase()));
}

function applyCategoryToggles(commands: string[], config: Record<string, unknown>): string[] {
  let result = [...commands];
  if (!configBool(config, "allowGit", true)) {
    result = subtractCategory(result, "git");
  }
  if (!configBool(config, "allowPackageManagers", true)) {
    result = subtractCategory(result, "packageManagers");
  }
  if (!configBool(config, "allowPython", true)) {
    result = subtractCategory(result, "python");
  }
  if (!configBool(config, "allowWriteCommands", true)) {
    result = subtractCategory(result, "write");
  }
  if (configBool(config, "allowNetworkShellCommands", false)) {
    const existing = new Set(result.map((c) => c.toLowerCase()));
    for (const cmd of NETWORK_SHELL_COMMANDS) {
      if (!existing.has(cmd)) result.push(cmd);
    }
  }
  return result;
}

function networkBlockedSubstrings(): string[] {
  return NETWORK_SHELL_COMMANDS.flatMap((cmd) => [`${cmd} `, ` ${cmd} `, ` ${cmd}`]);
}

export function resolveShellPolicy(config: Record<string, unknown>): ResolvedShellPolicy {
  const presetRaw = typeof config.shellPolicy === "string" ? config.shellPolicy.trim() : "dev";
  const preset: ShellPolicyPreset =
    presetRaw === "disabled" || presetRaw === "ci" || presetRaw === "custom" ? presetRaw : "dev";

  const blockGitPush = configBool(config, "blockGitPush", true);
  const blockInlineCodeExecution = configBool(config, "blockInlineCodeExecution", true);
  const blockDestructiveRm = configBool(config, "blockDestructiveRm", true);
  const blockPackagePublish = configBool(config, "blockPackagePublish", true);
  const blockMetacharacters = !configBool(config, "allowShellMetacharacters", false);
  const blockAbsolutePaths = !configBool(config, "allowShellAbsolutePaths", false);

  if (preset === "disabled") {
    return {
      enabled: false,
      preset,
      allowedCommands: [],
      blockedSubstrings: [...ALWAYS_BLOCKED_SUBSTRINGS],
      blockMetacharacters: true,
      blockAbsolutePaths: true,
      blockGitPush: true,
      blockInlineCodeExecution: true,
      blockDestructiveRm: true,
      blockPackagePublish: true,
      maxCommandLength: 4096,
    };
  }

  let allowedCommands =
    preset === "ci"
      ? [...CI_SHELL_ALLOWLIST]
      : preset === "custom"
        ? parseCustomAllowlist(config.allowedShellCommands)
        : [...DEV_SHELL_ALLOWLIST];

  if (preset !== "custom") {
    allowedCommands = applyCategoryToggles(allowedCommands, config);
  } else if (configBool(config, "allowNetworkShellCommands", false)) {
    allowedCommands = applyCategoryToggles(allowedCommands, {
      ...config,
      allowGit: true,
      allowPackageManagers: true,
      allowPython: true,
      allowWriteCommands: true,
      allowNetworkShellCommands: true,
    });
  }

  const blockedSubstrings: string[] = [...ALWAYS_BLOCKED_SUBSTRINGS];

  if (!configBool(config, "allowNetworkShellCommands", false)) {
    blockedSubstrings.push(...networkBlockedSubstrings());
  }

  if (blockGitPush) {
    blockedSubstrings.push(...GIT_PUSH_BLOCKS);
  }

  if (blockPackagePublish) {
    blockedSubstrings.push(...PACKAGE_PUBLISH_BLOCKS);
  }

  if (blockDestructiveRm) {
    blockedSubstrings.push(...DESTRUCTIVE_RM_BLOCKS);
    blockedSubstrings.push("rm -rf ..");
  }

  for (const entry of parseListInput(config.blockedShellCommands)) {
    blockedSubstrings.push(entry);
  }

  return {
    enabled: true,
    preset,
    allowedCommands,
    blockedSubstrings,
    blockMetacharacters,
    blockAbsolutePaths,
    blockGitPush,
    blockInlineCodeExecution,
    blockDestructiveRm,
    blockPackagePublish,
    maxCommandLength: Math.max(256, Number(config.maxShellCommandLength) || 4096),
  };
}

export function stripEnvAssignments(command: string): string {
  let rest = command.trim();
  const envAssignRe = /^[A-Za-z_][A-Za-z0-9_]*=(?:[^\s"']+|"[^"]*"|'[^']*')\s+/;
  while (envAssignRe.test(rest)) {
    rest = rest.replace(envAssignRe, "");
  }
  return rest.trim();
}

export function firstCommandToken(command: string): string {
  const stripped = stripEnvAssignments(command);
  const match = stripped.match(/^[^\s]+/);
  if (!match) return "";
  return match[0].replace(/^.*\//, "");
}

export function validateShellCommand(command: string, policy: ResolvedShellPolicy): ShellValidationResult {
  if (!policy.enabled) {
    return { ok: false, reason: "run_shell is disabled by shellPolicy=disabled" };
  }

  const trimmed = command.trim();
  if (!trimmed) {
    return { ok: false, reason: "empty command" };
  }
  if (trimmed.length > policy.maxCommandLength) {
    return { ok: false, reason: `command exceeds max length (${policy.maxCommandLength})` };
  }

  const lower = trimmed.toLowerCase();
  for (const blocked of policy.blockedSubstrings) {
    if (blocked && lower.includes(blocked.toLowerCase())) {
      return { ok: false, reason: `blocked pattern: ${blocked}` };
    }
  }

  if (policy.blockMetacharacters && METACHAR_RE.test(trimmed)) {
    return {
      ok: false,
      reason: "shell metacharacters are not allowed (; | & ` $ < > etc.)",
    };
  }

  if (policy.blockAbsolutePaths && ABSOLUTE_PATH_RE.test(trimmed)) {
    return { ok: false, reason: "absolute or home-relative paths are not allowed in shell commands" };
  }

  const token = firstCommandToken(trimmed).toLowerCase();
  if (!token) {
    return { ok: false, reason: "could not determine command name" };
  }

  if (SHELL_INTERPRETER_COMMANDS.includes(token as (typeof SHELL_INTERPRETER_COMMANDS)[number])) {
    return { ok: false, reason: `shell interpreter command is not allowed: ${token}` };
  }

  const allowed = new Set(policy.allowedCommands.map((entry) => entry.toLowerCase()));
  if (!allowed.has(token)) {
    return {
      ok: false,
      reason: `command not in allowlist: ${token} (preset: ${policy.preset})`,
    };
  }

  if (policy.blockGitPush && /\bgit\s+push\b/i.test(trimmed)) {
    return { ok: false, reason: "git push is blocked by policy" };
  }

  if (policy.blockDestructiveRm && /\brm\s+.*\s+-rf\b/i.test(trimmed)) {
    return { ok: false, reason: "rm -rf is blocked by policy" };
  }

  if (policy.blockInlineCodeExecution && CODE_EXECUTION_RE.test(trimmed)) {
    return { ok: false, reason: "inline code execution (-c / --eval) is blocked" };
  }

  return { ok: true };
}

export function buildMinimalShellEnv(workspaceRoot: string, inheritedPath?: string): Record<string, string> {
  return {
    PATH: inheritedPath ?? process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: workspaceRoot,
    PWD: workspaceRoot,
    LANG: process.env.LANG ?? "C.UTF-8",
    TERM: "dumb",
  };
}

export function buildMinimalAgentEnv(
  agent: { id: string; companyId: string },
  workspaceRoot: string,
  paperclipEnv: Record<string, string>,
  adapterEnv: Record<string, string>,
): Record<string, string> {
  const out = buildMinimalShellEnv(workspaceRoot, process.env.PATH);
  for (const [key, value] of Object.entries(paperclipEnv)) {
    if (key.startsWith("PAPERCLIP_")) {
      out[key] = value;
    }
  }
  if (typeof adapterEnv.PAPERCLIP_API_KEY === "string" && adapterEnv.PAPERCLIP_API_KEY.trim()) {
    out.PAPERCLIP_API_KEY = adapterEnv.PAPERCLIP_API_KEY.trim();
  }
  return out;
}
