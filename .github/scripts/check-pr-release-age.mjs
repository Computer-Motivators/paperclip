#!/usr/bin/env node
/**
 * check-pr-release-age.mjs
 * Informational gate: warns when a PR lockfile diff pins npm versions
 * published inside the minimum release age window.
 */
import { fileURLToPath } from "node:url";
import { findImmatureLockfilePackages, parseLockfilePackageDiffKeys, parseMinReleaseAgeMinutes } from "../../scripts/lib/dependency-release-age.mjs";

export async function checkReleaseAge(files) {
  const lockfile = files.find((file) => file.filename === "pnpm-lock.yaml");
  if (!lockfile?.patch) return { passed: true, informational: [] };

  const minAgeMinutes = parseMinReleaseAgeMinutes();
  const entries = parseLockfilePackageDiffKeys(lockfile.patch);
  if (entries.length === 0) return { passed: true, informational: [] };

  try {
    const immature = await findImmatureLockfilePackages(entries, { minAgeMinutes });
    if (immature.length === 0) {
      return {
        passed: true,
        informational: [
          `🔒 Lockfile adds ${entries.length} npm package version(s); all meet the ${minAgeMinutes} minute minimum release age.`,
        ],
      };
    }

    const sample = immature
      .slice(0, 8)
      .map((entry) => entry.reason === "missing-publish-time"
        ? `\`${entry.packageName}@${entry.version}\` (no publish timestamp)`
        : `\`${entry.packageName}@${entry.version}\` (${entry.ageMinutes}m old)`)
      .join(", ");

    const suffix = immature.length > 8 ? ` (+${immature.length - 8} more)` : "";
    return {
      passed: true,
      informational: [
        `⚠️ Lockfile pins ${immature.length} npm version(s) newer than the ${minAgeMinutes} minute release-age policy: ${sample}${suffix}. ` +
        "Consider waiting for them to age out or pinning an older version.",
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      passed: true,
      informational: [
        `⚠️ Could not verify npm minimum release age for lockfile changes: ${message}`,
      ],
    };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = JSON.parse(process.env.PR_FILES ?? "[]");
  const result = await checkReleaseAge(files);
  console.log(JSON.stringify(result));
}
