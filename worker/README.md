# CadLad Live-Session Worker

Cloudflare Worker + Durable Object backend for CadLad live sessions.

## Quick start

```bash
cd worker
npm install
npm run dev
```

Local API runs at `http://localhost:8787`.

## Test

```bash
cd worker
npm install
npm test
```

The suite runs integration tests against the Worker + Durable Object routes with Cloudflare's Vitest pool (session, patch/revert, SSE, run-result).

## Deploy

```bash
cd worker
npm install
npx wrangler login
npx wrangler whoami
npm run deploy
# or from repo root: npm run worker:deploy
```

GitHub Actions deployment:

- Preview branches/PRs: `.github/workflows/preview-deploy.yml` deploys `--env preview`.
- Main branch: `.github/workflows/deploy-worker.yml` deploys production worker.

For a no-publish validation build:

```bash
npm run deploy:dry
# or from repo root: npm run worker:deploy:dry
```

Set `STUDIO_ORIGIN` in Cloudflare if you want strict CORS/live URL origin pinning
(e.g. `https://cadlad.studio`). If unset, the worker reflects request `Origin`.

## Smoke test

```bash
curl -s "https://<worker-name>.<workers-subdomain>.workers.dev/health" | jq
```

Expected:

```json
{ "status": "ok", "service": "cadlad-live-sessions" }
```

For full API details and curl flows (including `/run-result` telemetry endpoints), see `../docs/live-session-api.md`.
