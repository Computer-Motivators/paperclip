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

## Claude and Codex adapters in Docker

The Docker image pre-installs:

- `claude` (Anthropic Claude Code CLI)
- `codex` (OpenAI Codex CLI)

Pass API keys to enable local adapter runs inside the container:

```sh
docker run --name paperclip-railway-test \
  -p 3100:3100 \
  -e HOST=0.0.0.0 \
  -e PAPERCLIP_HOME=/paperclip \
  -e OPENAI_API_KEY=sk-... \
  -e ANTHROPIC_API_KEY=sk-... \
  -v "$(pwd)/data/docker-paperclip:/paperclip" \
  paperclip-railway-test
```

Without API keys, the app runs normally — adapter environment checks will surface missing prerequisites.
