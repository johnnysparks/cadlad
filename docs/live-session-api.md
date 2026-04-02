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

---

## Endpoints

### `POST /api/live/session`

Create a new session.

**Request body**

```json
{
  "source": "// .forge.js source text",
  "params": { "width": 50, "height": 20 }
}
```

**Response `201`**

```json
{
  "sessionId": "uuid",
  "writeToken": "uuid",
  "liveUrl": "https://cadlad.pages.dev?session=<id>&token=<token>",
  "session": { ...SessionState }
}
```

`liveUrl` opens the studio pre-attached. `writeToken` gates all writes — share it only with trusted collaborators/assistants.

---

### `GET /api/live/session/:id`

Full current session state.

```json
{
  "id": "uuid",
  "source": "// current source",
  "params": { "width": 50 },
  "revision": 3,
  "lastSuccessfulRevision": 2,
  "patches": [ ...Patch[] ],
  "createdAt": 1700000000000,
  "updatedAt": 1700000001000
}
```

---

### `GET /api/live/session/:id/history`

Paginated patch history.

**Query params:** `limit` (default 50, max 200), `offset` (default 0)

```json
{ "patches": [ ...Patch[] ], "total": 12, "offset": 0, "limit": 50 }
```

---

### `GET /api/live/session/:id/events`

Server-Sent Events stream. On connect: immediate `session_snapshot`. Then live events as they occur. Heartbeat every 25 s.

**Event types**

```ts
{ type: "session_snapshot", session: SessionState }
{ type: "patch_applied",    patch: Patch, session: SessionSummary }
{ type: "patch_reverted",   patch: Patch, session: SessionSummary }
{ type: "run_result_posted", result: RunResult, revision: number }
{ type: "heartbeat",        ts: number }
{ type: "error",            message: string }
```

---

### `POST /api/live/session/:id/patch`

Apply a change. **Requires write token.**

```json
{
  "type": "source_replace",
  "source": "// new source",
  "summary": "Add chamfer to top edge"
}
```

| Field | Required | Notes |
|---|---|---|
| `type` | yes | `"source_replace"` or `"param_update"` |
| `summary` | yes | Human-readable description |
| `source` | for `source_replace` | Full new source text |
| `params` | for `param_update` | Key/value pairs merged into current params |
| `runResult` | no | Attach if caller already evaluated |

**Response `201`:** `{ patch: Patch, session: SessionState }`

---

### `POST /api/live/session/:id/revert`

Revert to before a specific patch. Append-only — creates a new patch. **Requires write token.**

```json
{ "patchId": "uuid", "summary": "Undo the chamfer — broke geometry" }
```

**Response `201`:** `{ patch: Patch, session: SessionState }`

---

### `GET /api/live/session/:id/run-result`

Latest run telemetry posted by a connected studio tab.

```json
{
  "runResult": {
    "success": true,
    "errors": [],
    "warnings": [],
    "timestamp": 1700000000000,
    "stats": {
      "triangles": 12034,
      "bodies": 4,
      "boundingBox": { "min": [0,0,0], "max": [120,90,60] }
    }
  },
  "revision": 5
}
```

Returns `{ "runResult": null }` if no run has been posted yet.

---

### `POST /api/live/session/:id/run-result`

Post run telemetry from the studio after model evaluation. **Requires write token.**

```json
{
  "revision": 5,
  "result": {
    "success": true,
    "errors": [],
    "warnings": [],
    "timestamp": 1700000000000,
    "stats": { /* includes per-part + pairwise data */ },
    "screenshot": "data:image/png;base64,..."
  }
}
```

---

## Data types

```ts
interface SessionState {
  id: string;
  source: string;
  params: Record<string, number>;
  revision: number;
  lastSuccessfulRevision: number;
  patches: Patch[];
  createdAt: number;
  updatedAt: number;
}

interface Patch {
  id: string;
  revision: number;
  type: 'create' | 'source_replace' | 'param_update' | 'revert';
  summary: string;
  sourceBefore: string;
  sourceAfter: string;
  paramsBefore: Record<string, number>;
  paramsAfter: Record<string, number>;
  revertOf?: string;
  runResult?: RunResult;
  createdAt: number;
}

interface ModelStats {
  triangles: number;
  bodies: number;
  boundingBox: { min: [number, number, number]; max: [number, number, number] };
  volume?: number;
  surfaceArea?: number;
  parts?: Array<{
    index: number;
    name: string;
    triangles: number;
    boundingBox: { min: [number, number, number]; max: [number, number, number] };
    extents: { x: number; y: number; z: number };
    volume: number;
    surfaceArea: number;
  }>;
  pairwise?: Array<{
    partA: string;
    partB: string;
    intersects: boolean;
    minDistance: number;
  }>;
}

interface RunResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  timestamp: number;
  stats?: ModelStats;
  screenshot?: string;
}
```

---

## Local development

```bash
npm run worker:dev   # Worker at http://localhost:8787
npm run dev          # Studio at http://localhost:5173
```

### Quick smoke test

```bash
# Create a session
curl -s -X POST http://localhost:8787/api/live/session \
  -H 'Content-Type: application/json' \
  -d '{"source":"return box(40,40,20);","params":{}}' | jq

SESSION=<sessionId>
TOKEN=<writeToken>

# Watch events (keep running in separate terminal)
curl -N "http://localhost:8787/api/live/session/$SESSION/events"

# Apply a patch
curl -s -X POST "http://localhost:8787/api/live/session/$SESSION/patch" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"source_replace","source":"return box(60,40,20);","summary":"Widen box"}' | jq

# Revert it
curl -s -X POST "http://localhost:8787/api/live/session/$SESSION/revert" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"patchId":"<id-from-patch-response>"}' | jq
```

For deployment details, see `docs/live-session-deploy.md`.

---

## Design notes

- **One Durable Object per session.** State lives in SQLite storage on the DO. Append-only history; max 100 patches kept.
- **SSE not WebSocket.** Writes are plain POSTs; SSE is read-only streaming. WebSocket is a future option.
- **In-memory fan-out.** SSE connections live in a `Map` on the DO instance. If the DO hibernates, clients reconnect and receive a `session_snapshot`.
- **No user accounts.** Auth is write-token only. Anyone with the `liveUrl` can write. Multi-user ACL is future work.
- **CORS.** `Access-Control-Allow-Origin: *` in v1. Set `STUDIO_ORIGIN` in `worker/wrangler.toml` (or as a Cloudflare secret) to pin to a specific domain in production.
- Studio posts `run-result` payloads.
- Server stores latest render artifact with stable `artifactRef`.
- Retrieval endpoint `render/latest` returns `status`, `artifactRef`, `hasImage` and image payload when available.
- MCP `get_latest_screenshot` maps this to model-safe structured output + widget `_meta` image data.
