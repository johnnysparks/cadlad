# Assistant Live Modeling

How to connect an external AI assistant to a CadLad live session for real-time collaborative vibe-modeling.

---

## The loop

```
User opens CadLad Studio
  → taps 🤖☁️ button → session created → capability URL copied
  → pastes URL into assistant
  → assistant reads session state, edits model, sees render
  → user watches Monaco + viewport update live
```

This is **Mode B: direct write**. No approval step. Patch history makes it safe to undo.

---

## Capability URL format

When the studio creates a session it copies a URL like:

```
https://cadlad.studio?session=<sessionId>&token=<writeToken>
```

The `token` is a write capability — anyone with it can patch the session. Treat it like a shared secret.

### Recommended clipboard payload

Paste this block into an assistant conversation to start a live session:

```
CadLad live session active.

Session URL: https://cadlad.studio?session=<id>&token=<token>
API base: https://sessions.cadlad.workers.dev

Tools available: get_session_state, list_patch_history, apply_patch,
  replace_source, update_params, revert_patch, get_latest_screenshot, get_model_stats

Start by calling get_session_state to read the current model.
Then make changes with apply_patch, replace_source, or update_params.
After each change, call get_latest_screenshot to see the result.
If a change breaks the model, call list_patch_history to find the patch ID,
then call revert_patch to undo it.
```

---

## MCP server setup

The `mcp/` directory contains a Node.js MCP server that bridges the assistant to the live-session API.

### Install and build

```bash
cd mcp
npm install
npm run build
```

### Run against a session

```bash
CADLAD_SESSION_URL="https://cadlad.studio?session=<id>&token=<token>" \
CADLAD_API_BASE="https://sessions.cadlad.workers.dev" \
node dist/server.js
```

Or with the CLI flag:

```bash
node dist/server.js --session="https://cadlad.studio?session=<id>&token=<token>"
```

### Wire into Claude Desktop (example)

Add to `~/.config/claude-desktop/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cadlad": {
      "command": "node",
      "args": ["/path/to/cadlad/mcp/dist/server.js"],
      "env": {
        "CADLAD_SESSION_URL": "https://cadlad.studio?session=<id>&token=<token>",
        "CADLAD_API_BASE": "https://sessions.cadlad.workers.dev"
      }
    }
  }
}
```

---

## Tools reference

### `get_session_state`

Returns full session including source code and current param values.

```
→ Session: abc123
  Revision: 4 (last successful: 3)
  Params: {"Width": 120, "Height": 80}
  === Source ===
  const w = param("Width", 120, {min:10, max:300});
  ...
```

**Call this first.** Always read before writing.

### `list_patch_history`

```typescript
list_patch_history({ limit: 20, offset: 0 })
```

Returns each patch with:
- `id` — use with `revert_patch`
- `type` — `source_replace`, `param_update`, `revert`, `create`
- `summary`, `intent`, `approach`
- run result status: `✓` success, `✗ (error message)`, `?` unknown

### `replace_source`

```typescript
replace_source({
  source: "const w = param('Width', 100, {min:10,max:300});\nreturn box(w, 50, 30);",
  summary: "Simplify to a plain box",
  intent: "Remove the fillet that was causing geometry errors",
  approach: "Replaced roundedBox with box() and removed .fillet() call"
})
```

Always include `summary`. Include `intent` and `approach` — they appear in the patch history and help both the user and future model iterations understand the reasoning.

### `apply_patch`

```typescript
apply_patch({
  type: "source_replace",
  source: "const w = param('Width', 120, {min:10,max:300});\nreturn box(w, 50, 30);",
  summary: "Widen body and simplify side profile",
  intent: "Make footprint more stable",
  approach: "Replace tapered shape with direct box baseline"
})
```

```typescript
apply_patch({
  type: "param_update",
  params: { "Wall Thickness": 3.2, "Height": 125 },
  summary: "Tune wall and height for printability"
})
```

Generic write tool for direct patching. Use this when your assistant/tooling favors a single mutation endpoint.

### `update_params`

```typescript
update_params({
  params: { "Wall Thickness": 3, "Height": 120 },
  summary: "Increase wall thickness to 3mm, height to 120mm",
  intent: "Make walls strong enough for FDM printing"
})
```

Does not change source — only updates current param values. Good for quick exploration.

### `revert_patch`

```typescript
revert_patch({
  patchId: "f8a3c2d1-...",
  summary: "Revert fillet attempt — broke geometry"
})
```

Append-only: creates a new patch that restores state to before the target patch. Does **not** rewrite history.

### `get_latest_screenshot`

Returns the most recent render frame posted by the connected Studio, as an image. If no studio is connected, returns a text fallback with geometry stats.

**Workflow:**
1. Apply a patch → studio rerenders automatically
2. Wait ~1-2 seconds for rerender
3. Call `get_latest_screenshot` → see the result

If the studio is not open, use `get_model_stats` for a text-based sanity check instead.

### `get_model_stats`

```
Bodies: 3
Triangles: 12,480
Bounding box: 120.0 × 80.0 × 45.0 (W × H × D, model units)
  min: [0.00, 0.00, 0.00]
  max: [120.00, 80.00, 45.00]
Volume: 342000.00 units³
```

Useful for validation without needing a screenshot.

---

## Direct-write modeling contract

### Read before you write

Always call `get_session_state` first. The source may have been edited by the human since the session started.

If your runtime prefers a single writer tool, treat `apply_patch` as canonical and map specialized actions (`replace_source`, `update_params`) to it.

### Choose fix-forward vs revert

| Situation | Strategy |
|---|---|
| Small syntax error or typo | fix-forward: `replace_source` with corrected code |
| Geometry error (empty mesh, disconnected parts) | try fix-forward first; revert if 2 attempts fail |
| Wrong approach entirely | revert to last known-good revision, then try different strategy |
| Param in wrong range | `update_params` or edit source |

### Include intent and approach in every patch

This is the equivalent of a commit message. The user sees it in the patch history panel. Future assistant iterations can read it. Minimum:

```
summary:  "Add mounting holes for M3 screws"
intent:   "Part needs to attach to aluminum extrusion"
approach: "4× cylinder subtractions at corners, 3.2mm diameter for M3 clearance"
```

### Handle compile failures

After `replace_source`, check `get_latest_screenshot` or `get_model_stats`. If the run failed:
1. The `runResult.errors` in the last run result will say what went wrong
2. Read the current session state to confirm which source is live
3. Either fix-forward or revert

Common CadLad errors:
- `Model has N disconnected parts` → parts not touching; use `assembly()` or `.union()` to connect
- `empty geometry` → sketch winding issue; profile may be clockwise
- `Cannot read properties of undefined` → API call with wrong args (check CLAUDE.md)

### Param exploration workflow

When exploring parameter space:
1. `update_params` with a new value → `get_latest_screenshot` → evaluate
2. If the direction is good, update_params further
3. When you have good values, consider editing the source to change the param defaults

---

## Studio integration notes (for W1)

After each successful `runModel()` when a session is attached, the studio should:

```typescript
// After runModel() succeeds and session is connected:

const screenshot = viewport.captureFrame(); // base64 PNG data URL

// Compute stats from ModelResult
const stats = computeModelStats(result);

// Post to session
await fetch(`/api/live/session/${sessionId}/run-result`, {
  method: "POST",
  headers: { "Authorization": `Bearer ${writeToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    revision: currentRevision,
    result: {
      success: result.errors.length === 0,
      errors: result.errors,
      warnings: result.hints.map(h => h.message),
      timestamp: Date.now(),
      stats,
      screenshot,
    }
  })
});
```

Helper to compute stats from `ModelResult`:

```typescript
function computeModelStats(result: ModelResult): ModelStats {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let totalTriangles = 0;

  for (const body of result.bodies) {
    const pos = body.mesh.positions;
    totalTriangles += body.mesh.indices.length / 3;
    for (let i = 0; i < pos.length; i += 3) {
      minX = Math.min(minX, pos[i]);     maxX = Math.max(maxX, pos[i]);
      minY = Math.min(minY, pos[i + 1]); maxY = Math.max(maxY, pos[i + 1]);
      minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2]);
    }
  }

  return {
    triangles: totalTriangles,
    bodies: result.bodies.length,
    boundingBox: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    },
  };
}
```

The screenshot should be capped to ~512px wide to keep the stored payload light. Use an offscreen canvas or pass a max-size option to `captureFrame()` (future enhancement).

---

## Bigger picture: future capabilities

These are not yet implemented but follow naturally from this architecture.

### Cross-section inspection

The studio already supports `__cadlad.setCrossSection('z', 10)`. The MCP bridge could expose a `capture_cross_section` tool that:
1. Sends a session command `{ type: 'set_cross_section', axis: 'z', offset: value }` as an SSE broadcast
2. Studio applies the clipping plane and posts a new run-result with screenshot
3. MCP tool returns the screenshot

Requires: a new session command event type + studio SSE listener.

### Param sweep

```typescript
param_sweep({
  param: "Wall Thickness",
  values: [1.5, 2.0, 2.5, 3.0],
  captureEach: true
})
```

Runs the model N times with different param values, returns a grid of screenshots. Powerful for exploring design space visually.

Requires: server-side evaluation (Node + Manifold WASM) or firing N `update_params` calls and collecting screenshots.

### Part visibility

```typescript
set_part_visibility({ part: "Inner Core", visible: false })
```

For assemblies: hide/show individual parts for better inspection.

Requires: viewport state wired to session events.

### 2D draft view

Generate orthographic projection views (front, top, side) as clean line drawings — useful for fabrication review.

Requires: SVG or PDF output from Three.js orthographic camera + LineDashedMaterial extraction.

### Agent status strip

The patch history panel (W2) could show the agent's "thinking" — a rolling log of intent/approach annotations from recent patches, giving the user visibility into what the agent is doing without requiring a separate chat pane.

Requires: W2 consuming the `intent`/`approach` fields from patch events (already in the types).
