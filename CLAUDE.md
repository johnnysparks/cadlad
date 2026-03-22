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
- 2D profiles: `Sketch.begin()`, `rect()`, `circle()` → `.extrude()` / `.revolve()`
- Booleans: `.union()`, `.subtract()`, `.intersect()`
- Transforms: `.translate()`, `.rotate()`, `.scale()`, `.mirror()`
- Metadata: `.color("#hex")`, `.named("Part Name")`
- Multi-part: `assembly("name").add("part", solid, [x, y, z])`
- Camera hint: `return { model: solid, camera: [x, y, z] }`
- Must `return` a Solid, Assembly, array, or `{ model, camera }` object

## Critical: coordinate system

- **Manifold uses Z-up.** Build models with Z as the vertical axis. Ground plane is Z=0.
- **Three.js uses Y-up.** The gallery renderer rotates geometry -90° on X to compensate.
- **Build from Z=0 upward.** `.translate(0, 0, height/2)` to sit a box on the ground.
- The studio viewport does NOT rotate — it uses Manifold's Z-up directly with the camera angled to compensate.

## Hard-won lessons (baked into the API)

These are the things that burned us during development. They're fixed at the API level now, but understanding them helps avoid related problems:

### Polygon winding (FIXED in API)
Manifold silently produces empty geometry from clockwise polygons. `extrudePolygon()` and `revolve()` now auto-detect CW winding and reverse to CCW, with a console warning. If you use `CrossSection` directly, you must ensure CCW yourself.

### .color() after .union() overwrites everything
`.union()` merges meshes. A `.color()` call after applies to the whole merged result, losing individual part colors. **Use `assembly()` instead of `.union()` when you need different colors on different parts.** The viewport auto-assigns distinct muted colors to assembly parts that don't have explicit colors.

### Sketch extrude orientation
`Sketch.begin()` draws in XY. `.extrude(h)` pushes along Z. To get a profile running along Y (e.g., a roof along the building's depth), extrude along Z then `.rotate(90, 0, 0)` and `.translate()` into position.

### roundedRect is NOT a rounded cube
`roundedRect(w, d, r, h)` creates a 2D rounded rectangle extruded to height h. The corners are only rounded in XY — edges along Z are sharp. Don't use it expecting a fully-rounded 3D box.

### Boolean subtract sizing
Always oversize cutters by 1-2mm in the cutting direction to avoid coplanar face artifacts. Example: `cylinder(height + 2, radius)` for a through-hole.

### WebGL context limit
Browsers limit to ~8-16 simultaneous WebGL contexts. The gallery uses disposable renderers (render → capture to dataURL → dispose) to handle 20+ models.

## Screenshot workflow

Goal: help the next agent get multi-angle visual feedback fast, with minimal installs.

### Wake-up strategy (fastest path first)

1. Start studio once:
   ```bash
   npm run dev -- --host 127.0.0.1 --port 5173
   ```
2. Try snapshot runner with the current environment first (zero install):
   ```bash
   node scripts/snapshot-test.mjs --examples-dir /tmp/cadlad-one-example --wait 5000
   ```
3. If Puppeteer module is missing, do a throwaway install in `/tmp` (do not touch project deps):
   ```bash
   mkdir -p /tmp/pp && cd /tmp/pp && npm init -y && npm i puppeteer
   mkdir -p /tmp/cadlad_sniff
   ln -sfn /tmp/pp/node_modules /tmp/cadlad_sniff/node_modules
   ```
4. Retry snapshot runner.
5. If browser launch fails on missing shared libs (e.g. `libatk-1.0.so.0`), stop and report exact missing libs. Don't spend cycles on broad installs.
6. Always capture/check multiple camera angles before finalizing geometry changes.

Puppeteer is NOT a project dependency — `scripts/snapshot-test.mjs` searches project deps, `/tmp/cadlad_sniff`, global resolve, and npx cache.

```bash
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

- 3-point lighting: key + fill + rim + top fill for 3D readability
- Auto-color: bodies without `.color()` get unique muted hues (steel blue, tan, sage, red, lavender, olive, teal, mauve) instead of uniform gray
- Gallery auto-reads all .forge.js files from examples/ — add a file and it appears

## Git workflow

- Branch protection on main — all changes go through PRs
- `scripts/ci-check-bg.sh` runs lint/typecheck/test in background after commits
- `scripts/install-hooks.sh` sets up local git hooks
- Local `core.hooksPath` set to `.git/hooks` (overrides global hooks)

## Skills

- [.claude/skills/SKILLS.md](.claude/skills/SKILLS.md) — Master architect reference for CAD fabrication and building design
- [.claude/skills/sniff_screenshot.md](.claude/skills/sniff_screenshot.md) — Headless screenshot environment guide
