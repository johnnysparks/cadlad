# Live Session Client Notes (Workstream 1)

## API assumptions

Studio expects the live-session service described in `docs/live-session-api.md`:

- `POST /api/live/session` accepts `{ source, params }` and returns `{ sessionId, writeToken, liveUrl }`.
- `GET /api/live/session/:id` returns full current session state (`source`, `params`, `revision`, etc.).
- `GET /api/live/session/:id/events` serves SSE messages with JSON payloads that include a `type` field.

Client API base resolution order:

1. `VITE_LIVE_SESSION_API_BASE` (preferred),
2. fallback to `http(s)://<current-hostname>:8787` for local worker dev.

## Event payload assumptions

The Studio SSE listener handles:

- `session_snapshot` with `event.session` containing full session fields.
- `patch_applied` / `patch_reverted` with either:
  - `event.session` containing enough data to sync source/params, and/or
  - `event.patch.sourceAfter` / `event.patch.paramsAfter` as direct patch outputs.
- `run_status` as informational status only.
- `error` with a human-readable message.

## Session bootstrap location

Bootstrap is in `src/studio/main.ts`:

- Query params are read at startup.
- If `?session=<id>&token=<token>` is present, Studio immediately:
  1. fetches current session state,
  2. applies source/params into editor + parameter panel,
  3. opens SSE subscription,
  4. debounced reruns locally on remote updates.

The create-session button also rewrites URL params after successful session creation.

## TODOs for backend integration

- Confirm final SSE payload guarantees for `patch_applied` / `patch_reverted` so fallback logic can be simplified.
- Optionally expose revision in UI from authoritative backend fields rather than lightweight status text.
- If read endpoints become auth-protected later, include token on `GET /session/:id` too.
