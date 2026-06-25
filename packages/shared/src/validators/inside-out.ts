import { z } from "zod";
import {
  INSIDE_OUT_CLAIM_STATUSES,
  INSIDE_OUT_COMPLETION_OUTCOMES,
  INSIDE_OUT_LEASE_EXPIRY_POLICIES,
  INSIDE_OUT_PROTOCOL_VERSION,
} from "../constants.js";

export const insideOutClaimStatusSchema = z.enum(INSIDE_OUT_CLAIM_STATUSES);
export const insideOutCompletionOutcomeSchema = z.enum(INSIDE_OUT_COMPLETION_OUTCOMES);
export const insideOutLeaseExpiryPolicySchema = z.enum(INSIDE_OUT_LEASE_EXPIRY_POLICIES);

export const insideOutPullSchema = z.object({
  leaseSec: z.number().int().positive().max(86_400).optional(),
  externalAgentId: z.string().trim().min(1).max(256).optional(),
  preferRunId: z.string().uuid().optional().nullable(),
});

export const insideOutHeartbeatSchema = z.object({
  leaseSec: z.number().int().positive().max(86_400).optional(),
  message: z.string().trim().max(4000).optional().nullable(),
  externalAgentId: z.string().trim().min(1).max(256).optional(),
});

export const insideOutCompleteSchema = z.object({
  outcome: insideOutCompletionOutcomeSchema,
  summary: z.string().trim().max(8000).optional().nullable(),
  resultJson: z.record(z.unknown()).optional().nullable(),
  externalAgentId: z.string().trim().min(1).max(256).optional(),
});

export const insideOutReleaseSchema = z.object({
  externalAgentId: z.string().trim().min(1).max(256).optional(),
  reason: z.string().trim().max(2000).optional().nullable(),
});

export const insideOutProtocolVersionSchema = z.literal(INSIDE_OUT_PROTOCOL_VERSION);
