# CadLad

Code-first parametric CAD for TypeScript — in the browser and CLI.

TypeScript is the file format. The browser is the CAD system.

## What is this?

CadLad is a parametric 3D modeling environment where you write TypeScript/JavaScript
to define geometry. It runs in the browser with a Monaco editor, live parameter sliders,
and a Three.js 3D viewport. Models can also run headless via the CLI for validation
and STL export.

The geometry engine uses [Manifold](https://github.com/elalish/manifold) (WASM) for
fast, exact boolean operations and mesh generation.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 — you'll see the studio with a default model loaded.

## Modeling API

Models are plain JavaScript functions that call the CadLad API and `return` a Solid:

```js
// box-with-hole.forge.js
const width  = param("Width", 60, { min: 20, max: 200, unit: "mm" });
const height = param("Height", 20, { min: 5, max: 100, unit: "mm" });
const holeR  = param("Hole Radius", 8, { min: 2, max: 30, unit: "mm" });

const base = box(width, width, height).color("#5f87c6");
const hole = cylinder(height + 2, holeR);

return base.subtract(hole);
```

### Primitives

| Function | Description |
|---|---|
| `box(x, y, z)` | Axis-aligned box centred at origin |
| `cylinder(h, r)` | Cylinder along Z |
| `sphere(r)` | Sphere at origin |
| `roundedRect(w, d, r, h)` | Rounded rectangle extrusion |

### Solid Operations

```js
a.union(b)       // Boolean add
a.subtract(b)    // Boolean cut
a.intersect(b)   // Boolean intersect
a.translate(x, y, z)
a.rotate(rx, ry, rz)
a.scale(s)
a.mirror([nx, ny, nz])
a.color("#hex")
a.named("Part Name")
```

### 2D Sketch

```js
const profile = Sketch.begin(0, 0)
  .lineTo(10, 0)
  .lineTo(10, 5)
  .lineTo(0, 5)
  .close();

const solid = profile.extrude(20);
```

### Parameters

```js
const w = param("Width", 100, { min: 10, max: 500, step: 5, unit: "mm" });
```

Parameters automatically generate sliders in the browser UI. When a slider
changes, the model re-evaluates with the new value.

### Assemblies

```js
const asm = assembly("My Assembly")
  .add("base", basePart, [0, 0, 0])
  .add("arm", armPart, [50, 0, 20]);

return asm.toSolid();
```

## CLI

```bash
# Validate a model
cadlad run examples/box-with-hole.forge.js

# Export to STL
cadlad export examples/box-with-hole.forge.js -o output.stl
```

## Architecture

```
src/
  engine/          Manifold WASM backend, Solid class, primitives
  api/             Public modeling API (param, sketch, assembly, runtime)
  studio/          Browser IDE (Monaco + Three.js + param panel)
  cli/             Node.js CLI tool
examples/          Example .forge.js models
```

### Design Principles

- **TypeScript is the file format** — no custom DSL, no XML, no JSON configs
- **The browser is the CAD system** — Monaco editor + Three.js viewport + live params
- **Manifold for geometry** — fast WASM booleans, exact mesh output
- **Backend-aware** — the modeling API is not tied to one geometry kernel
- **Code over clicks** — parametric models are version-controlled, diffable, composable

## Tech Stack

- **TypeScript** — modeling language & implementation
- **Manifold** (WASM) — geometry kernel for booleans & mesh
- **Three.js** — 3D viewport rendering
- **Monaco** — code editor with IntelliSense
- **Vite** — dev server & bundler
- **Vitest** — testing

## License

MIT
