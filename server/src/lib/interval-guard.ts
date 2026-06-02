/**
 * Prevents overlapping executions of periodic scheduler work.
 */
export function createIntervalGuard(label: string) {
  let inProgress = false;
  let skippedTicks = 0;

  return {
    label,
    skippedTicks: () => skippedTicks,
    async run(work: () => Promise<void>): Promise<void> {
      if (inProgress) {
        skippedTicks += 1;
        return;
      }
      inProgress = true;
      try {
        await work();
      } finally {
        inProgress = false;
      }
    },
  };
}
