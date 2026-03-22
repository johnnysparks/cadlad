# CadLad

Code-first parametric 3D CAD in TypeScript. Browser studio (Monaco + Three.js) and CLI. Geometry kernel: Manifold (WASM).

## Commands

```bash
npm run dev          # Vite dev server at localhost:5173
npm run build        # Production build
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run lint         # eslint src/
npm run build:cli    # Build CLI (tsconfig.cli.json)
```

## Architecture

```
src/
  engine/    Manifold WASM backend, Solid class, primitives, types
  api/       Public modeling API: runtime, params, sketch, assembly
  studio/    Browser IDE: Monaco editor, Three.js viewport, param panel
  cli/       Node CLI: run, export, studio launcher
examples/    .forge.js model files (no imports, API injected at runtime)
scripts/     CI checks, snapshot tests, hook installer
snapshots/   Visual regression test references
```

## Model files (.forge.js)

- Use `param()` for slider-driven parameters
- Primitives: `box()`, `cylinder()`, `sphere()`, `roundedRect()`
- 2D: `Sketch.begin()`, `rect()`, `circle()` → `.extrude()` / `.revolve()`
- Booleans: `.union()`, `.subtract()`, `.intersect()`
- Transforms: `.translate()`, `.rotate()`, `.scale()`, `.mirror()`
- Metadata: `.color()`, `.named()`
- Multi-part: `assembly("name").add("part", solid, [x, y, z])`
- Must `return` a Solid, Assembly, or array

## Key details

- Manifold WASM requires `wasm.setup()` after init to wire up static methods (cube, cylinder, sphere, etc.)
- `volume()` and `surfaceArea()` are direct methods on Manifold instances (not via `getProperties()`)
- Three.js WebGL needs `--no-sandbox` in headless Chrome but NOT `--disable-gpu` (kills WebGL)
- Studio exposes `window.__cadlad` for test automation (setCode, run, error checking)
- Snapshot tests: `node scripts/snapshot-test.mjs` — puppeteer is NOT a project dep, found from environment

## Skills

Domain knowledge for AI-assisted CAD work:

- [.claude/skills/SKILLS.md](.claude/skills/SKILLS.md) — Master architect reference: geometry, materials, structural engineering, manufacturing, tolerances, joinery, building codes, DFA, cost estimation, ergonomics, and the full design process
- [.claude/skills/sniff_screenshot.md](.claude/skills/sniff_screenshot.md) — Headless screenshot guide: environment capabilities, Puppeteer workflows, multi-angle capture, cross-platform Chrome finder, CI/Docker setup
