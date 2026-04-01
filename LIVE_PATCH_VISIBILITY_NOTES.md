# Live Patch Visibility Integration Notes

This workstream adds a transport-agnostic patch visibility layer in the studio.

## API/Event assumptions

The UI expects patch items shaped like `PatchEvent` in `src/studio/types/live-session.ts`:

- `patchId`, `revision`, `timestamp`
- `summary.title`, optional `summary.details`
- optional `summary.touchedLineRanges` (`startLine`, `endLine`)
- optional `runResult.state` (`success` | `failed` | `running`)

No transport is assumed: SSE, polling, or direct callback can all feed the same structures.

## Connection points for real session events

1. Feed incoming patch stream snapshots into:
   - `window.__cadlad.setPatchHistory(patches)` from integration code, or
   - call `applyPatchHistory` in `src/studio/main.ts` directly when wiring a live session client.
2. Revert UI currently logs intent in `PatchHistoryPanel.onRevertPatch`; replace with backend call in Workstream 1/3 integration.

## UI pieces delivered

- Monaco age heatmap + latest + failed + selected line decorations (`EditorDecorations`).
- Bottom-drawer patch history list with patch metadata and revert hook placeholder (`PatchHistoryPanel`).
- Compact top status pill summarizing last patch and run state (`#patch-run-status`).

## TODOs for backend/session integration

- Include line ranges in patch payloads for best decorations.
- Return stable patch IDs and revision numbers on both patch apply and revert.
- Decide if timestamps are server UTC ISO strings (recommended) and keep consistent.
