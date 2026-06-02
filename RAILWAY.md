# Railway deployment

This repository is configured for production on [Railway](https://railway.com). Local development uses `pnpm dev`; Railway runs the root `Dockerfile` with managed Postgres and a persistent volume.

## Stack

```text
GitHub (Common-Waste-Technology/paperclip) ──push──▶ Railway build
                                                          │
                                                          ├── App service (Dockerfile)
                                                          ├── Railway Postgres → DATABASE_URL
                                                          └── Volume at /paperclip
```

## First-time setup

1. Create a Railway project with **Postgres** and an **app service** linked to this repo (`master`).
2. Attach a **volume** on the app service at mount path `/paperclip`.
3. Set environment variables on the app service (see [`docker/railway.env.example`](docker/railway.env.example)).
4. Deploy and verify:

```sh
curl -fsS https://<your-domain>/api/health
# {"status":"ok"}
```

5. On a **fresh database**, bootstrap the first admin:

```sh
railway link
railway run pnpm paperclipai auth bootstrap-ceo
```

Full runbook: [`docs/deploy/railway.md`](docs/deploy/railway.md).

## Required env vars (app service)

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `BETTER_AUTH_SECRET` | Stable random secret (`openssl rand -hex 32`) |
| `PAPERCLIP_SECRETS_MASTER_KEY` | Stable random 32-byte key |
| `PAPERCLIP_PUBLIC_URL` | `https://<your-railway-or-custom-domain>` |
| `PAPERCLIP_DEPLOYMENT_MODE` | `authenticated` |
| `PAPERCLIP_DEPLOYMENT_EXPOSURE` | `public` |
| `PAPERCLIP_MIGRATION_AUTO_APPLY` | `true` |
| `SERVE_UI` | `true` |
| `HOST` | `0.0.0.0` |
| `HEARTBEAT_SCHEDULER_ENABLED` | `true` |

Do **not** set `PORT` — Railway injects it.

## Local image check before push

```sh
node ./scripts/check-docker-deps-stage.mjs
docker build -t paperclip-railway-test .
```

## Notes

- The Dockerfile omits `VOLUME` (Railway rejects it). Use a Railway volume at `/paperclip`.
- Default image env targets `authenticated` + `public` for internet-facing Railway deploys.
- Adapter CLIs run inside the container; they do not access your laptop filesystem.
