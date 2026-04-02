# CadLad Live-Session Worker

Cloudflare Worker + Durable Object backend for CadLad live sessions with OAuth-protected MCP access.

## Quick start

```bash
cd worker
npm install
npm run dev
```

Local API at `http://localhost:8787`.

## OAuth + MCP endpoints

- Protected resource metadata: `/.well-known/oauth-protected-resource`
- Authorization server metadata: `/.well-known/oauth-authorization-server`
- OAuth endpoints:
  - `GET /oauth/authorize`
  - `POST /oauth/token`
  - `POST /oauth/register`
- MCP endpoint: `POST /mcp` (requires bearer access token)

## Environment

- `STUDIO_ORIGIN`
- `OAUTH_SIGNING_SECRET`
- `DEFAULT_USER_SUB`

## Test

```bash
npm --prefix worker test
```

## Deploy

```bash
npm run worker:deploy
```
