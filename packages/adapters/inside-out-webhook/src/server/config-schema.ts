import type { AdapterConfigSchema } from "@paperclipai/adapter-utils";
import {
  INSIDE_OUT_DEFAULT_HEARTBEAT_INTERVAL_SEC,
  INSIDE_OUT_DEFAULT_MAX_LEASE_SEC,
  INSIDE_OUT_DEFAULT_MAX_REQUEUE_ATTEMPTS,
  INSIDE_OUT_DEFAULT_QUEUE_TIMEOUT_SEC,
  INSIDE_OUT_DEFAULT_WORK_LEASE_SEC,
} from "@paperclipai/shared";
import { DEFAULT_INSIDE_OUT_SYSTEM_PROMPT } from "../defaults.js";

export function getConfigSchema(): AdapterConfigSchema {
  return {
    fields: [
      {
        key: "pullToken",
        label: "Pull token",
        type: "text",
        hint: "Bearer token for POST /api/inside-out/pull without a full agent API key. Auto-generated when empty.",
      },
      {
        key: "queueTimeoutSec",
        label: "Queue timeout (seconds)",
        type: "number",
        default: INSIDE_OUT_DEFAULT_QUEUE_TIMEOUT_SEC,
        hint: "Max time a run waits for an external worker to claim it.",
      },
      {
        key: "workLeaseSec",
        label: "Work lease (seconds)",
        type: "number",
        default: INSIDE_OUT_DEFAULT_WORK_LEASE_SEC,
      },
      {
        key: "maxLeaseSec",
        label: "Max lease (seconds)",
        type: "number",
        default: INSIDE_OUT_DEFAULT_MAX_LEASE_SEC,
      },
      {
        key: "heartbeatIntervalSec",
        label: "Recommended heartbeat interval (seconds)",
        type: "number",
        default: INSIDE_OUT_DEFAULT_HEARTBEAT_INTERVAL_SEC,
      },
      {
        key: "onLeaseExpiry",
        label: "On lease expiry",
        type: "select",
        default: "requeue",
        options: [
          { value: "requeue", label: "Requeue for another worker" },
          { value: "fail", label: "Fail the run" },
        ],
      },
      {
        key: "maxRequeueAttempts",
        label: "Max requeue attempts",
        type: "number",
        default: INSIDE_OUT_DEFAULT_MAX_REQUEUE_ATTEMPTS,
      },
      {
        key: "externalAgentIdHeader",
        label: "External agent id header",
        type: "text",
        default: "X-External-Agent-Id",
      },
      {
        key: "promptTemplate",
        label: "External worker system prompt",
        type: "textarea",
        default: DEFAULT_INSIDE_OUT_SYSTEM_PROMPT,
      },
      {
        key: "includeInstructionsBundle",
        label: "Include instructions bundle URL in pull manifest",
        type: "toggle",
        default: true,
      },
      {
        key: "includeMcpManifest",
        label: "Include MCP server hint in pull manifest",
        type: "toggle",
        default: true,
      },
    ],
  };
}
