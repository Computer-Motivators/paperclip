---
title: Codex OpenRouter Local
summary: Local Codex CLI adapter that always routes inference through OpenRouter
---

The `codex_openrouter_local` adapter runs OpenAI's Codex CLI locally with a Paperclip-managed `CODEX_HOME` configured for OpenRouter. Inference never uses direct OpenAI or ChatGPT subscription auth.

## Prerequisites

- Codex CLI installed (`codex` command available)
- `OPENROUTER_API_KEY` set in adapter env or server environment
- A working shell runtime for Codex command execution (`zsh` in the image and/or Codex's bundled `codex-resources/zsh/bin/zsh`)

## Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | string | Yes | Working directory for the agent process |
| `model` | string | No | OpenRouter model slug (e.g. `openai/gpt-5.3-codex`) |
| `modelReasoningEffort` | string | No | Reasoning effort (`minimal` through `xhigh`) |
| `instructionsFilePath` | string | No | Markdown instructions prepended on fresh sessions |
| `env.OPENROUTER_API_KEY` | string | Yes | OpenRouter API key (or set on server) |
| `fastMode` | boolean | No | Codex fast tier when supported by the model |
| `dangerouslyBypassApprovalsAndSandbox` | boolean | No | Skip sandbox (default true) |

## Shell execution in containers

Recent Codex builds route `command_execution` through a bundled zsh exec bridge (`features.shell_zsh_fork`). When that bundled zsh is missing or unusable, Paperclip automatically writes `features.shell_zsh_fork = false` into the managed `$CODEX_HOME/config.toml` and passes the same override on `codex exec`. This restores legacy shell execution using `bash`/`sh` already present in the runtime image.

The adapter environment test reports `codex_shell_zsh` and runs a minimal `codex_shell_spawn` probe (`echo paperclip-shell-ok`) when authentication is available.

## OpenRouter Routing

Paperclip writes `config.toml` into the managed home:

```toml
model_provider = "openrouter"

[model_providers.openrouter]
name = "openrouter"
base_url = "https://openrouter.ai/api/v1"
env_key = "OPENROUTER_API_KEY"
```

Auth is stored in `$CODEX_HOME/auth.json` as `{ "OPENROUTER_API_KEY": "..." }`.

Managed home path: `~/.paperclip/instances/<id>/companies/<companyId>/codex-openrouter-home/`

This is isolated from the regular `codex_local` managed home and from `~/.codex`.

## Prompt Caching

Paperclip optimizes token use in three layers:

1. **Session resume** — Codex `resume <sessionId>` with wake deltas only on resumed runs.
2. **Stable prompt bundles** — Instructions and skills are hashed into a content-addressed bundle; sessions are not resumed if the bundle changes.
3. **OpenRouter provider caching** — OpenRouter applies automatic prompt caching for supported models and sticky routing when caching is active.

Run usage reports `cachedInputTokens` when the provider returns cache read metrics.

## Cost Reporting

Codex JSONL does not currently include `total_cost_usd` for OpenRouter-routed runs. After each run, the adapter estimates dollar cost from OpenRouter model pricing (`GET /api/v1/models`) using:

- uncached prompt tokens
- cached prompt-read tokens (`input_cache_read`)
- output tokens
- reasoning tokens (`internal_reasoning`, when priced)
- per-request pricing (`request`, when priced)

If Codex begins emitting `total_cost_usd`, that value takes precedence over the estimate.

Provider attribution in Paperclip is derived from the configured model slug (`openai/*`, `anthropic/*`, etc.), while biller remains `openrouter`.

## Session Tracking (OpenRouter Broadcast)

The adapter configures OpenRouter headers through Codex provider settings (`env_http_headers`):

- `X-Session-Id` from `OPENROUTER_SESSION_ID`
- `HTTP-Referer` from `OPENROUTER_HTTP_REFERER`
- `X-OpenRouter-Title` from `OPENROUTER_TITLE`

Paperclip sets these env vars per run so OpenRouter Broadcast can group related requests by session and attribute traffic to the Paperclip app.

Current limitation: Codex provider config does not expose arbitrary request-body passthrough for OpenRouter `trace` / `session_id` JSON fields, so rich `trace` metadata injection is not currently wired through this adapter.

## Model Discovery

When `OPENROUTER_API_KEY` is available on the server, the board refreshes models from `GET https://openrouter.ai/api/v1/models`, preferring `openai/*` slugs and merging with the adapter fallback list.

## Environment Test

The environment test verifies:

- Codex CLI is installed
- `OPENROUTER_API_KEY` is configured
- A hello probe (`codex exec --json -`) succeeds through the OpenRouter-managed home
