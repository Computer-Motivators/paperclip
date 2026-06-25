import { pgTable, uuid, text, timestamp, jsonb, index, integer } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const insideOutRunClaims = pgTable(
  "inside_out_run_claims",
  {
    runId: uuid("run_id")
      .primaryKey()
      .references(() => heartbeatRuns.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    status: text("status").notNull().default("awaiting_pickup"),
    claimedBy: text("claimed_by"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    requeueCount: integer("requeue_count").notNull().default(0),
    completionOutcome: text("completion_outcome"),
    completionSummary: text("completion_summary"),
    completionResultJson: jsonb("completion_result_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentStatusCreatedIdx: index("inside_out_run_claims_agent_status_created_idx").on(
      table.agentId,
      table.status,
      table.createdAt,
    ),
    leaseExpiresIdx: index("inside_out_run_claims_lease_expires_idx").on(table.leaseExpiresAt),
    companyIdx: index("inside_out_run_claims_company_idx").on(table.companyId),
  }),
);
