---
title: Codex OpenRouter Local
summary: Local Codex CLI adapter that always routes inference through OpenRouter
---

The `codex_openrouter_local` adapter runs OpenAI's Codex CLI locally with a Paperclip-managed `CODEX_HOME` configured for OpenRouter. Inference never uses direct OpenAI or ChatGPT subscription auth.

## Prerequisites

- Codex CLI installed (`codex` command available)
- `OPENROUTER_API_KEY` set in adapter env or server environment

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

Codex JSONL does not currently include `total_cost_usd` for OpenRouter-routed runs. After each run, the adapter estimates dollar cost from OpenRouter model pricing (`GET /api/v1/models`) using reported input, cache-read, and output tokens. If Codex begins emitting `total_cost_usd`, that value takes precedence over the estimate.

## Model Discovery

When `OPENROUTER_API_KEY` is available on the server, the board refreshes models from `GET https://openrouter.ai/api/v1/models`, preferring `openai/*` slugs and merging with the adapter fallback list.

## Environment Test

The environment test verifies:

- Codex CLI is installed
- `OPENROUTER_API_KEY` is configured
- A hello probe (`codex exec --json -`) succeeds through the OpenRouter-managed home
