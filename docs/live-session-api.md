# CadLad Live-Session API

The live-session backend is a **Cloudflare Worker + Durable Object** service that turns a
single-file CadLad model into a shared, writable session with real-time patch streaming.

One Durable Object instance per session keeps state (source text, params, patch log) and
fans out Server-Sent Events to connected browsers.

---

## Base URL

| Environment | URL |
|---|---|
| Local dev (`wrangler dev`) | `http://localhost:8787` |
| Preview Worker (`--env preview`) | `https://cadlad-live-sessions-preview.<workers-subdomain>.workers.dev` |
| Production Worker | `https://cadlad-live-sessions.<workers-subdomain>.workers.dev` |
| Pages frontend preview | `https://<hash-or-branch>.cadlad.pages.dev` |

> Pages previews should call the Worker URL via `VITE_LIVE_SESSION_API_BASE`; they are separate deployments.

---

## Authentication

All **write** endpoints (`POST /patch`, `POST /revert`, `POST /run-result`) require the session's write token.
Pass it in either:

- `Authorization: Bearer <writeToken>` header, or
- `?token=<writeToken>` query param

**Read** endpoints (`GET /session`, `GET /history`, `GET /events`, `GET /run-result`) are public in v1.

---

## Endpoints

### `POST /api/live/session`

Create a new live session from the current editor source and params.

**Request body**

```json
{
  "source": "// .forge.js source text",
  "params": { "width": 50, "height": 20 }
}
```

`params` is optional (defaults to `{}`).

**Response `201`**

```json
{
  "sessionId": "uuid",
  "writeToken": "uuid",
  "liveUrl": "http://localhost:5173?session=<id>&token=<token>",
  "session": { ...SessionState }
}
```

- `liveUrl` — paste into an assistant or share; opens the studio pre-attached.
- `writeToken` — keep this secret if you want to restrict writes.

---

### `GET /api/live/session/:id`

Retrieve the full current session state.

**Response `200`**

```json
{
  "id": "uuid",
  "source": "// current source text",
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

**Query params**

| Param | Default | Max |
|---|---|---|
| `limit` | 50 | 200 |
| `offset` | 0 | — |

**Response `200`**

```json
{
  "patches": [ ...Patch[] ],
  "total": 12,
  "offset": 0,
  "limit": 50
}
```

---

### `GET /api/live/session/:id/events`

Server-Sent Events stream. The connection receives:

1. An immediate `session_snapshot` event with full state.
2. `patch_applied` / `patch_reverted` events as they occur.
3. `heartbeat` every 25 seconds to keep the connection alive.

**Response headers**

```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
```

**Event shape** — each line is:

```
data: <JSON>\n\n
```

**Event types**

```ts
// Full session state on connect
{ type: "session_snapshot", session: SessionState }

// A patch was applied
{ type: "patch_applied", patch: Patch, session: SessionSummary }

// A revert patch was applied
{ type: "patch_reverted", patch: Patch, session: SessionSummary }

// Run result reported by the client (informational)
{ type: "run_result_posted", result: RunResult, revision: number }

// Keep-alive
{ type: "heartbeat", ts: number }

// Error notification
{ type: "error", message: string }
```

---

### `POST /api/live/session/:id/patch`

Apply a source or param change. **Requires write token.**

**Request body**

```json
{
  "type": "source_replace",
  "source": "// new .forge.js source",
  "summary": "Add chamfer to top edge",
  "runResult": {
    "success": true,
    "errors": [],
    "warnings": [],
    "timestamp": 1700000000000
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `type` | yes | `"source_replace"` or `"param_update"` |
| `summary` | yes | Human-readable change description |
| `source` | for `source_replace` | New full source text |
| `params` | for `param_update` | Key/value pairs merged into current params |
| `runResult` | no | Pre-populated if caller already evaluated the model |

**Response `201`**

```json
{
  "patch": { ...Patch },
  "session": { ...SessionState }
}
```

---

### `GET /api/live/session/:id/run-result`

Fetch the latest run telemetry posted by a connected studio tab.

**Response `200` (no run yet)**

```json
{
  "runResult": null,
  "message": "No run result posted yet. Connect CadLad Studio to the session and run the model."
}
```

**Response `200` (run available)**

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
      "boundingBox": {
        "min": [0, 0, 0],
        "max": [120, 90, 60]
      }
    }
  },
  "revision": 5
}
```

---

### `POST /api/live/session/:id/run-result`

Post the latest studio run result, including optional screenshot/statistics. **Requires write token.**

**Request body**

```json
{
  "revision": 5,
  "result": {
    "success": true,
    "errors": [],
    "warnings": [],
    "timestamp": 1700000000000
  }
}
```

**Response `200`**

```json
{ "ok": true }
```

---

### `POST /api/live/session/:id/revert`

Revert to the state just before a specific patch. **Append-only — creates a new patch.**
Requires write token.

**Request body**

```json
{
  "patchId": "uuid-of-patch-to-undo",
  "summary": "Undo the chamfer change"
}
```

**Response `201`**

```json
{
  "patch": { ...Patch },
  "session": { ...SessionState }
}
```

The new patch has `type: "revert"` and `revertOf: <original-patchId>`.

---

## Data Types

### `SessionState`

```ts
interface SessionState {
  id: string;
  source: string;
  params: Record<string, number>;
  revision: number;
  lastSuccessfulRevision: number;
  patches: Patch[];
  createdAt: number;   // ms since epoch
  updatedAt: number;
}
```

### `Patch`

```ts
interface Patch {
  id: string;
  revision: number;
  type: 'create' | 'source_replace' | 'param_update' | 'revert';
  summary: string;
  sourceBefore: string;
  sourceAfter: string;
  paramsBefore: Record<string, number>;
  paramsAfter: Record<string, number>;
  revertOf?: string;       // id of the patch this undoes
  runResult?: RunResult;
  createdAt: number;
}
```

### `RunResult`

```ts
interface RunResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  timestamp: number;
}
```

---

## Local Development

### Prerequisites

- Node.js 18+
- A local install of `wrangler` (installed by `npm install` inside `worker/`)

### Run locally

```bash
cd worker
npm install
npm run dev
# Worker listens at http://localhost:8787
# Start the studio separately: cd .. && npm run dev (http://localhost:5173)
```

Override the studio origin for liveUrl construction:

```bash
npx wrangler dev --var STUDIO_ORIGIN:http://localhost:5173
```

### Quick test (curl)

```bash
# 1. Create a session
curl -s -X POST http://localhost:8787/api/live/session \
  -H 'Content-Type: application/json' \
  -d '{"source":"const b = box(40,40,20); return b;", "params":{}}' | jq

# Save sessionId and writeToken from the response

SESSION=<sessionId>
TOKEN=<writeToken>

# 2. Subscribe to events (keep this running in a separate terminal)
curl -N "http://localhost:8787/api/live/session/$SESSION/events"

# 3. Apply a patch
curl -s -X POST "http://localhost:8787/api/live/session/$SESSION/patch" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"type":"source_replace","source":"const b = box(60,40,20); return b;","summary":"Widen box to 60"}' | jq

# 4. Get history
curl -s "http://localhost:8787/api/live/session/$SESSION/history" | jq

# 5. Revert
PATCH_ID=<id-from-step-3>
curl -s -X POST "http://localhost:8787/api/live/session/$SESSION/revert" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"patchId\":\"$PATCH_ID\"}" | jq
```

---

## Deployment (Wrangler)

### One-time setup

```bash
cd worker
npm install
npx wrangler login
```

### Verify auth + account selection

```bash
npx wrangler whoami
```

### Deploy to Cloudflare

```bash
npm run deploy
# equivalent: npx wrangler deploy --config wrangler.toml
# or from repo root: npm run worker:deploy
```

### Set production studio origin

Set `STUDIO_ORIGIN` in Cloudflare (Workers & Pages → your worker → Settings → Variables)
to your production studio URL, for example:

```text
https://cadlad.studio
```

This controls:

- CORS allow-origin behavior, and
- `liveUrl` generation returned by `POST /api/live/session`.

### Dry-run deploy (no publish)

```bash
npm run deploy:dry
# or from repo root: npm run worker:deploy:dry
```

### Post-deploy smoke test

```bash
# replace with your actual workers.dev URL
export API_BASE="https://cadlad-live-sessions.<your-subdomain>.workers.dev"

curl -s "$API_BASE/health" | jq
```

Expected result includes:

```json
{ "status": "ok", "service": "cadlad-live-sessions" }
```

---

## Design Notes

- **One Durable Object per session.** The DO ID is derived from the session UUID via
  `idFromName`. Each DO stores the full session in its KV storage (single `"session"` key).
- **Append-only history.** Revert creates a new patch; old patches are never deleted.
  Only the most recent `MAX_PATCHES` (100) entries are kept in storage to cap size.
- **SSE not WebSocket.** v1 uses Server-Sent Events (one-directional) for simplicity.
  Clients send writes via normal POST. WebSocket upgrade is a v2 concern.
- **In-memory SSE fan-out.** Active SSE connections are stored in a `Map` on the DO instance.
  If the DO hibernates (no active connections), the map is empty on restart. Clients should
  reconnect and will receive a `session_snapshot` on reconnect.
- **No user accounts.** Auth is capability-token only (write token in the `liveUrl`).
  Anyone with the URL can write in v1. Multi-user ACL is a future concern.
- **CORS.** All responses carry `Access-Control-Allow-Origin: *` in v1. Tighten by setting
  `STUDIO_ORIGIN` to your exact domain in production.

---

## Integration Points

| Consumer | How to connect |
|---|---|
| Studio (Workstream 1) | `POST /api/live/session` on button tap; `GET /events` for SSE |
| Patch history UI (Workstream 2) | Consume `patch_applied` / `patch_reverted` SSE events; `GET /history` for full log |
| Assistant bridge (Workstream 4) | `GET /session`, `POST /patch`, `POST /revert` with write token |
