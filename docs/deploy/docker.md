---
title: Docker
summary: Local Docker testing for Railway image parity
---

Test the same Dockerfile Railway builds before you push. This is **not** the production deploy path — use [Railway](railway.md) for that.

## Build the Railway image locally

```sh
node ./scripts/check-docker-deps-stage.mjs
docker build -t paperclip-railway-test .
```

## Run locally (Postgres required for public mode)

The production image defaults to `authenticated` + `public`, which requires `DATABASE_URL`. For a quick local smoke test with embedded Postgres, override mode:

```sh
docker run --name paperclip-railway-test \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e PAPERCLIP_HOME=/paperclip \
  -e PAPERCLIP_DEPLOYMENT_MODE=local_trusted \
  -e BETTER_AUTH_SECRET=$(openssl rand -hex 32) \
  -v "$(pwd)/data/docker-paperclip:/paperclip" \
  paperclip-railway-test
```

Open [http://localhost:3100](http://localhost:3100).

## Compose quickstart (local dev only)

For local experimentation without matching Railway env exactly:

```sh
docker compose -f docker/docker-compose.quickstart.yml up --build
```

Defaults:

- Host port: `3100`
- Data directory: `./data/docker-paperclip`

Override with environment variables:

```sh
PAPERCLIP_PORT=3200 PAPERCLIP_DATA_DIR=../data/pc \
  docker compose -f docker/docker-compose.quickstart.yml up --build
```

**Note:** `PAPERCLIP_DATA_DIR` is resolved relative to the compose file (`docker/`), so `../data/pc` maps to `data/pc` in the project root.

## Data persistence

On Railway, attach a volume at `/paperclip`. Locally, bind-mount the same path:

- Uploaded assets
- Local secrets key
- Instance config
- Agent workspace data

## Local Adapter CLIs in Docker

The Docker image pre-installs these agent CLIs so their `*_local` adapters can run inside the container:

- `claude` (Anthropic Claude Code CLI) — `claude_local`
- `codex` (OpenAI Codex CLI) — `codex_local`
- `opencode` (OpenCode multi-provider CLI) — `opencode_local`
- `gemini` (Google Gemini CLI) — `gemini_local` (experimental)

Pass API keys to enable local adapter runs inside the container:

```sh
docker run --name paperclip-railway-test \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e PAPERCLIP_HOME=/paperclip \
  -e OPENAI_API_KEY=sk-... \
  -e ANTHROPIC_API_KEY=sk-... \
  -e GEMINI_API_KEY=... \
  -v "$(pwd)/data/docker-paperclip:/paperclip" \
  paperclip-railway-test
```

Each adapter reads its provider's standard credentials — for example `ANTHROPIC_API_KEY` (Claude), `OPENAI_API_KEY` (Codex), and `GEMINI_API_KEY` or `GOOGLE_API_KEY` (Gemini). OpenCode is multi-provider and uses whichever provider key you supply.

> **Gemini key restrictions:** Google requires Gemini API keys to be *restricted* to the Gemini API (scoped in the Google Cloud console); unrestricted keys are blocked and `gemini_local` runs will fail with an auth error. Create a restricted key, or authenticate with `gemini auth login` (OAuth) and persist `~/.gemini` via the data volume so the credential survives container restarts.

The image sets `GEMINI_SANDBOX=false` so the Gemini CLI does not try to launch its own (Docker-in-Docker) sandbox inside the container. The `gemini_local` adapter already passes `--sandbox=none` per run, so this env var only matters if you invoke `gemini` manually inside the container; override it if you have nested-container support and want CLI-level sandboxing.

Without API keys, the app runs normally — adapter environment checks will surface missing prerequisites.
