---
title: Inside-Out Webhook
summary: Pull-based adapter for external agents that check in with Paperclip for work
---

The `inside_out_webhook` adapter inverts the normal `http` adapter flow. Paperclip queues heartbeat work and holds the run open until an external worker pulls a manifest, does work through the standard Paperclip API/MCP surface, and signals completion.

## When to use it

- A Claude Code cron, remote host, or custom worker should **pull** assignments instead of Paperclip spawning a local CLI.
- The external runtime owns its filesystem and tooling; Paperclip remains the control plane for issues, governance, and audit.

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `pullToken` | auto-generated | Bearer token for `POST /api/inside-out/pull` |
| `queueTimeoutSec` | `86400` | Max seconds waiting for first external claim |
| `workLeaseSec` | `3600` | Initial lease after claim |
| `maxLeaseSec` | `14400` | Cap on extended lease |
| `heartbeatIntervalSec` | `300` | Recommended client heartbeat interval |
| `onLeaseExpiry` | `requeue` | `requeue` or `fail` when a worker stops heartbeating |
| `maxRequeueAttempts` | `2` | Requeue budget before failing the run |
| `promptTemplate` | bundled default | System prompt included in pull manifests |

## External worker flow

1. `POST /api/inside-out/pull` with agent API key **or** `pullToken`
2. Use returned `runId` as `X-Paperclip-Run-Id` on mutating Paperclip API calls
3. `POST /api/inside-out/runs/:runId/heartbeat` while working
4. `POST /api/inside-out/runs/:runId/complete` when finished

Optional setup manifest: `GET /api/inside-out/agents/:agentId/bootstrap`

## MCP

Configure `@paperclipai/mcp-server` in the external agent and set `PAPERCLIP_RUN_ID` from the pull manifest before mutating calls.

## Locking

Only one external worker may hold an active claim per run. Expired leases are requeued (by default) so another poller can pick up the work.
