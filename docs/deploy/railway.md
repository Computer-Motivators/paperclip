---
title: Railway
summary: Production deployment for the Common-Waste Paperclip fork
---

Deploy this fork on [Railway](https://railway.com) using the repo Dockerfile, Railway-managed PostgreSQL, and a persistent volume for instance data.

Quick checklist: [RAILWAY.md](../../RAILWAY.md).

## Architecture

```text
GitHub (Common-Waste-Technology/paperclip) ──push──▶ Railway Dockerfile build
                                                          │
                                                          ├── Railway Postgres (DATABASE_URL)
                                                          └── Volume mounted at /paperclip
```

Railway does not run `docker-compose.yml`. Use one app service plus Railway's managed Postgres plugin.

## Prerequisites

- Railway account and project
- This repo connected to the app service (branch: `master`)
- Volume attached at `/paperclip` on the app service

## Repo configuration

| File | Purpose |
|------|---------|
| [`Dockerfile`](../../Dockerfile) | Production multi-stage build (UI + server). No `VOLUME` instruction. |
| [`railway.toml`](../../railway.toml) | Dockerfile builder, `/api/health` healthcheck, 300s timeout |
| [`docker/railway.env.example`](../../docker/railway.env.example) | Copy-paste env var template |

## Required environment variables

Set these on the **Paperclip app service** (not Postgres):

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (match your Postgres service name) |
| `BETTER_AUTH_SECRET` | Random secret (`openssl rand -hex 32`) — keep stable across deploys |
| `PAPERCLIP_PUBLIC_URL` | `https://<your-railway-or-custom-domain>` |
| `PAPERCLIP_DEPLOYMENT_MODE` | `authenticated` |
| `PAPERCLIP_DEPLOYMENT_EXPOSURE` | `public` |
| `PAPERCLIP_MIGRATION_AUTO_APPLY` | `true` |
| `PAPERCLIP_SECRETS_MASTER_KEY` | Random 32-byte key — keep stable across deploys |
| `SERVE_UI` | `true` |
| `HOST` | `0.0.0.0` |
| `HEARTBEAT_SCHEDULER_ENABLED` | `true` (recommended) |
| `NODE_OPTIONS` | `--max-old-space-size=512` (memory-first default) |
| `PAPERCLIP_MEMORY_TELEMETRY_INTERVAL_MS` | `60000` (optional memory telemetry cadence) |

Do **not** hardcode `PORT`. Railway injects it and the server reads `process.env.PORT`.

Public mode **requires** `DATABASE_URL`; embedded PostgreSQL is refused at startup. See [`deployment-modes.md`](deployment-modes.md).

## Volume

Attach a Railway volume to the app service:

- **Mount path:** `/paperclip`
- **Purpose:** uploads, secrets master key file, instance config, workspace data

The Dockerfile sets `PAPERCLIP_HOME=/paperclip` and does **not** use a Docker `VOLUME` instruction (Railway rejects `VOLUME` at build time). Without a Railway volume at `/paperclip`, this data is lost on redeploy.

## Connect GitHub and deploy

1. Push changes to `Common-Waste-Technology/paperclip` on `master`.
2. In Railway: app service → **Settings → Source** → connect this GitHub repo and branch.
3. Confirm builder: **Dockerfile** at repo root (or `RAILWAY_DOCKERFILE_PATH=Dockerfile`).
4. Add **Postgres** if not already present; wire `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
5. Attach volume at `/paperclip`.
6. Set env vars (especially `PAPERCLIP_PUBLIC_URL`).
7. Deploy.

Use `railway up` from a linked local checkout for ad-hoc deploys without pushing.

## First deploy validation

1. Watch build logs (first monorepo build may take 5–15 minutes).
2. Health check:

```sh
curl -fsS https://<your-domain>/api/health
# {"status":"ok"}
```

3. Open the UI and sign in.

## Bootstrap instance admin (fresh database only)

For `authenticated/public`, browser instance claim is disabled. On a **new** database, create the first admin invite:

```sh
railway link   # select project and Paperclip service
railway run pnpm paperclipai auth bootstrap-ceo
```

Follow the printed invite URL. Skip this if Postgres already has users from a prior deploy.

## Custom domain

1. Add the domain under the app service → Settings → Networking.
2. Update `PAPERCLIP_PUBLIC_URL` to the exact HTTPS URL users visit.
3. Redeploy if auth callbacks fail after a domain change.

## Migrating from upstream public Docker image

If you previously ran the upstream `paperclipai/paperclip` public image on Railway:

1. Repoint the app service source to this repo (dashboard Source step required).
2. Keep Postgres and the `/paperclip` volume unchanged.
3. Verify env vars match the table above.

## Optional: S3 storage

For multi-replica deployments later, configure S3-compatible storage instead of local disk. See [`storage.md`](storage.md).

## Local verification before pushing

```sh
node ./scripts/check-docker-deps-stage.mjs
docker build -t paperclip-railway-test .
```

## Limitations

- Local CLI adapters (Claude, Codex, etc.) run **inside** the container. They do not access your laptop filesystem.
- Fork-only adapters (e.g. `codex-openrouter-local`) require building from this repo.
- Long Docker builds may need adequate Railway plan memory.

## Related docs

- [Deployment modes](deployment-modes.md)
- [Environment variables](environment-variables.md)
- [Database](database.md)
- [RAILWAY.md](../../RAILWAY.md)
