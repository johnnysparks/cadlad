# CadLad Live-Session Worker

Cloudflare Worker + Durable Object backend for CadLad live sessions.

## Quick start

```bash
cd worker
npm install
npm run dev
```

Local API runs at `http://localhost:8787`.

## Deploy

```bash
cd worker
npm install
npx wrangler login
npx wrangler whoami
npm run deploy
# or from repo root: npm run worker:deploy
```

For a no-publish validation build:

```bash
npm run deploy:dry
# or from repo root: npm run worker:deploy:dry
```

After deploy, set `STUDIO_ORIGIN` in Cloudflare to your production Studio origin
(e.g. `https://cadlad.studio`).

## Smoke test

```bash
curl -s "https://<worker-name>.<workers-subdomain>.workers.dev/health" | jq
```

Expected:

```json
{ "status": "ok", "service": "cadlad-live-sessions" }
```

For full API details and curl flows, see `../docs/live-session-api.md`.
