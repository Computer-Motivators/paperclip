---
title: Database
summary: Embedded PGlite vs local Docker vs Railway Postgres
---

Paperclip uses PostgreSQL via Drizzle ORM.

## 1. Embedded PostgreSQL (Default — local dev)

Zero config. If you don't set `DATABASE_URL`, the server starts an embedded PostgreSQL instance automatically.

```sh
pnpm dev
```

On first start, the server:

1. Creates `~/.paperclip/instances/default/db/` for storage
2. Ensures the `paperclip` database exists
3. Runs migrations automatically
4. Starts serving requests

Data persists across restarts. To reset: `rm -rf ~/.paperclip/instances/default/db`.

## 2. Local PostgreSQL (Docker)

For a full PostgreSQL server locally:

```sh
docker compose up -d
```

This starts PostgreSQL 17 on `localhost:5432`. Set the connection string:

```sh
cp .env.example .env
# DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip
```

Push the schema:

```sh
DATABASE_URL=postgres://paperclip:paperclip@localhost:5432/paperclip \
  npx drizzle-kit push
```

## 3. Railway Postgres (Production)

Production for this fork uses Railway's managed Postgres plugin.

1. Add Postgres to your Railway project.
2. On the app service, set `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
3. Set `PAPERCLIP_MIGRATION_AUTO_APPLY=true` so migrations run on deploy.

See [Railway guide](railway.md) and [RAILWAY.md](../../RAILWAY.md).

## Switching Between Modes

| `DATABASE_URL` | Mode |
|----------------|------|
| Not set | Embedded PostgreSQL (local dev) |
| `postgres://...localhost...` | Local Docker PostgreSQL |
| `${{Postgres.DATABASE_URL}}` on Railway | Production |

The Drizzle schema (`packages/db/src/schema/`) is the same regardless of mode.
