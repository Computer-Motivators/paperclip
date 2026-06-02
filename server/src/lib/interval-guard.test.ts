import { describe, expect, it } from "vitest";
import { createIntervalGuard } from "./interval-guard.js";

describe("createIntervalGuard", () => {
  it("skips overlapping runs", async () => {
    const guard = createIntervalGuard("test");
    let runs = 0;
    let release: (() => void) | undefined;

    const first = guard.run(
      () =>
        new Promise<void>((resolve) => {
          runs += 1;
          release = resolve;
        }),
    );
    const second = guard.run(async () => {
      runs += 1;
    });

    expect(runs).toBe(1);
    expect(guard.skippedTicks()).toBe(1);

    release?.();
    await first;
    await second;
  });
});
