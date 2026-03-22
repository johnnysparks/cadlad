# CadLad

Code-first parametric 3D CAD in TypeScript. Browser studio (Monaco + Three.js) and CLI. Geometry kernel: Manifold (WASM).

**This is a prompt-based 3D modeling workflow.** The primary feedback loop is: write .forge.js code → render → screenshot → evaluate → iterate. Optimize for that.

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
examples/    .forge.js model files (no imports, API injected at runtime)
gallery/     Gallery page (auto-reads from examples/ via import.meta.glob)
scripts/     CI checks, snapshot tests, hook installer
snapshots/   Visual regression test references
```

## Model files (.forge.js)

- Use `param()` for slider-driven parameters with min/max/unit
- Primitives: `box()`, `cylinder()`, `sphere()`, `roundedRect()`
- 2D → 3D: `Sketch.begin()`, `rect()`, `circle()` → `.extrude()` / `.revolve()` / `.sweep(path)`
- Standalone: `sweep(profile, path)`, `loft(profiles, heights)`
- Booleans: `.union()`, `.subtract()`, `.intersect()`
- Edge treatment: `.fillet(subdivisions)`, `.chamfer(subdivisions)`, `.smooth(subdivisions, minSharpAngle)`
- Shell: `.shell(thickness)` — hollow out a solid with uniform wall thickness
- Draft: `.draft(angleDeg)` — taper walls for mold release (positive = inward going up)
- Transforms: `.translate()`, `.rotate()`, `.scale()`, `.mirror()`
- Metadata: `.color("#hex")`, `.named("Part Name")`
- Query: `.volume()`, `.surfaceArea()`, `.boundingBox()`
- Multi-part: `assembly("name").add("part", solid, [x, y, z])`
- Camera hint: `return { model: solid, camera: [x, y, z] }`
- Must `return` a Solid, Assembly, array, or `{ model, camera }` object

## 3D Tools API Contract

### Extrude / Revolve / Sweep / Loft

| Tool | Input | Method | Contract |
|---|---|---|---|
| **Extrude** | 2D sketch | `sketch.extrude(height)` | Pushes profile along Z. Height > 0. Validates sketch, auto-corrects CW→CCW winding. |
| **Revolve** | 2D sketch | `sketch.revolve(segments?)` | Rotates profile around Y axis. Default 32 segments. Profile must be on positive X side. |
| **Sweep** | 2D sketch + 3D path | `sketch.sweep(path)` or `sweep(profile, path)` | Extrudes profile along 3D path. Path ≥ 2 points, profile ≥ 3 points. Profile oriented perpendicular to path tangent. |
| **Loft** | Multiple 2D profiles + heights | `loft(profiles, heights)` | Interpolates between ≥ 2 profiles at strictly ascending Z heights. Uses convex hull between consecutive profiles. |

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

**When writing .forge.js code:**
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

### Sketch extrude orientation
`Sketch.begin()` draws in XY. `.extrude(h)` pushes along Z. To get a profile running along Y (e.g., a roof along the building's depth), extrude along Z then `.rotate(90, 0, 0)` and `.translate()` into position.

### roundedRect is NOT a rounded cube
`roundedRect(w, d, r, h)` creates a 2D rounded rectangle extruded to height h. The corners are only rounded in XY — edges along Z are sharp. Don't use it expecting a fully-rounded 3D box.

### Boolean subtract sizing
Always oversize cutters by 1-2mm in the cutting direction to avoid coplanar face artifacts. Example: `cylinder(height + 2, radius)` for a through-hole.

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

```bash
# Render a model from all 7 angles
node /tmp/cadlad_sniff/render.mjs examples/mymodel.forge.js /tmp

# Snapshot test all examples
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
- Gallery auto-reads all .forge.js files from examples/ — add a file and it appears
- Models can return `{ model, camera: [x,y,z] }` to control their gallery viewing angle

## Git workflow

- Branch protection on main — all changes go through PRs
- `scripts/ci-check-bg.sh` runs lint/typecheck/test in background after commits
- `scripts/install-hooks.sh` sets up local git hooks
- Local `core.hooksPath` set to `.git/hooks` (overrides global hooks)

## Skills

- [.claude/skills/SKILLS.md](.claude/skills/SKILLS.md) — Master architect reference for CAD fabrication and building design
- [.claude/skills/sniff_screenshot.md](.claude/skills/sniff_screenshot.md) — Headless screenshot environment guide
