# Assistant Live Modeling

How to connect an AI assistant to a CadLad live session for real-time collaborative vibe-modeling.

---

## The loop

```
User opens CadLad Studio
  → taps 🤖☁️ → session created → capability URL copied to clipboard
  → pastes URL into assistant chat
  → assistant reads session, edits model, sees the render
  → user watches Monaco + viewport update live
```

This is **direct write** mode — no approval step. Patch history makes every change safe to undo.

---

## Capability URL format

When the studio creates a session it copies:

```
https://cadlad.pages.dev?session=<sessionId>&token=<writeToken>
```

The `token` is a write capability. Anyone with it can patch the session — treat it like a shared secret.

### Clipboard payload for assistants

Paste this into a chat to start a live session:

```
CadLad live session active.

Session URL: https://cadlad.pages.dev?session=<id>&token=<token>
API base: https://cadlad-live-sessions.johnnymsparks.workers.dev

Tools available: get_session_state, list_patch_history, apply_patch,
  replace_source, update_params, revert_patch, get_latest_screenshot, get_model_stats, get_part_stats, query_part_relationship

Start by calling get_session_state to read the current model.
Make changes with replace_source or update_params.
After each change, call get_latest_screenshot to evaluate the result.
If a change breaks the model, call list_patch_history then revert_patch to undo it.
```

---

## MCP server

The `mcp/` directory contains a Node.js MCP server that bridges any MCP-compatible assistant to the live-session API.

### Install and build

```bash
cd mcp
npm install
npm run build
```

### Run against a session

```bash
CADLAD_SESSION_URL="https://cadlad.pages.dev?session=<id>&token=<token>" \
CADLAD_API_BASE="https://cadlad-live-sessions.johnnymsparks.workers.dev" \
node dist/server.js
```

Or pass the session URL as a flag:

```bash
node dist/server.js --session="https://cadlad.pages.dev?session=<id>&token=<token>"
```

### Wire into Claude Desktop

Add to `~/.config/claude-desktop/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cadlad": {
      "command": "node",
      "args": ["/path/to/cadlad/mcp/dist/server.js"],
      "env": {
        "CADLAD_SESSION_URL": "https://cadlad.pages.dev?session=<id>&token=<token>",
        "CADLAD_API_BASE": "https://cadlad-live-sessions.johnnymsparks.workers.dev"
      }
    }
  }
}
```

---

## Tools reference

### `get_session_state`

Returns full session state: source, params, revision, plus latest render/screenshot metadata.

```
→ Session: abc123
  Revision: 4 (last successful: 3)
  Params: {"Width": 120, "Height": 80}
  Latest render: ready
  Latest screenshot ref: artifact://render/abc123/r4
  === Source ===
  const w = param("Width", 120, {min:10, max:300});
  ...
```

**Call this first.** Always read before writing.

---

### `list_patch_history`

```typescript
list_patch_history({ limit: 20, offset: 0 })
```

Each patch includes `id`, `type`, `summary`, and run result status (`✓` / `✗` / `?`). Use `id` with `revert_patch`.

---

### `replace_source`

```typescript
replace_source({
  source: "const w = param('Width', 100, {min:10,max:300});\nreturn box(w, 50, 30);",
  summary: "Simplify to a plain box",
})
```

Replaces the full model source. Always include `summary` — it appears in patch history.

---

### `update_params`

```typescript
update_params({
  params: { "Wall Thickness": 3, "Height": 120 },
  summary: "Increase wall thickness to 3mm, height to 120mm",
})
```

Changes param values without touching source. Good for quick exploration.

---

### `apply_patch`

Generic write endpoint — accepts both `source_replace` and `param_update`:

```typescript
apply_patch({ type: "source_replace", source: "...", summary: "..." })
apply_patch({ type: "param_update", params: { "Height": 125 }, summary: "..." })
```

---

### `revert_patch`

```typescript
revert_patch({ patchId: "f8a3c2d1-...", summary: "Revert fillet — broke geometry" })
```

Append-only: creates a new patch that restores state to before the target patch. Does not rewrite history.

---

### `get_latest_screenshot`

Returns the most recent render frame posted by the connected Studio as an image when available.
The response now clearly reports render/screenshot state:

- `no_render` — no render has been posted yet
- `pending` — render request accepted but result not posted yet
- `failed` — render ran but model evaluation failed
- `blocked` — screenshot retrieval blocked by policy/tooling
- `ready` — screenshot is available (or image-backed artifact exists)

**Workflow:**
1. Apply a patch → studio rerenders automatically
2. Wait ~1–2 seconds
3. Call `get_latest_screenshot`

---

### `get_model_stats`

Text summary without needing a screenshot:

```
Bodies: 3
Triangles: 12,480
Bounding box: 120.0 × 80.0 × 45.0 mm
```

---

## Modeling contract

### Read before writing

Always call `get_session_state` first. The human may have edited since the session started.

### Fix-forward vs revert

| Situation | Strategy |
|---|---|
| Small syntax error | fix-forward with corrected code |
| Geometry error (empty mesh, disconnected parts) | try fix-forward twice, then revert |
| Wrong approach entirely | revert to last known-good, try different strategy |
| Param out of range | `update_params` or edit source |

### Write good summaries

Every patch summary is a commit message — visible in the history panel and readable by future assistant iterations.

```
summary: "Add M3 mounting holes at corners"
```

### Handle failures

After `replace_source`, call `get_latest_screenshot` or `get_model_stats` to verify. Common errors:

- `Model has N disconnected parts` → use `assembly()` or `.union()` to connect parts
- `empty geometry` → sketch winding issue; profile may be clockwise
- `Cannot read properties of undefined` → wrong API call args (check CLAUDE.md)

---

## Future capabilities

These aren't implemented yet but follow naturally from this architecture.

**Cross-section inspection** — expose `capture_cross_section(axis, offset)` as an MCP tool: sends a command to the studio, which moves the clipping plane and posts a new screenshot.

**Param sweep** — run the model N times with different param values, return a grid of screenshots for design-space exploration.

**Part visibility** — for assemblies, hide/show individual parts via session commands wired to the viewport.

**Agent status strip** — show the agent's running intent/approach log in the patch history panel, giving the user visibility into what it's doing without a separate chat pane.
