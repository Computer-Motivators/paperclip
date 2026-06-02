/**
 * Memory-first bounded collections used by server and UI runtimes.
 */

export type BoundedAppendResult<T> = {
  items: T[];
  dropped: number;
};

/** Append items then retain only the last `maxItems` (drops oldest). */
export function appendWithMaxItems<T>(
  existing: readonly T[],
  incoming: readonly T[],
  maxItems: number,
): BoundedAppendResult<T> {
  if (incoming.length === 0) {
    return { items: existing.length <= maxItems ? [...existing] : existing.slice(-maxItems), dropped: 0 };
  }
  const combined = [...existing, ...incoming];
  if (combined.length <= maxItems) {
    return { items: combined, dropped: 0 };
  }
  const dropped = combined.length - maxItems;
  return { items: combined.slice(-maxItems), dropped };
}

/** Simple LRU cache with a fixed maximum entry count. */
export class BoundedLruCache<K, V> {
  private readonly map = new Map<K, V>();
  private evictions = 0;

  constructor(private readonly maxSize: number) {
    if (maxSize < 1) throw new Error("BoundedLruCache maxSize must be >= 1");
  }

  get size(): number {
    return this.map.size;
  }

  get evictionCount(): number {
    return this.evictions;
  }

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        this.map.delete(oldest);
        this.evictions += 1;
      }
    }
    this.map.set(key, value);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

/** Run async work at most once concurrently; overlapping callers await the in-flight run. */
export function createSingleFlight<T>(): {
  run(fn: () => Promise<T>): Promise<T>;
  inFlight: () => boolean;
} {
  let inFlight: Promise<T> | null = null;

  return {
    inFlight: () => inFlight !== null,
    run(fn) {
      if (inFlight) return inFlight;
      inFlight = fn().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
