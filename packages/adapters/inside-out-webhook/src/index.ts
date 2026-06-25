import { DEFAULT_INSIDE_OUT_SYSTEM_PROMPT } from "./defaults.js";

export const type = "inside_out_webhook";
export const label = "Inside-Out Webhook";

export const models: { id: string; label: string }[] = [];

export const agentConfigurationDoc = `# inside_out_webhook agent configuration

Adapter: inside_out_webhook

Use when:
- An external agent (Claude Code cron, custom worker, remote host) should pull work from Paperclip instead of Paperclip launching a local CLI.
- You want Paperclip to queue heartbeat work and hold runs open until the external worker checks in.

Core fields:
- pullToken (string): bearer token for POST /api/inside-out/pull
- queueTimeoutSec (number): max seconds waiting for first claim (default 86400)
- workLeaseSec (number): initial lease after claim (default 3600)
- maxLeaseSec (number): cap on extended lease (default 14400)
- heartbeatIntervalSec (number): recommended client heartbeat interval (default 300)
- onLeaseExpiry (requeue|fail): stale worker handling (default requeue)
- maxRequeueAttempts (number): requeue budget before failing (default 2)
- promptTemplate (string): system prompt shown in pull manifest
- includeInstructionsBundle (boolean): include /api/agents/:id/instructions-bundle URL
- includeMcpManifest (boolean): include MCP install hint

External worker flow:
1. POST /api/inside-out/pull (agent API key or pullToken)
2. Work using Paperclip REST/MCP with X-Paperclip-Run-Id
3. POST /api/inside-out/runs/:runId/heartbeat while working
4. POST /api/inside-out/runs/:runId/complete when done

Default system prompt template:
${DEFAULT_INSIDE_OUT_SYSTEM_PROMPT}
`;
