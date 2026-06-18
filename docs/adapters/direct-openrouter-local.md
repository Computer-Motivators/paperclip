---
title: Direct OpenRouter
summary: Minimal Python-backed local adapter that calls OpenRouter directly with tool support
---

The `direct_openrouter_local` adapter runs a lightweight Python agent loop that calls OpenRouter's Chat Completions API directly.

## Highlights

- OpenRouter-native request body with `session_id` and `trace` metadata on every turn.
- Prompt caching is always enabled where supported by the chosen model.
- Tool-calling mode toggle:
  - `native`: OpenRouter/OpenAI-style `tools`.
  - `text`: fenced JSON fallback for models with weak/no native tool support.
- Harness-style shell sandbox (`shellPolicy` preset + UI toggles):
  - **dev** (default): allowlist for git, pnpm, npm, node, rg, find, etc.
  - **ci**: narrower allowlist
  - **custom**: operator-defined command names + optional network toggle
  - **disabled**: file tools only (`read_file`, `write_file`, `apply_patch`)
  - Board UI toggles (when shell is enabled):
    - **Allow network tools** — curl, wget, ssh, scp, rsync, …
    - **Allow git / package managers / Python / write commands** — trim dev/ci allowlists
    - **Block git push**, **block package publish**, **block destructive rm**, **block inline code execution**
    - **Allow shell chaining** and **allow absolute paths** (off by default)
    - **Extra blocked patterns** — freeform substring deny list
  - Commands run via `execve` argv (no `bash -lc`) with a minimal env (no host secrets)
- File tools enforce workspace-root path resolution (symlink-safe)

## Required configuration

- `env.OPENROUTER_API_KEY` (or server `OPENROUTER_API_KEY`)

## Core fields

- `cwd`: optional fallback execution directory
- `instructionsFilePath`: optional markdown instructions file
- `model`: OpenRouter model slug
- `toolCallingMode`: `native` or `text`
- `maxTurns`: turn budget for the agent loop
- `shellTimeoutSec`: shell tool timeout
- `timeoutSec` / `graceSec`: adapter process timeout controls
- `httpReferer` / `openRouterTitle`: OpenRouter attribution headers
- `traceName` / `traceEnvironment`: trace metadata overrides
- `visionMode`: `auto` (default) or `off`
- `visionAttachOnResume`: attach vision images on resumed session wake deltas (default `true`)
- `maxVisionImages` / `maxVisionImageBytes`: caps for run-start vision staging

## Vision input

When `visionMode` is `auto` and the selected OpenRouter model supports image input, Paperclip attaches discovered issue images as multimodal `image_url` parts on the initial user message. During the run, the `read_image` tool loads workspace files or Paperclip attachment IDs as vision tokens (not UTF-8 text). Use `list_workspace_images` to discover downloaded images. Session persistence omits inline base64 blobs from stored messages. See `skills/paperclip/references/vision.md`.

## OpenRouter Broadcast protocol

Each model request includes:

- body `session_id`
- header `X-Session-Id`
- body `trace` object (run + issue + agent metadata)
- optional body `user`

This enables grouping and observability in OpenRouter Broadcast destinations.
