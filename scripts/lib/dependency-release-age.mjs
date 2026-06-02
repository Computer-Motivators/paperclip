/**
 * Helpers to defer npm installs to versions published at least N minutes ago.
 * Used by scripts/check-dependency-release-age.mjs and PR quality gates.
 */

const DEFAULT_MIN_RELEASE_AGE_MINUTES = 1440;

export function parseMinReleaseAgeMinutes(raw = process.env.PAPERCLIP_MIN_RELEASE_AGE_MINUTES) {
  if (raw == null || raw === "") return DEFAULT_MIN_RELEASE_AGE_MINUTES;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid PAPERCLIP_MIN_RELEASE_AGE_MINUTES: ${raw}`);
  }
  return parsed;
}

export function encodePackageNameForRegistry(packageName) {
  return packageName.startsWith("@")
    ? packageName.replace("/", "%2F")
    : packageName;
}

export function parseLockfilePackageEntry(rawKey) {
  let trimmed = rawKey.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    trimmed = trimmed.slice(1, -1);
  }
  const paren = trimmed.indexOf("(");
  const withoutPeer = paren >= 0 ? trimmed.slice(0, paren) : trimmed;
  const match = withoutPeer.match(/^(?:@([^/]+)\/([^@]+)|([^@]+))@(.+)$/);
  if (!match) return null;
  const packageName = match[1]
    ? `@${match[1]}/${match[2]}`
    : match[3];
  const version = match[4];
  if (!packageName || !version) return null;
  return { packageName, version };
}

export function parseLockfilePackageKeys(lockfileText) {
  const packages = new Map();
  for (const line of lockfileText.split("\n")) {
    const match = line.match(/^ {2}([^:\n]+):$/);
    if (!match) continue;
    const parsed = parseLockfilePackageEntry(match[1]);
    if (!parsed) continue;
    packages.set(`${parsed.packageName}@${parsed.version}`, parsed);
  }
  return packages;
}

export function parseLockfilePackageDiffKeys(patchText) {
  const added = new Map();
  const removed = new Set();
  for (const line of patchText.split("\n")) {
    const entry = parseLockfileDiffLine(line);
    if (!entry) continue;
    const key = `${entry.packageName}@${entry.version}`;
    if (entry.sign === "+") added.set(key, entry);
    if (entry.sign === "-") removed.add(key);
  }
  for (const key of removed) added.delete(key);
  return [...added.values()];
}

function parseLockfileDiffLine(line) {
  const match = line.match(/^([+-])\s*(.+?)\s*$/);
  if (!match) return null;
  let [, sign, rawEntry] = match;
  if (!rawEntry.endsWith(":")) return null;
  rawEntry = rawEntry.slice(0, -1).trim();
  if ((rawEntry.startsWith("'") && rawEntry.endsWith("'")) || (rawEntry.startsWith('"') && rawEntry.endsWith('"'))) {
    rawEntry = rawEntry.slice(1, -1);
  }
  const parsed = parseLockfilePackageEntry(rawEntry);
  if (!parsed) return null;
  return { sign, ...parsed };
}

export async function fetchPackageVersionPublishedAt(packageName, version, fetchImpl = fetch) {
  const encoded = encodePackageNameForRegistry(packageName);
  const response = await fetchImpl(`https://registry.npmjs.org/${encoded}`, {
    headers: { accept: "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.1" },
  });
  if (!response.ok) {
    throw new Error(`npm registry lookup failed for ${packageName} (${response.status})`);
  }
  const payload = await response.json();
  const publishedAt = payload?.time?.[version];
  if (!publishedAt) {
    throw new Error(`npm registry has no publish time for ${packageName}@${version}`);
  }
  return new Date(publishedAt);
}

export function isPublishedTooRecently(publishedAt, minAgeMinutes, now = new Date()) {
  const ageMs = now.getTime() - publishedAt.getTime();
  return ageMs < minAgeMinutes * 60_000;
}

export async function findImmatureLockfilePackages(entries, options = {}) {
  const {
    minAgeMinutes = parseMinReleaseAgeMinutes(),
    now = new Date(),
    fetchImpl = fetch,
  } = options;

  const packumentCache = new Map();
  const immature = [];

  for (const entry of entries) {
    const cacheKey = entry.packageName;
    let packumentTimes = packumentCache.get(cacheKey);
    if (!packumentTimes) {
      const encoded = encodePackageNameForRegistry(entry.packageName);
      const response = await fetchImpl(`https://registry.npmjs.org/${encoded}`, {
        headers: { accept: "application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.1" },
      });
      if (!response.ok) {
        throw new Error(`npm registry lookup failed for ${entry.packageName} (${response.status})`);
      }
      const payload = await response.json();
      packumentTimes = payload?.time ?? {};
      packumentCache.set(cacheKey, packumentTimes);
    }

    const publishedAtRaw = packumentTimes[entry.version];
    if (!publishedAtRaw) {
      immature.push({
        ...entry,
        reason: "missing-publish-time",
      });
      continue;
    }

    const publishedAt = new Date(publishedAtRaw);
    if (isPublishedTooRecently(publishedAt, minAgeMinutes, now)) {
      immature.push({
        ...entry,
        publishedAt: publishedAt.toISOString(),
        ageMinutes: Math.max(0, Math.round((now.getTime() - publishedAt.getTime()) / 60_000)),
        minAgeMinutes,
      });
    }
  }

  return immature;
}
