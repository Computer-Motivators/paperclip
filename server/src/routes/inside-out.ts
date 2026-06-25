import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import {
  insideOutCompleteSchema,
  insideOutHeartbeatSchema,
  insideOutPullSchema,
  insideOutReleaseSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { insideOutService } from "../services/inside-out.js";
import { forbidden, unauthorized } from "../errors.js";
import { assertCompanyAccess, assertBoardOrAgent } from "./authz.js";

function resolveApiBaseUrl(req: Request): string {
  const configured = process.env.PAPERCLIP_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = req.get("host");
  const protocol = req.protocol || "http";
  return host ? `${protocol}://${host}` : "http://localhost:3100";
}

  async function resolveInsideOutAgent(req: Request, db: Db, svc: ReturnType<typeof insideOutService>) {
    if (req.actor.type === "agent" && req.actor.agentId && req.actor.companyId) {
      return { agentId: req.actor.agentId, companyId: req.actor.companyId };
    }

  if (req.actor.type === "board") {
    throw forbidden("Inside-out pull requires agent API key or pull token");
  }

  const authHeader = req.header("authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length).trim()
    : "";
  if (!token) throw unauthorized();

  const agent = await svc.resolveAgentFromBearerToken(token);
  if (!agent) throw unauthorized();

  return { agentId: agent.id, companyId: agent.companyId, pullTokenAuth: true as const };
}

export function insideOutRoutes(db: Db) {
  const router = Router();
  const svc = insideOutService(db);

  router.get("/inside-out/agents/:agentId/bootstrap", async (req, res) => {
    assertBoardOrAgent(req);
    const agentId = req.params.agentId as string;
    if (req.actor.type === "agent" && req.actor.agentId !== agentId) {
      throw forbidden("Agents may only read their own bootstrap manifest");
    }
    const bootstrap = await svc.getBootstrap(agentId, resolveApiBaseUrl(req));
    assertCompanyAccess(req, bootstrap.agent.companyId);
    res.json(bootstrap);
  });

  router.post("/inside-out/pull", validate(insideOutPullSchema), async (req, res) => {
    const resolved = await resolveInsideOutAgent(req, db, svc);
    assertCompanyAccess(req, resolved.companyId);

    const company = await db
      .select({ name: companies.name })
      .from(companies)
      .where(eq(companies.id, resolved.companyId))
      .then((rows) => rows[0] ?? null);

    const manifest = await svc.pullWork({
      agentId: resolved.agentId,
      leaseSec: req.body.leaseSec,
      externalAgentId: req.body.externalAgentId,
      preferRunId: req.body.preferRunId,
      apiBaseUrl: resolveApiBaseUrl(req),
      companyName: company?.name ?? null,
    });

    if (!manifest) {
      res.status(204).send();
      return;
    }

    res.json(manifest);
  });

  router.post("/inside-out/runs/:runId/heartbeat", validate(insideOutHeartbeatSchema), async (req, res) => {
    const resolved = await resolveInsideOutAgent(req, db, svc);
    const runId = req.params.runId as string;
    const run = await svc.getRun(runId);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    assertCompanyAccess(req, run.companyId);
    if (run.agentId !== resolved.agentId) throw forbidden("Run belongs to a different agent");

    const result = await svc.heartbeatClaim({
      runId,
      agentId: resolved.agentId,
      leaseSec: req.body.leaseSec,
      externalAgentId: req.body.externalAgentId,
      message: req.body.message,
    });
    res.json(result);
  });

  router.post("/inside-out/runs/:runId/complete", validate(insideOutCompleteSchema), async (req, res) => {
    const resolved = await resolveInsideOutAgent(req, db, svc);
    const runId = req.params.runId as string;
    const run = await svc.getRun(runId);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    assertCompanyAccess(req, run.companyId);
    if (run.agentId !== resolved.agentId) throw forbidden("Run belongs to a different agent");

    const claim = await svc.completeClaim({
      runId,
      agentId: resolved.agentId,
      outcome: req.body.outcome,
      summary: req.body.summary,
      resultJson: req.body.resultJson,
      externalAgentId: req.body.externalAgentId,
    });
    res.json({
      runId: claim.runId,
      status: claim.status,
      outcome: claim.completionOutcome,
      summary: claim.completionSummary,
    });
  });

  router.post("/inside-out/runs/:runId/release", validate(insideOutReleaseSchema), async (req, res) => {
    const resolved = await resolveInsideOutAgent(req, db, svc);
    const runId = req.params.runId as string;
    const run = await svc.getRun(runId);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    assertCompanyAccess(req, run.companyId);
    if (run.agentId !== resolved.agentId) throw forbidden("Run belongs to a different agent");

    const claim = await svc.releaseClaim({
      runId,
      agentId: resolved.agentId,
      externalAgentId: req.body.externalAgentId,
      reason: req.body.reason,
    });
    res.json({ runId: claim.runId, status: claim.status });
  });

  return router;
}
