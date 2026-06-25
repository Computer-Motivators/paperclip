export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { getConfigSchema } from "./config-schema.js";
export {
  registerInsideOutClaimStore,
  getInsideOutClaimStore,
  resetInsideOutClaimStoreForTests,
  type InsideOutClaimStore,
} from "./claim-store.js";
import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const rec = raw as Record<string, unknown>;
    const externalAgentId = readString(rec.externalAgentId);
    const lastRunId = readString(rec.lastRunId);
    if (!externalAgentId && !lastRunId) return null;
    return {
      ...(externalAgentId ? { externalAgentId } : {}),
      ...(lastRunId ? { lastRunId } : {}),
    };
  },
  serialize(params: Record<string, unknown> | null) {
    if (!params) return null;
    const externalAgentId = readString(params.externalAgentId);
    const lastRunId = readString(params.lastRunId);
    if (!externalAgentId && !lastRunId) return null;
    return {
      ...(externalAgentId ? { externalAgentId } : {}),
      ...(lastRunId ? { lastRunId } : {}),
    };
  },
  getDisplayId(params: Record<string, unknown> | null) {
    if (!params) return null;
    return readString(params.externalAgentId) ?? readString(params.lastRunId);
  },
};
