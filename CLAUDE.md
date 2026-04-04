# CadLad

Code-first parametric 3D CAD in TypeScript. Browser studio (Monaco + Three.js) and CLI. Geometry kernel: Manifold (WASM).

**This is a prompt-based 3D modeling workflow.** The primary feedback loop is: write .forge.ts code → render → screenshot → evaluate → iterate. Optimize for that.

## Commands

```bash
npm run dev          # Vite dev server at localhost:5173
npm run build        # Production build
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run lint         # eslint src/
```

## Architecture

```
src/
  engine/    Manifold WASM backend, Solid class, primitives, types
  api/       Public modeling API: runtime, params, sketch, assembly, hints
  studio/    Browser IDE: Monaco editor, Three.js viewport, param panel
  cli/       Node CLI: run, export, studio launcher
projects/    Folder-per-project: projects/{name}/{name}.forge.ts + README.md + reference/
gallery/     Gallery page (auto-reads from projects/*/*.forge.ts via import.meta.glob)
scripts/     CI checks, snapshot tests, hook installer
snapshots/   Visual regression test references
```

## Model files (.forge.ts)

- Use `param()` for slider-driven parameters with min/max/unit
- Primitives: `box()`, `cylinder()`, `sphere()`, `roundedRect()`, `roundedBox()`, `taperedBox()`
- 2D → 3D: `Sketch.begin()`, `rect()`, `circle()`, `slot()`, `lShape()`, `channel()`, `tShape()` → `.extrude()` / `.extrudeAlong(dir, h)` / `.revolve()` / `.sweep(path)`
- Standalone: `sweep(profile, path)`, `loft(profiles, heights)`
- Booleans: `.union()`, `.subtract()`, `.intersect()`, `.subtractAll()`, `.unionAll()`, `.intersectAll()`
- Construction geometry: `toolBody("name", solid)` for non-rendered cutter/helper solids used in boolean ops
- Edge treatment: `.fillet(subdivisions)`, `.chamfer(subdivisions)`, `.smooth(subdivisions, minSharpAngle)`
- Shell: `.shell(thickness)` — hollow out a solid with uniform wall thickness
- Draft: `.draft(angleDeg)` — taper walls for mold release (positive = inward going up)
- Transforms: `.translate()`, `.rotate()`, `.scale()`, `.mirror()`
- Metadata: `.color("#hex")`, `.named("Part Name")`
- Query: `.volume()`, `.surfaceArea()`, `.boundingBox()`
- Multi-part: `assembly("name").add("part", solid, [x, y, z])`
- Reference geometry: `plane.XY/XZ/YZ`, `plane.midplane(solid, axis)`, `axis.X/Y/Z()`, `datum.fromBBox(solid, anchor)`
- Reference placement: `solid.translateTo(plane, [dx, dy, dz])`
- Camera hint: `return { model: solid, camera: [x, y, z] }`
- Must `return` a Solid, Assembly, array, or `{ model, camera }` object
- Declarative constraints in scenes: `constraint("wall_thickness" | "symmetry" | "clearance" | "max_overhang", config)`

## 3D Tools API Contract

### Extrude / Revolve / Sweep / Loft

| Tool | Input | Method | Contract |
|---|---|---|---|
| **Extrude** | 2D sketch | `sketch.extrude(height)` | Pushes profile along Z. Height > 0. Validates sketch, auto-corrects CW→CCW winding. |
| **ExtrudeAlong** | 2D sketch + direction | `sketch.extrudeAlong([x,y,z], height)` | Pushes profile along arbitrary direction. Eliminates manual rotate after extrude. |
| **Revolve** | 2D sketch | `sketch.revolve(segments?)` | Rotates profile around Y axis. Default 32 segments. Profile must be on positive X side. |
| **Sweep** | 2D sketch + 3D path | `sketch.sweep(path)` or `sweep(profile, path)` | Extrudes profile along 3D path. Path ≥ 2 points, profile ≥ 3 points. Profile oriented perpendicular to path tangent. |
| **Loft** | Multiple 2D profiles + heights | `loft(profiles, heights)` | Interpolates between ≥ 2 profiles at strictly ascending Z heights. Uses convex hull between consecutive profiles. |
| **TaperedBox** | dimensions | `taperedBox(h, w1, d1, w2, d2)` | Box that tapers from (w1×d1) at z=0 to (w2×d2) at z=h. Uses loft internally. |
| **RoundedBox** | dimensions + radius | `roundedBox(w, d, h, r, segs?)` | Box with ALL edges/corners uniformly rounded. Hull of 8 corner spheres. Unlike `roundedRect` which only rounds XY corners. |

### Shell

`solid.shell(thickness)` — Hollows out a solid, leaving walls of uniform thickness.
- **thickness** must be positive and less than half the smallest bounding-box dimension.
- Uses centroid-based scaling: works well for convex shapes (boxes, cylinders, simple enclosures).
- For complex concave shapes, wall thickness may not be perfectly uniform — use explicit boolean subtraction instead.

### Boolean Operations

| Method | Contract |
|---|---|
| `.union(other)` | Merges two solids. Overlapping volume counted once. Preserves `this` color/name. |
| `.subtract(other)` | Cuts `other` from `this`. Always oversize cutters by 1–2mm to avoid coplanar artifacts. |
| `.intersect(other)` | Keeps only overlapping volume. Preserves `this` color/name. |

### Draft / Fillet / Chamfer

| Method | Contract |
|---|---|
| `.draft(angleDeg)` | Tapers walls from base (Z=min). Positive angle = inward going up (mold release). Typical: 1–5° for injection molding. |
| `.fillet(subdivisions?)` | Rounds all edges via Catmull-Clark subdivision. Subdivisions 2–4 typical. **Increases volume** on convex shapes (vertices push outward for curvature). |
| `.chamfer(subdivisions?)` | Flat bevel on edges. Use subdivisions ≥ 2 for visible effect. Fewer triangles than equivalent fillet. |
| `.smooth(subdivisions?, minSharpAngle?)` | Smooth edges then subdivide. `minSharpAngle=0` smooths all; `60` only smooths hard edges. |

## Coordinate system (LOCKED IN)

**All modeling code uses Z-up.** This matches Manifold, CAD conventions, and LLM training data.

| Axis | Meaning in model code | Meaning after render transform |
|---|---|---|
| +Z | Up (gravity opposes) | +Y (Three.js up) |
| -Z | Down (toward ground) | -Y |
| +X | Right | +X (unchanged) |
| -X | Left | -X (unchanged) |
| -Y | Front (faces the viewer) | +Z (toward camera) |
| +Y | Back | -Z |

**The coordinate transform happens at the rendering boundary:**
- `buildBodyGroup(bodies, { zUpToYUp: true })` applies `-90° X rotation`
- Applied in: studio viewport, gallery static render, gallery interactive viewer
- Applied via `src/rendering/scene-builder.ts` — one place, consistent everywhere

**When writing .forge.ts code:**
- Ground plane is Z=0. Build upward with `.translate(0, 0, height/2)`
- `cylinder()` builds along Z (vertical by default)
- `Sketch.begin()` draws in XY, `.extrude()` pushes along Z (up)
- "Front" of an object faces -Y

## Hard-won lessons (baked into the API)

These are the things that burned us during development. They're fixed at the API level now, but understanding them helps avoid related problems:

### Polygon winding (FIXED in API)
Manifold silently produces empty geometry from clockwise polygons. `extrudePolygon()`, `revolve()`, `sweep()`, and `loft()` now auto-detect CW winding and reverse to CCW, with a console warning. If you use `CrossSection` directly, you must ensure CCW yourself.

### .color() after .union() overwrites everything
`.union()` merges meshes. A `.color()` call after applies to the whole merged result, losing individual part colors. **Use `assembly()` instead of `.union()` when you need different colors on different parts.** The viewport auto-assigns distinct muted colors to assembly parts that don't have explicit colors.

### Sketch extrude orientation (IMPROVED — use extrudeAlong)
`Sketch.begin()` draws in XY. `.extrude(h)` pushes along Z. To avoid manual rotate chains, use `.extrudeAlong([1,0,0], h)` to extrude along any direction. The old pattern (extrude along Z then `.rotate()`) still works, but `extrudeAlong` is cleaner for non-Z extrusions.

### roundedRect is NOT a rounded cube — use roundedBox
`roundedRect(w, d, r, h)` creates a 2D rounded rectangle extruded to height h. The corners are only rounded in XY — edges along Z are sharp. **Use `roundedBox(w, d, h, r)` for a fully-rounded 3D box** with all 12 edges and 8 corners uniformly rounded.

### Boolean subtract sizing
Always oversize cutters by 1-2mm in the cutting direction to avoid coplanar face artifacts. Example: `cylinder(height + 2, radius)` for a through-hole.

### Boolean junction artifacts — clean the inside
When a handle or attachment overlaps a hollow body (bowl, shell, enclosure), the handle's interior face shows through as a visible rectangle inside the cavity. **Fix: subtract a cylinder/box matching the inner cavity from the handle** before assembling. This carves away the part of the handle that would poke through the interior wall.

```js
// Handle overlaps bowl wall → visible artifact inside bowl
const handle = box(length, width, thickness)
  .translate(outerR + length/2, 0, rimZ);

// Clean the junction: remove the part inside the inner cavity
const innerCarve = cylinder(height * 3, innerR - 0.5);
const cleanHandle = handle.subtract(innerCarve);
```

### Tapered handles — use taperedBox or extrudeAlong
For handles that taper in width/thickness, use `taperedBox(h, w1, d1, w2, d2)` instead of hacking box subtractions. For handles with a distinctive side profile (e.g., thick at one end, thin at the other), use `Sketch.begin()...close().extrudeAlong([1,0,0], length)` to draw the profile and extrude directly along the handle axis without manual rotations.

### Shell is centroid-based scaling
`.shell(thickness)` scales from the bounding-box centroid. This produces uniform walls for convex shapes (boxes, cylinders) but may produce uneven walls on complex concave geometry. For those cases, model the inner void explicitly and use `.subtract()`.

### Fillet increases volume on convex shapes
Manifold's smooth subdivision pushes vertices outward to create curvature. On a convex shape like a box, `.fillet()` **increases** volume rather than decreasing it. This is expected Catmull-Clark behavior.

### Draft pivots at the base
`.draft(angle)` applies the taper starting from Z=min. Vertices at the base stay fixed; vertices at the top move inward (positive angle) or outward (negative). The taper is relative to the bounding-box centroid in XY.

### WebGL context limit
Browsers limit to ~8-16 simultaneous WebGL contexts. The gallery uses disposable renderers (render → capture to dataURL → dispose) to handle 20+ models.

## Screenshot workflow

Puppeteer is NOT a project dependency — it's found from the environment (project node_modules, /tmp installs, global, npx cache).
Before taking screenshots, **sniff the runtime first** (which browser binary exists, whether shared libs are present, and whether Puppeteer is resolvable). Do this before installing anything or skipping validation.

### Important for agent/tooling environments

`browser_container` is optional infrastructure and may not exist in some runtimes. In CadLad, that is **not** a valid reason to skip screenshots.

- If `browser_container` is unavailable, immediately fall back to CadLad's headless workflow (`scripts/vibe-snap.mjs`, `scripts/snapshot-test.mjs`, `scripts/headless-doctor.mjs`).
- Treat screenshotting + runtime sniffing as a required competency for visual/modeling work.
- Do not stop at "screenshot tool unavailable" until you've attempted the local sniff-and-capture path.
- If capture still fails after sniffing, report exactly what was checked (browser binary, Puppeteer resolution, shared libs) and the concrete blocking error.

```bash
# Vibe-modeling: quick screenshot capture (4 angles by default)
node scripts/vibe-snap.mjs projects/mymodel/mymodel.forge.ts
node scripts/vibe-snap.mjs projects/mymodel/mymodel.forge.ts --angles 1  # just iso
node scripts/vibe-snap.mjs projects/mymodel/mymodel.forge.ts --angles 7  # all 7
node scripts/headless-doctor.mjs                                          # diagnose Chromium shared libs (Linux)
sudo node scripts/headless-doctor.mjs --install                           # install common Debian/Ubuntu runtime libs

# Render a model from all 7 angles (legacy)
node /tmp/cadlad_sniff/render.mjs projects/mymodel/mymodel.forge.ts /tmp

# Snapshot test all projects
node scripts/snapshot-test.mjs --url http://localhost:5173
node scripts/snapshot-test.mjs --update  # capture new references
```

The studio exposes `window.__cadlad` for automation:
- `setCode(code)` — inject code into the editor
- `run()` — trigger evaluation
- `setView("front"|"back"|"top"|"bottom"|"left"|"right"|"iso")` — position camera
- `hasError()` / `getErrors()` — check for evaluation errors

**Always evaluate models from multiple angles.** A model can look correct from one angle and be completely broken from another. The render script captures 7 angles by default.

## Rendering

- **Edge strokes on all models** — EdgesGeometry at 30° threshold. Edge color adapts: 50% darker for light surfaces, 50% lighter for dark surfaces. Applied in both studio viewport and gallery.
- **3-point lighting**: key + fill + rim + top fill for 3D readability
- **Auto-color**: bodies without `.color()` get unique muted hues instead of uniform gray
- **High-contrast mode**: gallery toggle — light gray surfaces, dark edge strokes, white background. Best for evaluating geometry.
- **Color survives transforms**: `_derive()` carries `_color` and `_name` through all Solid operations (translate, rotate, scale, union, subtract, etc.)
- **Z-up → Y-up**: gallery rotates mesh group -90° on X. Studio viewport uses Manifold's Z-up directly.
- Gallery auto-reads all .forge.ts files from projects/*/ — add a folder and it appears
- Models can return `{ model, camera: [x,y,z] }` to control their gallery viewing angle

## Git workflow

- Branch protection on main — all changes go through PRs
- `scripts/ci-check-bg.sh` runs lint/typecheck/test in background after commits
- `scripts/install-hooks.sh` sets up local git hooks
- Local `core.hooksPath` set to `.git/hooks` (overrides global hooks)

## Skills

- [.claude/skills/SKILLS.md](.claude/skills/SKILLS.md) — Master architect reference for CAD fabrication and building design
- [.claude/skills/sniff_screenshot.md](.claude/skills/sniff_screenshot.md) — Headless screenshot environment guide

## Workflows (session warmup prompts)

Read the relevant workflow file at the start of a session to get oriented fast:

- [.claude/skills/workflow-vibe-modeling.md](.claude/skills/workflow-vibe-modeling.md) — Interactive vibe-modeling session (WRITE → SNAP → LOOK → SHOW → DECIDE)
- [.claude/skills/workflow-build-model.md](.claude/skills/workflow-build-model.md) — Build a new .forge.ts project model
- [.claude/skills/workflow-evaluate-model.md](.claude/skills/workflow-evaluate-model.md) — Evaluate model quality from multiple angles
- [.claude/skills/workflow-add-api.md](.claude/skills/workflow-add-api.md) — Add or extend a Solid/Sketch/primitive API method
- [.claude/skills/workflow-fix-rendering.md](.claude/skills/workflow-fix-rendering.md) — Diagnose and fix a rendering or visual bug
- [.claude/skills/workflow-studio-ux.md](.claude/skills/workflow-studio-ux.md) — Studio or gallery UX improvement
- [.claude/skills/workflow-ci-hygiene.md](.claude/skills/workflow-ci-hygiene.md) — CI checks, lint, types, snapshot tests
