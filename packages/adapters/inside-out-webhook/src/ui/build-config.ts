import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import {
  INSIDE_OUT_DEFAULT_HEARTBEAT_INTERVAL_SEC,
  INSIDE_OUT_DEFAULT_MAX_LEASE_SEC,
  INSIDE_OUT_DEFAULT_MAX_REQUEUE_ATTEMPTS,
  INSIDE_OUT_DEFAULT_QUEUE_TIMEOUT_SEC,
  INSIDE_OUT_DEFAULT_WORK_LEASE_SEC,
} from "@paperclipai/shared";
import { DEFAULT_INSIDE_OUT_SYSTEM_PROMPT } from "../defaults.js";

function readString(values: CreateConfigValues, key: string, fallback = ""): string {
  const value = values[key];
  return typeof value === "string" ? value.trim() : fallback;
}

function readNumber(values: CreateConfigValues, key: string, fallback: number): number {
  const value = values[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readBoolean(values: CreateConfigValues, key: string, fallback: boolean): boolean {
  const value = values[key];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function buildInsideOutAdapterConfig(values: CreateConfigValues): Record<string, unknown> {
  return {
    pullToken: readString(values, "pullToken"),
    queueTimeoutSec: readNumber(values, "queueTimeoutSec", INSIDE_OUT_DEFAULT_QUEUE_TIMEOUT_SEC),
    workLeaseSec: readNumber(values, "workLeaseSec", INSIDE_OUT_DEFAULT_WORK_LEASE_SEC),
    maxLeaseSec: readNumber(values, "maxLeaseSec", INSIDE_OUT_DEFAULT_MAX_LEASE_SEC),
    heartbeatIntervalSec: readNumber(values, "heartbeatIntervalSec", INSIDE_OUT_DEFAULT_HEARTBEAT_INTERVAL_SEC),
    onLeaseExpiry: readString(values, "onLeaseExpiry", "requeue") === "fail" ? "fail" : "requeue",
    maxRequeueAttempts: readNumber(values, "maxRequeueAttempts", INSIDE_OUT_DEFAULT_MAX_REQUEUE_ATTEMPTS),
    externalAgentIdHeader: readString(values, "externalAgentIdHeader", "X-External-Agent-Id"),
    promptTemplate: readString(values, "promptTemplate", DEFAULT_INSIDE_OUT_SYSTEM_PROMPT),
    includeInstructionsBundle: readBoolean(values, "includeInstructionsBundle", true),
    includeMcpManifest: readBoolean(values, "includeMcpManifest", true),
  };
}
