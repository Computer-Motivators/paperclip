export { execute } from "./execute.js";
export { parseDirectOpenRouterJsonl } from "./parse.js";
export { testEnvironment } from "./test.js";
export { getConfigSchema } from "./config-schema.js";
import type { AdapterSessionCodec } from "@paperclipai/adapter-utils";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const rec = raw as Record<string, unknown>;
    const sessionId = readString(rec.sessionId) ?? readString(rec.session_id);
    if (!sessionId) return null;
    const bundleKey = readString(rec.bundleKey);
    const cwd = readString(rec.cwd);
    const messages = Array.isArray(rec.messages) ? rec.messages : undefined;
    return {
      sessionId,
      ...(bundleKey ? { bundleKey } : {}),
      ...(cwd ? { cwd } : {}),
      ...(messages ? { messages } : {}),
    };
  },
  serialize(params: Record<string, unknown> | null) {
    if (!params) return null;
    const sessionId = readString(params.sessionId) ?? readString(params.session_id);
    if (!sessionId) return null;
    const bundleKey = readString(params.bundleKey);
    const cwd = readString(params.cwd);
    const messages = Array.isArray(params.messages) ? params.messages : undefined;
    return {
      sessionId,
      ...(bundleKey ? { bundleKey } : {}),
      ...(cwd ? { cwd } : {}),
      ...(messages ? { messages } : {}),
    };
  },
  getDisplayId(params: Record<string, unknown> | null) {
    if (!params) return null;
    return readString(params.sessionId) ?? readString(params.session_id);
  },
};
