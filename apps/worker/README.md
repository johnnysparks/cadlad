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
npm --prefix worker test           # smoke test (CI-safe)
npm --prefix worker run test:full # full MCP Phase 1.1 suite (excludes legacy OAuth/session tests)
npm --prefix worker run test:oauth # legacy OAuth/session coverage (currently failing)
```

Integration tests use the Cloudflare Vitest pool. The OAuth/session suite is kept as a separate command while MCP Phase 1.1 work is in progress.

## Deploy

CI handles production deploys automatically (see `.github/workflows/`). To deploy manually:

```bash
npm run worker:deploy          # production
npm run worker:deploy:dry      # dry run (typecheck + bundle, no publish)
```

## Smoke test

```bash
curl -s https://cadlad-live-sessions.johnnymsparks.workers.dev/health | jq
# → { "status": "ok", "service": "cadlad-live-sessions" }
```

For the full API reference, see `docs/live-session-api.md`.

---

## MCP / OAuth Architecture

The worker is both the **MCP Resource Server** (`/mcp`) and the **OAuth 2.1 Authorization Server** (`/oauth/*`). No external identity provider is needed.

### How ChatGPT links to your session

1. Open the CadLad studio and create a live session (🤖☁️ Live session).
2. Click **⬡ ChatGPT** to generate a 10-minute link code (e.g. `a1b2c3d4`).
3. Add `https://<worker-url>/mcp` as an MCP server in ChatGPT (one-time setup).
4. ChatGPT discovers `/.well-known/oauth-protected-resource`, finds the authorization server, registers as a client, and redirects you to `/oauth/authorize`.
5. Enter your link code in the consent form. ChatGPT receives an access token.
6. All subsequent MCP tool calls use `Authorization: Bearer <token>` — no session ID or write token ever appears in tool arguments.

### Key endpoints

| Path | Purpose |
|------|---------|
| `GET /.well-known/oauth-protected-resource` | RFC 8707 — tells clients which AS to use |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 — AS endpoint discovery |
| `POST /oauth/register` | Dynamic client registration (RFC 7591) |
| `GET /oauth/authorize` | Consent form — user enters link code |
| `POST /oauth/token` | PKCE auth-code → access token exchange |
| `POST /mcp` | MCP Streamable HTTP (2025-03-26), Bearer auth required for tools/call |
| `POST /api/live/session/:id/link` | Generate a link code (studio → server, requires write token) |

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STUDIO_ORIGIN` | No | CORS origin for studio (defaults to request Origin) |
| `KV` | **Yes** | KV namespace binding for OAuth state and screenshot persistence |

### KV namespace setup

```bash
cd worker
# Create production namespace
npx wrangler kv:namespace create "KV"
# Update wrangler.toml with the returned IDs
```

### Local dev

```bash
cd worker
npm run dev
# In another terminal, from repo root:
npm run dev
```

Wrangler creates a local KV store automatically when you run `wrangler dev` — no real IDs needed for local development.

### Screenshot pipeline

When the studio renders a model, it POSTs the screenshot to `/api/live/session/:id/run-result`. The worker:
1. Stores the screenshot in the Durable Object's in-memory `lastRunResult` (fast path).
2. Also persists it to KV (`screenshot:<sessionId>`, 7-day TTL) so it survives DO eviction.

`get_latest_screenshot` checks DO memory first, then falls back to KV — ensuring the latest render is always retrievable even after a cold start.

### Claude Desktop / Claude Code (stdio MCP)

For local use with Claude Desktop or Claude Code, the stdio MCP server (`mcp/`) still uses `CADLAD_SESSION_URL` with embedded credentials. This is acceptable for local-only use where the session URL is never shared externally. Use the **🤖 Claude** button in the studio to copy the session prompt for stdio-based MCP clients.
