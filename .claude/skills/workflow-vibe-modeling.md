# Workflow: Vibe-Modeling Session

Interactive design session. You write code, take screenshots, evaluate, iterate with the user.

## Setup (once per session)

```bash
npm run dev                   # Vite at localhost:5173 (check if already running first)
ls projects/                  # See existing projects
```

New project? Create `projects/{name}/{name}.forge.ts` + `README.md`.

## The Loop

Repeat until satisfied:

1. **WRITE** — Edit the `.forge.ts` file
2. **SNAP** — `node scripts/vibe-snap.mjs projects/{name}/{name}.forge.ts`
3. **LOOK** — Read the screenshot files (paths printed to stdout) to evaluate
4. **SHOW** — Display the most relevant screenshot to the user (the angle that best reveals what changed, or iso for big-picture). If all angles were relevant, show iso.
5. **DECIDE** — Fix issues, iterate, or move on to next feature

### Snap options (smart escalation)

```bash
# Default: 4 angles (iso, front, right, top) — good balance
node scripts/vibe-snap.mjs projects/foo/foo.forge.ts

# Quick check: just iso (~4s)
node scripts/vibe-snap.mjs projects/foo/foo.forge.ts --angles 1

# Full coverage: all 7 angles
node scripts/vibe-snap.mjs projects/foo/foo.forge.ts --angles 7

# Specific angle
node scripts/vibe-snap.mjs projects/foo/foo.forge.ts --angle front

# Suppress info logs
node scripts/vibe-snap.mjs projects/foo/foo.forge.ts --quiet
```

Start with `--angles 1` for quick iteration. Escalate to 4 or 7 when issues aren't obvious.

## What to check in screenshots

- Is the shape recognizable as the intended object?
- Are all features visible (no missing geometry)?
- Are proportions reasonable?
- Any artifacts (z-fighting, inside-out faces, missing faces)?

## After each major milestone

Update `README.md` Build Log with session entry + screenshot reference.

## API quick reference

```js
param("Name", default, { min, max, unit: "mm" })
box(w, d, h)  |  cylinder(h, r)  |  sphere(r)  |  roundedBox(w, d, h, r)
Sketch.begin(x, y).lineTo(x2, y2).close().extrude(h)
.union(b)  |  .subtract(b)  |  .intersect(b)
.translate(x, y, z)  |  .rotate(rx, ry, rz)  |  .scale(s)  |  .mirror([nx, ny, nz])
.color("#hex")  |  .named("Part")
assembly("Name").add("part", solid, [x, y, z])
// Must return a Solid, Assembly, array, or { model, camera: [x,y,z] }
```

## Common fixes

- **Empty/invisible model** — missing `return` statement
- **Colors lost after union** — use `assembly()` for multi-color
- **Coplanar artifacts** — oversize boolean cutters by +2mm
- **Wrong from one angle** — check Z-up coordinate system (Z=up, -Y=front)
- **Winding errors** — API auto-fixes, but check if using CrossSection directly

## Project README template

```markdown
# {Project Name}
{One-sentence description}

## Design Intent
{2-3 sentences: what is it, key features}

## Key Dimensions
| Parameter | Default | Range | Notes |
|---|---|---|---|

## Build Log
### Session YYYY-MM-DD
- Changes: {what was added/modified}
- Screenshot: ![iso](snapshots/{name}-iso.png)
- Status: {in-progress / complete}
```
