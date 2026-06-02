#!/usr/bin/env node
/**
 * Lightweight memory soak script.
 * Simulates burst allocations and reports steady-state memory over time.
 */

const seconds = Number.parseInt(process.env.SOAK_SECONDS ?? "90", 10);
const burstObjects = Number.parseInt(process.env.SOAK_BURST_OBJECTS ?? "40000", 10);
const burstIntervalMs = Number.parseInt(process.env.SOAK_BURST_INTERVAL_MS ?? "750", 10);

function mb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function snap() {
  const m = process.memoryUsage();
  return {
    rssMb: mb(m.rss),
    heapUsedMb: mb(m.heapUsed),
    heapTotalMb: mb(m.heapTotal),
    externalMb: mb(m.external),
  };
}

const endAt = Date.now() + seconds * 1000;
const keeper = [];
console.log(`[memory-soak] start seconds=${seconds} burstObjects=${burstObjects} burstIntervalMs=${burstIntervalMs}`);

const timer = setInterval(() => {
  const burst = [];
  for (let i = 0; i < burstObjects; i += 1) {
    burst.push({ i, t: Date.now(), payload: `x-${i}`.repeat(4) });
  }
  // retain briefly to allow spikes, then release for GC.
  keeper.push(burst);
  if (keeper.length > 2) keeper.shift();

  if (global.gc) {
    try {
      global.gc();
    } catch {
      // noop
    }
  }

  console.log("[memory-soak] tick", snap());

  if (Date.now() >= endAt) {
    clearInterval(timer);
    keeper.length = 0;
    if (global.gc) {
      try {
        global.gc();
      } catch {
        // noop
      }
    }
    console.log("[memory-soak] done", snap());
  }
}, burstIntervalMs);
