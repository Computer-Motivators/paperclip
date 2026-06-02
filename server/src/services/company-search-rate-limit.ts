export const COMPANY_SEARCH_RATE_LIMIT_WINDOW_MS = 60_000;
export const COMPANY_SEARCH_RATE_LIMIT_MAX_REQUESTS = 60;
/** Max distinct actor keys retained in memory (stale keys evicted first). */
export const COMPANY_SEARCH_RATE_LIMIT_MAX_KEYS = 10_000;

export type CompanySearchRateLimitActor = {
  companyId: string;
  actorType: "agent" | "board";
  actorId: string;
};

export type CompanySearchRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export type CompanySearchRateLimiter = {
  consume(actor: CompanySearchRateLimitActor): CompanySearchRateLimitResult;
  /** Keys evicted due to staleness or global cap (process lifetime). */
  evictedKeyCount(): number;
};

export function createCompanySearchRateLimiter(options: {
  windowMs?: number;
  maxRequests?: number;
  maxKeys?: number;
  now?: () => number;
} = {}): CompanySearchRateLimiter {
  const windowMs = options.windowMs ?? COMPANY_SEARCH_RATE_LIMIT_WINDOW_MS;
  const maxRequests = options.maxRequests ?? COMPANY_SEARCH_RATE_LIMIT_MAX_REQUESTS;
  const maxKeys = options.maxKeys ?? COMPANY_SEARCH_RATE_LIMIT_MAX_KEYS;
  const now = options.now ?? Date.now;
  const hitsByKey = new Map<string, number[]>();
  let evictedKeys = 0;

  function key(actor: CompanySearchRateLimitActor) {
    return `${actor.companyId}:${actor.actorType}:${actor.actorId}`;
  }

  function pruneStaleKeys(cutoff: number) {
    for (const [actorKey, hits] of hitsByKey) {
      const recentHits = hits.filter((hit) => hit > cutoff);
      if (recentHits.length === 0) {
        hitsByKey.delete(actorKey);
        evictedKeys += 1;
      } else if (recentHits.length !== hits.length) {
        hitsByKey.set(actorKey, recentHits);
      }
    }
  }

  function enforceKeyCap() {
    while (hitsByKey.size > maxKeys) {
      const oldest = hitsByKey.keys().next().value;
      if (oldest === undefined) break;
      hitsByKey.delete(oldest);
      evictedKeys += 1;
    }
  }

  return {
    evictedKeyCount: () => evictedKeys,
    consume(actor) {
      const currentTime = now();
      const cutoff = currentTime - windowMs;
      pruneStaleKeys(cutoff);
      enforceKeyCap();

      const actorKey = key(actor);
      const recentHits = (hitsByKey.get(actorKey) ?? []).filter((hit) => hit > cutoff);

      if (recentHits.length >= maxRequests) {
        const oldestHit = recentHits[0] ?? currentTime;
        hitsByKey.set(actorKey, recentHits);
        return {
          allowed: false,
          limit: maxRequests,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((oldestHit + windowMs - currentTime) / 1000)),
        };
      }

      recentHits.push(currentTime);
      hitsByKey.set(actorKey, recentHits);
      return {
        allowed: true,
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - recentHits.length),
        retryAfterSeconds: 0,
      };
    },
  };
}
