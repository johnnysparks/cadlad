# CadLad Live-Session API (OAuth refactor)

## Auth

All session and MCP routes are OAuth-protected.

Discovery endpoints:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-authorization-server`

OAuth endpoints:

- `GET /oauth/authorize` (authorization code + PKCE S256)
- `POST /oauth/token`
- `POST /oauth/register`

Use `Authorization: Bearer <access_token>` for API calls. For browser SSE, `?access_token=` is also accepted.

## Session endpoints

- `POST /api/live/session`
- `GET /api/live/session/:id`
- `GET /api/live/session/:id/history`
- `GET /api/live/session/:id/events`
- `POST /api/live/session/:id/patch`
- `POST /api/live/session/:id/revert`
- `POST /api/live/session/:id/run-result`
- `GET /api/live/session/:id/run-result`
- `GET /api/live/session/:id/render/latest`
- `POST /api/live/session/:id/render/refresh`

## Screenshot pipeline

- Studio posts `run-result` payloads.
- Server stores latest render artifact with stable `artifactRef`.
- Retrieval endpoint `render/latest` returns `status`, `artifactRef`, `hasImage` and image payload when available.
- MCP `get_latest_screenshot` maps this to model-safe structured output + widget `_meta` image data.
