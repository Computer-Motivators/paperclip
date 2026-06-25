import type { Db } from "@paperclipai/db";
import { registerInsideOutClaimStore } from "@computermotivators/adapter-inside-out-webhook/server";
import { insideOutService } from "../services/inside-out.js";

export function bootstrapInsideOutAdapter(db: Db) {
  const svc = insideOutService(db);
  registerInsideOutClaimStore({
    async createClaim(input) {
      await svc.createClaim(input);
    },
    async getClaim(runId) {
      const claim = await svc.getClaim(runId);
      if (!claim) return null;
      return {
        status: claim.status,
        completionOutcome: (claim.completionOutcome as "succeeded" | "failed" | null) ?? null,
        completionSummary: claim.completionSummary,
        completionResultJson: claim.completionResultJson ?? null,
        claimedBy: claim.claimedBy,
      };
    },
    async getRunStatus(runId) {
      const run = await svc.getRun(runId);
      return run?.status ?? null;
    },
  });
}
