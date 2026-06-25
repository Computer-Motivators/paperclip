import type { InsideOutCompletionOutcome } from "@paperclipai/shared";

export interface InsideOutClaimSnapshot {
  status: string;
  completionOutcome?: InsideOutCompletionOutcome | null;
  completionSummary?: string | null;
  completionResultJson?: Record<string, unknown> | null;
  claimedBy?: string | null;
}

export interface InsideOutClaimStore {
  createClaim(input: { runId: string; companyId: string; agentId: string }): Promise<void>;
  getClaim(runId: string): Promise<InsideOutClaimSnapshot | null>;
  getRunStatus(runId: string): Promise<string | null>;
}

let claimStore: InsideOutClaimStore | null = null;

export function registerInsideOutClaimStore(store: InsideOutClaimStore): void {
  claimStore = store;
}

export function getInsideOutClaimStore(): InsideOutClaimStore {
  if (!claimStore) {
    throw new Error("Inside-out claim store is not registered");
  }
  return claimStore;
}

export function resetInsideOutClaimStoreForTests(): void {
  claimStore = null;
}
