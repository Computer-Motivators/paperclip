import { logger } from "../middleware/logger.js";
import { getLiveEventListenerStats } from "../services/live-events.js";
import { getPluginLogBufferDroppedCount } from "../services/plugin-host-services.js";

export type ProcessMemorySnapshot = {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
};

export function readProcessMemorySnapshot(): ProcessMemorySnapshot {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Periodically log process memory usage and pressure/drop counters.
 * Returns a stop function.
 */
export function startMemoryTelemetry(): () => void {
  const intervalMs = parsePositiveInt(process.env.PAPERCLIP_MEMORY_TELEMETRY_INTERVAL_MS, 60_000);
  if (intervalMs <= 0) return () => {};

  const timer = setInterval(() => {
    logger.info(
      {
        memory: readProcessMemorySnapshot(),
        pluginLogBufferDropped: getPluginLogBufferDroppedCount(),
        liveEventListeners: getLiveEventListenerStats(),
      },
      "process memory telemetry",
    );

    if (global.gc) {
      try {
        global.gc();
      } catch {
        // optional --expose-gc
      }
    }
  }, intervalMs);

  if (timer.unref) timer.unref();
  return () => clearInterval(timer);
}
