# Live-Session Deployment (Pages + Worker)

## What was broken

Before this wiring, CI only deployed static frontend assets to Cloudflare Pages previews. The live-session backend (`worker/`) was not deployed from GitHub Actions, so preview studio builds had no guaranteed reachable Worker + Durable Object API.

## Current deployment model

CadLad now deploys two independent artifacts in preview CI:

1. **Cloudflare Worker (with Durable Objects)** from `worker/wrangler.toml`.
2. **Cloudflare Pages preview** from `dist/`.

Workflow: `.github/workflows/preview-deploy.yml`

### Why this shape

- It preserves the existing Pages preview flow.
- It keeps live sessions on standalone Workers + Durable Objects (not Pages Functions).
- It uses a pragmatic **shared preview Worker environment** (`env.preview`) instead of per-branch Workers.

## Shared preview Worker vs per-branch Worker

This repo uses a **shared preview Worker** (`cadlad-live-sessions-preview`) for all preview branches.

### Tradeoff

- ✅ Simple and robust: one Worker URL to wire into frontend previews.
- ✅ Durable Object migrations remain straightforward (`wrangler deploy` handles them).
- ⚠️ Preview branches share one backend service namespace. Sessions are still isolated by random session IDs + tokens, but all previews hit the same Worker deployment target.

Per-branch Workers are possible, but they add naming, cleanup, and migration/version management complexity. For now, shared preview is the smallest safe setup.

## Required GitHub secrets

Set these repository secrets:

- `CLOUDFLARE_API_TOKEN` — token with permissions to deploy Pages and Workers.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.
- `CLOUDFLARE_WORKER_PREVIEW_URL` — full preview Worker base URL, e.g. `https://cadlad-live-sessions-preview.<subdomain>.workers.dev`.
- `CLOUDFLARE_WORKER_PRODUCTION_URL` *(optional fallback)* — production Worker URL used only if preview URL secret is absent.

## Required Cloudflare setup

1. Ensure Workers + Durable Objects are enabled on the account.
2. Ensure `worker/wrangler.toml` script names are available:
   - production: `cadlad-live-sessions`
   - preview: `cadlad-live-sessions-preview`
3. Deploy once manually if needed to bootstrap the script.
4. (Optional) In production, set `STUDIO_ORIGIN` to your canonical studio origin (for strict CORS and live URL generation).

### Durable Object migrations

Durable Object class/migrations are declared in `worker/wrangler.toml`.

`wrangler deploy` in CI applies migrations automatically according to migration tags.


## Environment matrix

| Surface | Local | Preview | Production |
|---|---|---|---|
| Studio page | `http://localhost:5173` | `https://<branch>.cadlad.pages.dev` | your Pages production domain |
| Live-session API | `http://localhost:8787` | `https://cadlad-live-sessions-preview.<subdomain>.workers.dev` | `https://cadlad-live-sessions.<subdomain>.workers.dev` |
| Durable Objects namespace | local dev storage | shared `env.preview` namespace | production namespace |

Because preview uses a shared Worker, prefer short-lived sessions in PR reviews and avoid storing sensitive prompts/source.

## Frontend worker base URL discovery

Studio resolves live-session API base in this order:

1. `VITE_LIVE_SESSION_API_BASE` (set in preview CI from worker URL secret),
2. local fallback `http://localhost:8787` when running on localhost,
3. otherwise same-origin fallback (non-local safety default).

This removes the previous hard dependency on `:8787` for non-local deployments.

## Local dev vs deployed preview

### Local dev

- Run studio: `npm run dev` (localhost:5173)
- Run worker: `npm run worker:dev` (localhost:8787)
- No special env needed; studio falls back to `localhost:8787`.

### Deployed preview

- GitHub Actions deploys preview Worker first.
- Preview frontend build injects `VITE_LIVE_SESSION_API_BASE` from `CLOUDFLARE_WORKER_PREVIEW_URL`.
- Pages deploy publishes static preview that can reach the Worker API.

## Smoke test checklist (preview)

1. Open the PR preview site URL.
2. Click 🤖☁️ to create a live session.
3. Confirm API create-session works:
   - UI shows `Live: connected`, and capability link is copied.
4. Confirm session/event endpoints are live:
   - Studio receives snapshot/patch events (`/api/live/session/:id/events`) without connection errors.

Optional terminal checks (replace `<worker-url>`):

```bash
curl -s "<worker-url>/health"
curl -s -X POST "<worker-url>/api/live/session" \
  -H 'Content-Type: application/json' \
  -d '{"source":"return box(10,10,10)","params":{}}'
```

## Production note

This change wires preview deployment end-to-end. For production rollout, mirror the same pattern with a main-branch Worker deploy workflow and set a production frontend env (`VITE_LIVE_SESSION_API_BASE`) in Pages project settings.


## Integration tests

Run both the frontend and Worker suites before shipping deployment changes:

```bash
npm test
npm --prefix worker test
```

The Worker tests exercise session creation, patch/revert flows, SSE, and run-result telemetry using the Cloudflare Vitest pool.
