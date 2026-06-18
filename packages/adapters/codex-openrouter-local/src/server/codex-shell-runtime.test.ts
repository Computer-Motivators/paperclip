import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectCodexShellRuntime,
  shouldDisableCodexShellZshFork,
} from "./codex-shell-runtime.js";

describe("codex-shell-runtime", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("detects bundled zsh relative to the codex binary", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-shell-runtime-"));
    tempDirs.push(root);
    const binDir = path.join(root, "bin");
    const bundledZsh = path.join(root, "codex-resources", "zsh", "bin", "zsh");
    await fs.mkdir(binDir, { recursive: true });
    await fs.mkdir(path.dirname(bundledZsh), { recursive: true });
    await fs.writeFile(path.join(binDir, "codex"), "#!/bin/sh\necho codex\n", { mode: 0o755 });
    await fs.writeFile(bundledZsh, "#!/bin/sh\necho zsh\n", { mode: 0o755 });

    const runtime = await detectCodexShellRuntime({
      codexCommand: path.join(binDir, "codex"),
      cwd: root,
      env: { PATH: binDir },
    });

    expect(runtime.bundledZshPath).toBe(bundledZsh);
    expect(runtime.shellZshForkViable).toBe(true);
    expect(shouldDisableCodexShellZshFork(runtime)).toBe(false);
  });

  it("disables shell_zsh_fork when bundled zsh is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "codex-shell-runtime-"));
    tempDirs.push(root);
    const binDir = path.join(root, "bin");
    await fs.mkdir(binDir, { recursive: true });
    await fs.writeFile(path.join(binDir, "codex"), "#!/bin/sh\necho codex\n", { mode: 0o755 });

    const runtime = await detectCodexShellRuntime({
      codexCommand: path.join(binDir, "codex"),
      cwd: root,
      env: { PATH: binDir },
    });

    expect(runtime.bundledZshPath).toBeNull();
    expect(runtime.shellZshForkViable).toBe(false);
    expect(shouldDisableCodexShellZshFork(runtime)).toBe(true);
  });
});
