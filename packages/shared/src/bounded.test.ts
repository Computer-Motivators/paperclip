import { describe, expect, it } from "vitest";
import { appendWithMaxItems, BoundedLruCache, createSingleFlight } from "./bounded.js";

describe("appendWithMaxItems", () => {
  it("returns combined when under cap", () => {
    expect(appendWithMaxItems([1, 2], [3], 5)).toEqual({ items: [1, 2, 3], dropped: 0 });
  });

  it("drops oldest when over cap", () => {
    expect(appendWithMaxItems([1, 2, 3], [4, 5], 4)).toEqual({ items: [2, 3, 4, 5], dropped: 2 });
  });
});

describe("BoundedLruCache", () => {
  it("evicts least recently used entry", () => {
    const cache = new BoundedLruCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    expect(cache.evictionCount).toBe(1);
  });
});

describe("createSingleFlight", () => {
  it("coalesces concurrent runs", async () => {
    const sf = createSingleFlight<number>();
    let runs = 0;
    const work = () =>
      new Promise<number>((resolve) => {
        runs += 1;
        setTimeout(() => resolve(42), 10);
      });
    const [a, b] = await Promise.all([sf.run(work), sf.run(work)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(runs).toBe(1);
  });
});
