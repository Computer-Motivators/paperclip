---
title: Deployment Overview
summary: Local dev vs Railway production
---

This fork supports local development and **Railway** as the production deployment target.

## Deployment Modes

| Mode | Auth | Best For |
|------|------|----------|
| `local_trusted` | No login required | Single-operator local machine |
| `authenticated` + `private` | Login required | Private network (Tailscale, VPN, LAN) |
| `authenticated` + `public` | Login required | **Railway production** (internet-facing) |

## Quick Comparison

### Local Trusted (Default)

- Loopback-only host binding (localhost)
- No human login flow
- Fastest local startup
- Best for: solo development and experimentation (`pnpm dev`)

### Authenticated + Private

- Login required via Better Auth
- Binds to all interfaces for network access
- Auto base URL mode (lower friction)
- Best for: team access over Tailscale or local network

### Authenticated + Public (Railway)

- Login required
- Explicit public URL required (`PAPERCLIP_PUBLIC_URL`)
- Stricter security checks
- Best for: this fork's Railway production stack

## Choosing a Mode

- **Working on the codebase?** Use `local_trusted` with `pnpm dev` (the default)
- **Sharing with a team on private network?** Use `authenticated` + `private`
- **Production deploy?** Use Railway with `authenticated` + `public` — see [Railway guide](railway.md)

Set the mode during onboarding:

```sh
pnpm paperclipai onboard
```

Or update it later:

```sh
pnpm paperclipai configure --section server
```

For Railway, set mode and exposure via dashboard env vars instead of onboard — see [RAILWAY.md](../../RAILWAY.md).
