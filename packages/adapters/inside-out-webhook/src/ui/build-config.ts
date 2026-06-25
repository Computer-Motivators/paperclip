import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import {
  INSIDE_OUT_DEFAULT_HEARTBEAT_INTERVAL_SEC,
  INSIDE_OUT_DEFAULT_MAX_LEASE_SEC,
  INSIDE_OUT_DEFAULT_MAX_REQUEUE_ATTEMPTS,
  INSIDE_OUT_DEFAULT_QUEUE_TIMEOUT_SEC,
  INSIDE_OUT_DEFAULT_WORK_LEASE_SEC,
} from "@paperclipai/shared";
import { DEFAULT_INSIDE_OUT_SYSTEM_PROMPT } from "../defaults.js";

function readString(schemaValues: Record<string, unknown>, key: string, fallback = ""): string {
  const value = schemaValues[key];
  return typeof value === "string" ? value.trim() : fallback;
}

function readNumber(schemaValues: Record<string, unknown>, key: string, fallback: number): number {
  const value = schemaValues[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readBoolean(schemaValues: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = schemaValues[key];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function buildInsideOutAdapterConfig(values: CreateConfigValues): Record<string, unknown> {
  const schemaValues = values.adapterSchemaValues ?? {};
  return {
    pullToken: readString(schemaValues, "pullToken"),
    queueTimeoutSec: readNumber(schemaValues, "queueTimeoutSec", INSIDE_OUT_DEFAULT_QUEUE_TIMEOUT_SEC),
    workLeaseSec: readNumber(schemaValues, "workLeaseSec", INSIDE_OUT_DEFAULT_WORK_LEASE_SEC),
    maxLeaseSec: readNumber(schemaValues, "maxLeaseSec", INSIDE_OUT_DEFAULT_MAX_LEASE_SEC),
    heartbeatIntervalSec: readNumber(
      schemaValues,
      "heartbeatIntervalSec",
      INSIDE_OUT_DEFAULT_HEARTBEAT_INTERVAL_SEC,
    ),
    onLeaseExpiry: readString(schemaValues, "onLeaseExpiry", "requeue") === "fail" ? "fail" : "requeue",
    maxRequeueAttempts: readNumber(schemaValues, "maxRequeueAttempts", INSIDE_OUT_DEFAULT_MAX_REQUEUE_ATTEMPTS),
    externalAgentIdHeader: readString(schemaValues, "externalAgentIdHeader", "X-External-Agent-Id"),
    promptTemplate:
      readString(schemaValues, "promptTemplate") ||
      values.promptTemplate ||
      DEFAULT_INSIDE_OUT_SYSTEM_PROMPT,
    includeInstructionsBundle: readBoolean(schemaValues, "includeInstructionsBundle", true),
    includeMcpManifest: readBoolean(schemaValues, "includeMcpManifest", true),
  };
}
