---
title: Railway
summary: Deploy this Paperclip fork on Railway with GitHub auto-build
---

Deploy Paperclip on [Railway](https://railway.com) using the repo Dockerfile, Railway-managed PostgreSQL, and a persistent volume for instance data.

This guide covers switching from the public upstream Docker image to auto-building this fork from GitHub, while keeping Postgres, volume data, and your public domain.

## Architecture

```text
GitHub (fork) ──push──▶ Railway Dockerfile build ──▶ Paperclip service
                                                          │
                                                          ├── Railway Postgres (DATABASE_URL)
                                                          └── Volume mounted at /paperclip
```

Railway does not run `docker-compose.yml` directly. Use one app service plus Railway's managed Postgres plugin.

## Prerequisites

- Railway account with a project (existing Paperclip stack is fine)
- This fork pushed to GitHub and connected to Railway
- Public deployment uses `authenticated` + `public` mode with login required

## Repo configuration

The repo includes:

- [`Dockerfile`](../../Dockerfile) — production multi-stage build (UI + server)
- [`railway.toml`](../../railway.toml) — Dockerfile builder, `/api/health` healthcheck, 300s timeout

## Required environment variables

Set these on the **Paperclip app service** (not Postgres):

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (use your Postgres service name) |
| `BETTER_AUTH_SECRET` | Random secret (`openssl rand -hex 32`) — keep stable across deploys |
| `PAPERCLIP_PUBLIC_URL` | `https://<your-railway-or-custom-domain>` |
| `PAPERCLIP_DEPLOYMENT_MODE` | `authenticated` |
| `PAPERCLIP_DEPLOYMENT_EXPOSURE` | `public` |
| `PAPERCLIP_MIGRATION_AUTO_APPLY` | `true` |
| `PAPERCLIP_SECRETS_MASTER_KEY` | Random 32-byte key — keep stable across deploys |
| `SERVE_UI` | `true` |
| `HOST` | `0.0.0.0` |
| `HEARTBEAT_SCHEDULER_ENABLED` | `true` (recommended) |

Do **not** hardcode `PORT`. Railway injects it and the server reads `process.env.PORT`.

See [`docker/railway.env.example`](../../docker/railway.env.example) for a copy-paste template.

Public mode **requires** `DATABASE_URL`; embedded PostgreSQL is refused at startup. See [`deployment-modes.md`](deployment-modes.md).

## Volume

Attach a Railway volume to the app service:

- **Mount path:** `/paperclip`
- **Purpose:** uploads, secrets master key file, instance config, workspace data

The Dockerfile sets `PAPERCLIP_HOME=/paperclip`. Without a volume, this data is lost on redeploy.

## Switch from public Docker image to GitHub build

1. **Prepare the fork** — push Dockerfile fix, updated lockfile, and `railway.toml` to the deploy branch (`Common-Waste-Technology/paperclip`, branch `master`).
2. **Repoint the app service** — Settings → Source → connect this GitHub repo and branch.
3. **Confirm build settings** — builder: Dockerfile at repo root (or `RAILWAY_DOCKERFILE_PATH=Dockerfile`).
4. **Remove** the old public Docker image source.
5. **Keep Postgres** — ensure `DATABASE_URL=${{Postgres.DATABASE_URL}}` still references your Postgres service.
6. **Keep the volume** — mount path `/paperclip` unchanged so existing data persists.
7. **Verify env vars** — especially `PAPERCLIP_PUBLIC_URL=[domain_here]` (or your custom domain).

The Railway CLI **cannot** switch an existing service from image to GitHub repo; the dashboard Source step is required for auto-build on push. Use `railway up` for immediate deploys from a local checkout.

### Rollback

If the fork build fails, revert the service source to the public Docker image in Railway settings. Postgres and volume are independent of build source.

## First deploy validation

1. Watch build logs (first monorepo build may take 5–15 minutes).
2. Health check:

```sh
curl -fsS https://<your-domain>/api/health
# {"status":"ok"}
```

3. Open the UI and sign in with your existing account (if migrating an existing stack).

## Bootstrap instance admin (fresh database only)

For `authenticated/public`, browser instance claim is disabled. On a **new** database, create the first admin invite:

```sh
railway link   # select project and Paperclip service
railway run pnpm paperclipai auth bootstrap-ceo
```

Follow the printed invite URL. Skip this if you are migrating an existing Railway stack with users already in Postgres.

## Custom domain

1. Add the domain under the app service → Settings → Networking.
2. Update `PAPERCLIP_PUBLIC_URL` to the exact HTTPS URL users visit.
3. Redeploy if auth callbacks fail after a domain change.

## Optional: S3 storage

For multi-replica deployments later, configure S3-compatible storage instead of local disk. See [`storage.md`](storage.md).

## Local verification before pushing

```sh
node ./scripts/check-docker-deps-stage.mjs
docker build -t paperclip-fork-test .
```

## Limitations

- Local CLI adapters (Claude, Codex, etc.) run **inside** the container. They do not access your laptop filesystem.
- Fork-only adapters (e.g. `codex-openrouter-local`) require building from this repo — they are not in the upstream public image.
- Long Docker builds may need adequate Railway plan memory.

## Related docs

- [Deployment modes](deployment-modes.md)
- [Environment variables](environment-variables.md)
- [Database](database.md)
- [AWS ECS Fargate](aws-ecs.md) — alternative cloud reference
- [`doc/DOCKER.md`](../../doc/DOCKER.md) — Docker quickstart and auth URL behavior
