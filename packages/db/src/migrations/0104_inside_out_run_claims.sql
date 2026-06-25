CREATE TABLE "inside_out_run_claims" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" text DEFAULT 'awaiting_pickup' NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"requeue_count" integer DEFAULT 0 NOT NULL,
	"completion_outcome" text,
	"completion_summary" text,
	"completion_result_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inside_out_run_claims" ADD CONSTRAINT "inside_out_run_claims_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inside_out_run_claims" ADD CONSTRAINT "inside_out_run_claims_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inside_out_run_claims" ADD CONSTRAINT "inside_out_run_claims_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inside_out_run_claims_agent_status_created_idx" ON "inside_out_run_claims" USING btree ("agent_id","status","created_at");--> statement-breakpoint
CREATE INDEX "inside_out_run_claims_lease_expires_idx" ON "inside_out_run_claims" USING btree ("lease_expires_at");--> statement-breakpoint
CREATE INDEX "inside_out_run_claims_company_idx" ON "inside_out_run_claims" USING btree ("company_id");
