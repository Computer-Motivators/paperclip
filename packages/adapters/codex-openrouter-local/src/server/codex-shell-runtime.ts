import fs from "node:fs/promises";
import path from "node:path";

export type CodexShellRuntimeInfo = {
  codexPath: string | null;
  bundledZshPath: string | null;
  systemZshPath: string | null;
  shellZshForkViable: boolean;
};

async function pathExists(candidate: string): Promise<boolean> {
  return fs.access(candidate).then(() => true).catch(() => false);
}

async function isExecutable(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveCommandPath(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<string | null> {
  const hasPathSeparator = command.includes("/") || command.includes("\\");
  if (hasPathSeparator) {
    const absolute = path.isAbsolute(command) ? command : path.resolve(cwd, command);
    return (await pathExists(absolute)) ? absolute : null;
  }

  const pathValue = env.PATH ?? env.Path ?? "";
  const delimiter = process.platform === "win32" ? ";" : ":";
  for (const dir of pathValue.split(delimiter).filter(Boolean)) {
    const candidate = path.join(dir, command);
    if (await pathExists(candidate)) return candidate;
  }

  return null;
}

async function resolveRealPath(candidate: string): Promise<string> {
  try {
    return await fs.realpath(candidate);
  } catch {
    return candidate;
  }
}

async function findBundledCodexZsh(codexPath: string): Promise<string | null> {
  const resolvedCodex = await resolveRealPath(codexPath);
  let cursor = path.dirname(resolvedCodex);

  for (let depth = 0; depth < 8; depth += 1) {
    const candidates = [
      path.join(cursor, "codex-resources", "zsh", "bin", "zsh"),
      path.join(cursor, "@openai", "codex", "codex-resources", "zsh", "bin", "zsh"),
    ];
    for (const candidate of candidates) {
      if (await isExecutable(candidate)) return candidate;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  return null;
}

async function findSystemZsh(env: NodeJS.ProcessEnv): Promise<string | null> {
  const candidates = ["/usr/bin/zsh", "/bin/zsh"];
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) return candidate;
  }
  return await resolveCommandPath("zsh", process.cwd(), env);
}

export async function detectCodexShellRuntime(input: {
  codexCommand?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<CodexShellRuntimeInfo> {
  const codexCommand = input.codexCommand?.trim() || "codex";
  const cwd = input.cwd?.trim() || process.cwd();
  const env = input.env ?? process.env;
  const codexPath = await resolveCommandPath(codexCommand, cwd, env);
  const bundledZshPath = codexPath ? await findBundledCodexZsh(codexPath) : null;
  const systemZshPath = await findSystemZsh(env);

  return {
    codexPath,
    bundledZshPath,
    systemZshPath,
    shellZshForkViable: bundledZshPath !== null,
  };
}

export function shouldDisableCodexShellZshFork(runtime: CodexShellRuntimeInfo): boolean {
  return !runtime.shellZshForkViable;
}
