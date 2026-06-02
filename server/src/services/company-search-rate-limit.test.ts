import { describe, expect, it } from "vitest";
import { createCompanySearchRateLimiter } from "./company-search-rate-limit.js";

describe("company search rate limiter memory bounds", () => {
  it("evicts stale actor keys", () => {
    let nowMs = 1_000;
    const limiter = createCompanySearchRateLimiter({
      windowMs: 100,
      maxRequests: 2,
      now: () => nowMs,
    });

    limiter.consume({ companyId: "c1", actorType: "board", actorId: "u1" });
    nowMs += 200;
    limiter.consume({ companyId: "c1", actorType: "board", actorId: "u2" });

    expect(limiter.evictedKeyCount()).toBeGreaterThanOrEqual(1);
  });

  it("enforces max key cap", () => {
    const limiter = createCompanySearchRateLimiter({
      maxKeys: 2,
      windowMs: 10_000,
      maxRequests: 10,
    });

    limiter.consume({ companyId: "c1", actorType: "board", actorId: "u1" });
    limiter.consume({ companyId: "c1", actorType: "board", actorId: "u2" });
    limiter.consume({ companyId: "c1", actorType: "board", actorId: "u3" });

    expect(limiter.evictedKeyCount()).toBeGreaterThanOrEqual(1);
  });
});
