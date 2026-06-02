import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildOpenRouterConfigToml,
  prepareManagedCodexOpenRouterHome,
  writeOpenRouterAuthJson,
  writeOpenRouterConfigToml,
} from "./codex-openrouter-home.js";

describe("codex-openrouter-home", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("builds OpenRouter config.toml with model_provider and provider block", () => {
    const toml = buildOpenRouterConfigToml("high");
    expect(toml).toContain('model_provider = "openrouter"');
    expect(toml).toContain('model_reasoning_effort = "high"');
    expect(toml).toContain("[model_providers.openrouter]");
    expect(toml).toContain("https://openrouter.ai/api/v1");
    expect(toml).toContain('env_key = "OPENROUTER_API_KEY"');
  });

  it("writes auth.json with OPENROUTER_API_KEY only", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-or-auth-"));
    tempDirs.push(home);
    await writeOpenRouterAuthJson(home, "sk-or-test");
    const raw = await fs.readFile(path.join(home, "auth.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({ OPENROUTER_API_KEY: "sk-or-test" });
  });

  it("prepareManagedCodexOpenRouterHome materializes config and auth", async () => {
    const prevHome = process.env.PAPERCLIP_HOME;
    const prevInstance = process.env.PAPERCLIP_INSTANCE_ID;
    const paperclipHome = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-or-"));
    tempDirs.push(paperclipHome);
    process.env.PAPERCLIP_HOME = paperclipHome;
    process.env.PAPERCLIP_INSTANCE_ID = "test-instance";

    try {
      const logs: string[] = [];
      const home = await prepareManagedCodexOpenRouterHome(
        process.env,
        async (_stream, chunk) => {
          logs.push(chunk);
        },
        "company-1",
        { apiKey: "sk-or-managed", modelReasoningEffort: "medium" },
      );
      tempDirs.push(home);

      const configToml = await fs.readFile(path.join(home, "config.toml"), "utf8");
      expect(configToml).toContain('model_provider = "openrouter"');
      expect(configToml).toContain('model_reasoning_effort = "medium"');

      const auth = JSON.parse(await fs.readFile(path.join(home, "auth.json"), "utf8"));
      expect(auth.OPENROUTER_API_KEY).toBe("sk-or-managed");
      expect(logs.some((line) => line.includes("OpenRouter"))).toBe(true);
    } finally {
      if (prevHome === undefined) delete process.env.PAPERCLIP_HOME;
      else process.env.PAPERCLIP_HOME = prevHome;
      if (prevInstance === undefined) delete process.env.PAPERCLIP_INSTANCE_ID;
      else process.env.PAPERCLIP_INSTANCE_ID = prevInstance;
    }
  });

  it("writeOpenRouterConfigToml overwrites existing config", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "codex-or-cfg-"));
    tempDirs.push(home);
    await fs.writeFile(path.join(home, "config.toml"), 'model_provider = "openai"\n', "utf8");
    await writeOpenRouterConfigToml(home);
    const configToml = await fs.readFile(path.join(home, "config.toml"), "utf8");
    expect(configToml).toContain('model_provider = "openrouter"');
    expect(configToml).not.toContain('model_provider = "openai"');
  });
});
