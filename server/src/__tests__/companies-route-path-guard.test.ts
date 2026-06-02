import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { companyRoutes } from "../routes/companies.js";

vi.mock("../services/index.js", () => ({
  companyService: () => ({
    list: vi.fn(),
    stats: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    remove: vi.fn(),
  }),
  companyPortabilityService: () => ({
    exportBundle: vi.fn(),
    previewExport: vi.fn(),
    previewImport: vi.fn(),
    importBundle: vi.fn(),
  }),
  accessService: () => ({
    canUser: vi.fn(),
    ensureMembership: vi.fn(),
  }),
  budgetService: () => ({
    upsertPolicy: vi.fn(),
  }),
  agentService: () => ({
    getById: vi.fn(),
  }),
  feedbackService: () => ({
    listIssueVotesForUser: vi.fn(),
    listFeedbackTraces: vi.fn(),
    getFeedbackTraceById: vi.fn(),
    saveIssueVote: vi.fn(),
  }),
  boardChatService: () => ({
    get: vi.fn(async () => ({ issue: { id: "issue-1" }, agent: { id: "agent-1" } })),
    ensure: vi.fn(async (_companyId: string, _userId: string, agentId: string) => ({
      issue: { id: "issue-1" },
      agent: { id: agentId === "8d2f8967-1f4f-4dc8-9d8b-4ba6d6a0d81d" ? "agent-2" : "agent-1" },
    })),
    updateAgent: vi.fn(async (_companyId: string, _userId: string, _agentId: string) => ({
      issue: { id: "issue-1" },
      agent: { id: "agent-3" },
    })),
  }),
  logActivity: vi.fn(),
}));

describe("company routes malformed issue path guard", () => {
  it("returns a clear error when companyId is missing for issues list path", async () => {
    const app = express();
    app.use((req, _res, next) => {
      (req as any).actor = {
        type: "agent",
        agentId: "agent-1",
        companyId: "company-1",
        source: "agent_key",
      };
      next();
    });
    app.use("/api/companies", companyRoutes({} as any));

    const res = await request(app).get("/api/companies/issues");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Missing companyId in path. Use /api/companies/{companyId}/issues.",
    });
  });
});

describe("company board chat routes", () => {
  it("returns board chat state for board users", async () => {
    const boardChatState = {
      issue: { id: "issue-1" },
      agent: { id: "agent-1" },
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = {
        type: "board",
        userId: "user-1",
        source: "local_implicit",
      };
      next();
    });
    app.use("/api/companies", companyRoutes({} as any));

    const res = await request(app).get("/api/companies/company-1/board-chat");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(boardChatState);
  });

  it("creates or updates board chat issue on POST", async () => {
    const state = {
      issue: { id: "issue-1" },
      agent: { id: "agent-2" },
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = {
        type: "board",
        userId: "user-1",
        source: "local_implicit",
      };
      next();
    });
    app.use("/api/companies", companyRoutes({} as any));

    const res = await request(app)
      .post("/api/companies/company-1/board-chat")
      .send({ agentId: "8d2f8967-1f4f-4dc8-9d8b-4ba6d6a0d81d" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(state);
  });

  it("changes board chat assignee on PATCH", async () => {
    const state = {
      issue: { id: "issue-1" },
      agent: { id: "agent-3" },
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).actor = {
        type: "board",
        userId: "user-1",
        source: "local_implicit",
      };
      next();
    });
    app.use("/api/companies", companyRoutes({} as any));

    const res = await request(app)
      .patch("/api/companies/company-1/board-chat/agent")
      .send({ agentId: "6c8799f7-af56-4dc0-ba55-cf56d7fc91fe" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(state);
  });
});
