#!/usr/bin/env node
/**
 * Fails when pnpm-lock.yaml resolves npm packages published more recently than
 * PAPERCLIP_MIN_RELEASE_AGE_MINUTES (default: 1440 = 24 hours).
 *
 * Usage:
 *   node scripts/check-dependency-release-age.mjs
 *   node scripts/check-dependency-release-age.mjs --lockfile path/to/pnpm-lock.yaml
 *   node scripts/check-dependency-release-age.mjs --changed-only  # git diff packages
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import {
  findImmatureLockfilePackages,
  parseLockfilePackageDiffKeys,
  parseLockfilePackageKeys,
  parseMinReleaseAgeMinutes,
} from "./lib/dependency-release-age.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {
    lockfilePath: path.join(repoRoot, "pnpm-lock.yaml"),
    changedOnly: true,
    fullLockfile: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--changed-only") {
      options.changedOnly = true;
      options.fullLockfile = false;
      continue;
    }
    if (arg === "--full") {
      options.changedOnly = false;
      options.fullLockfile = true;
      continue;
    }
    if (arg === "--lockfile") {
      options.lockfilePath = path.resolve(argv[i + 1] ?? "");
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readGitLockfilePatch(lockfilePath) {
  const relative = path.relative(repoRoot, lockfilePath) || lockfilePath;
  try {
    return execSync(`git diff --unified=0 HEAD -- ${JSON.stringify(relative)}`, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

async function loadEntries(options) {
  if (options.changedOnly) {
    const patch = readGitLockfilePatch(options.lockfilePath);
    const changed = parseLockfilePackageDiffKeys(patch);
    if (changed.length > 0) return changed;
    console.log("No lockfile package changes detected; skipping release-age check.");
    return [];
  }

  const lockfileText = await fs.readFile(options.lockfilePath, "utf8");
  return [...parseLockfilePackageKeys(lockfileText).values()];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const minAgeMinutes = parseMinReleaseAgeMinutes();
  const entries = await loadEntries(options);

  if (entries.length === 0) {
    console.log("No registry packages to check.");
    return;
  }

  console.log(
    `Checking ${entries.length} lockfile package(s) for minimum release age (${minAgeMinutes} minutes)...`,
  );

  const immature = await findImmatureLockfilePackages(entries, { minAgeMinutes });
  if (immature.length === 0) {
    console.log("All checked packages meet the minimum release age.");
    return;
  }

  console.error("\nPackages published too recently:");
  for (const entry of immature) {
    if (entry.reason === "missing-publish-time") {
      console.error(`- ${entry.packageName}@${entry.version} (no npm publish timestamp)`);
      continue;
    }
    console.error(
      `- ${entry.packageName}@${entry.version} (published ${entry.publishedAt}, age ${entry.ageMinutes}m < ${entry.minAgeMinutes}m)`,
    );
  }
  console.error(
    "\nWait for newer versions to age out, pin an older version, or temporarily set PAPERCLIP_MIN_RELEASE_AGE_MINUTES=0 for an emergency install.",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
