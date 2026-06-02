import { describe, expect, it } from "vitest";
import {
  resolveShellPolicy,
  validateShellCommand,
  firstCommandToken,
} from "./shell-policy.js";

describe("shell-policy", () => {
  it("blocks shell when disabled", () => {
    const policy = resolveShellPolicy({ shellPolicy: "disabled" });
    const result = validateShellCommand("ls", policy);
    expect(result.ok).toBe(false);
  });

  it("allows allowlisted dev commands", () => {
    const policy = resolveShellPolicy({ shellPolicy: "dev" });
    expect(validateShellCommand("pnpm test", policy).ok).toBe(true);
    expect(validateShellCommand("git status", policy).ok).toBe(true);
    expect(firstCommandToken("GIT_DIR=.git git diff")).toBe("git");
  });

  it("blocks metacharacters by default", () => {
    const policy = resolveShellPolicy({ shellPolicy: "dev" });
    expect(validateShellCommand("ls | cat file", policy).ok).toBe(false);
  });

  it("allows metacharacters when toggled", () => {
    const policy = resolveShellPolicy({
      shellPolicy: "dev",
      allowShellMetacharacters: true,
      allowShellAbsolutePaths: true,
    });
    expect(validateShellCommand("echo hello | wc -l", policy).ok).toBe(true);
  });

  it("blocks network unless allowNetworkShellCommands", () => {
    const policy = resolveShellPolicy({ shellPolicy: "dev", allowNetworkShellCommands: false });
    expect(validateShellCommand("curl https://example.com", policy).ok).toBe(false);

    const withNet = resolveShellPolicy({ shellPolicy: "dev", allowNetworkShellCommands: true });
    expect(validateShellCommand("curl https://example.com", withNet).ok).toBe(true);
  });

  it("removes git when allowGit is false", () => {
    const policy = resolveShellPolicy({ shellPolicy: "dev", allowGit: false });
    expect(validateShellCommand("git status", policy).ok).toBe(false);
    expect(validateShellCommand("pnpm test", policy).ok).toBe(true);
  });

  it("respects blockGitPush toggle", () => {
    const blocked = resolveShellPolicy({ shellPolicy: "dev", blockGitPush: true });
    expect(validateShellCommand("git push origin main", blocked).ok).toBe(false);

    const allowed = resolveShellPolicy({ shellPolicy: "dev", blockGitPush: false });
    expect(validateShellCommand("git push origin main", allowed).ok).toBe(true);
  });

  it("applies custom blocked patterns", () => {
    const policy = resolveShellPolicy({
      shellPolicy: "dev",
      blockedShellCommands: "docker",
    });
    expect(validateShellCommand("docker ps", policy).ok).toBe(false);
  });

  it("supports custom allowlist", () => {
    const policy = resolveShellPolicy({
      shellPolicy: "custom",
      allowedShellCommands: "make, cargo",
    });
    expect(validateShellCommand("make test", policy).ok).toBe(true);
    expect(validateShellCommand("pnpm test", policy).ok).toBe(false);
  });
});
