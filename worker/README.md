# CadLad Live-Session Worker

Cloudflare Worker + Durable Object backend for CadLad live sessions.

## Quick start

```bash
cd worker
npm install
npm run dev
```

Local API at `http://localhost:8787`. Run the studio separately (`npm run dev` from the root) — it auto-connects to `localhost:8787`.

## Test

```bash
npm --prefix worker test
```

Integration tests cover session creation, patch/revert, SSE, and run-result telemetry using the Cloudflare Vitest pool.

## Deploy

CI handles production and preview deploys automatically (see `.github/workflows/`). To deploy manually:

```bash
npm run worker:deploy          # production
cd worker && npx wrangler deploy --env preview  # preview
npm run worker:deploy:dry      # dry run (typecheck + bundle, no publish)
```

## Smoke test

```bash
curl -s https://cadlad-live-sessions.johnnymsparks.workers.dev/health | jq
# → { "status": "ok", "service": "cadlad-live-sessions" }
```

For the full API reference, see `docs/live-session-api.md`.
