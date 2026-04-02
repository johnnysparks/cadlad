# Live-Session Deployment (Pages + Worker)

## Architecture overview

CadLad deploys two independent artifacts:

1. **Cloudflare Worker** (Durable Objects backend) — `worker/wrangler.toml`
2. **Cloudflare Pages** (static frontend + Functions proxy) — `wrangler.toml`

Everything runs on Cloudflare. GitHub Pages is not used.

## How requests flow

```
Browser → Cloudflare Pages (static HTML/JS)
              ↓ /api/live/* and /health requests
         Pages Functions (functions/)
              ↓ HTTP proxy via LIVE_SESSION_WORKER_URL
         Cloudflare Worker (Durable Objects)
```

The Worker URLs are hardcoded in `wrangler.toml`:

| Environment | Worker URL |
|---|---|
| Preview (non-main branches) | `https://cadlad-live-sessions-preview.johnnymsparks.workers.dev` |
| Production (main) | `https://cadlad-live-sessions.johnnymsparks.workers.dev` |

No secrets needed for Worker URL wiring — it's all in code.

## Required GitHub secrets

Only two secrets are needed:

- `CLOUDFLARE_API_TOKEN` — token with Workers and Pages deploy permissions
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID

That's it. No `CLOUDFLARE_WORKER_PREVIEW_URL` or `CLOUDFLARE_WORKER_PRODUCTION_URL`.

## CI workflows

| Workflow | Trigger | What it deploys |
|---|---|---|
| `deploy-pages.yml` | Push to `main` | Frontend → Cloudflare Pages (production) |
| `deploy-worker.yml` | Push to `main` with `worker/**` changes | Worker → production |
| `preview-deploy.yml` | Push to any non-main branch / PR | Worker (preview env) + Pages (preview branch) |

### Production deploy (main branch)

1. `deploy-worker.yml` fires if `worker/` changed → deploys `cadlad-live-sessions`
2. `deploy-pages.yml` fires always → builds frontend, deploys to Cloudflare Pages `main` branch

### Preview deploy (feature branches / PRs)

1. `preview-deploy.yml` runs two sequential jobs:
   - **deploy-worker-preview**: deploys `cadlad-live-sessions-preview` (shared across all preview branches)
   - **deploy-pages-preview**: builds frontend, deploys to Cloudflare Pages with branch name
2. PR gets a comment with the preview URL

## Required Cloudflare setup

1. Workers + Durable Objects enabled on the account
2. Two Workers exist (created on first deploy):
   - `cadlad-live-sessions` (production)
   - `cadlad-live-sessions-preview` (shared preview)
3. One Cloudflare Pages project: `cadlad`
4. Pages project has the `functions/` directory wired in (auto-detected from repo)

### Bootstrap (first time only)

If Workers don't exist yet, deploy them manually once:

```bash
npm run worker:deploy          # production Worker
cd worker && npx wrangler deploy --env preview  # preview Worker
```

## Environment matrix

| Surface | Local | Preview | Production |
|---|---|---|---|
| Studio URL | `http://localhost:5173` | `https://<branch>.cadlad.pages.dev` | `https://cadlad.pages.dev` |
| Live-session API | `http://localhost:8787` | `https://cadlad-live-sessions-preview.johnnymsparks.workers.dev` | `https://cadlad-live-sessions.johnnymsparks.workers.dev` |
| DO namespace | local dev storage | shared `env.preview` | production |

## Local dev

```bash
npm run dev          # Studio at localhost:5173
npm run worker:dev   # Worker at localhost:8787
```

No env vars needed — studio auto-detects `localhost:8787` when running on localhost.

## Frontend API base resolution

The live-session client (`src/studio/live-session-client.ts`) resolves the Worker URL in order:

1. `VITE_LIVE_SESSION_API_BASE` env var (not set in CI — we rely on the proxy instead)
2. `http://localhost:8787` when running on localhost
3. `location.origin` otherwise → same-origin → Pages Functions proxy → Worker

## Smoke tests

```bash
# Production Worker
curl -s "https://cadlad-live-sessions.johnnymsparks.workers.dev/health"
curl -s -X POST "https://cadlad-live-sessions.johnnymsparks.workers.dev/api/live/session" \
  -H 'Content-Type: application/json' \
  -d '{"source":"return box(10,10,10)","params":{}}'

# Via Pages proxy (production)
curl -s "https://cadlad.pages.dev/health"
curl -s -X POST "https://cadlad.pages.dev/api/live/session" \
  -H 'Content-Type: application/json' \
  -d '{"source":"return box(10,10,10)","params":{}}'
```

## Integration tests

```bash
npm test                    # frontend suite
npm --prefix worker test    # Worker suite
```
