# CadLad

Code-first parametric CAD for TypeScript — in the browser and CLI.

TypeScript is the file format. The browser is the CAD system.

## What is this?

CadLad is a parametric 3D modeling environment where you write TypeScript
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

Press **Ctrl+Enter** to run the model. Drag parameter sliders to update geometry
in real time. Click **STL** to export.

## Modeling API

Models are plain TypeScript functions that call the CadLad API and `return` a Solid:

```ts
// box-with-hole.forge.ts
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

## Examples

The `projects/` directory contains ready-to-run models:

| File | Description |
|---|---|
| `box-with-hole.forge.ts` | Hello world — box with a through-hole |
| `parametric-bracket.forge.ts` | L-bracket with mounting holes |
| `phone-stand.forge.ts` | Three-part phone stand |
| `assembly-demo.forge.ts` | Multi-part assembly with positioning |

Paste any example into the studio editor or run via CLI.

## CLI

```bash
# Validate a model (.forge.ts)
cadlad run projects/box-with-hole.forge.ts

# Local-only validation loop (reruns on save)
cadlad validate projects/box-with-hole.forge.ts --watch

# Validate and emit machine-readable stats JSON (good for automation/agents)
cadlad run projects/box-with-hole.forge.ts --json

# Export to STL
cadlad export projects/box-with-hole.forge.ts -o output.stl
```

## Architecture

```
src/
  engine/          Manifold WASM backend, Solid class, primitives
  api/             Public modeling API (param, sketch, assembly, runtime)
  studio/          Browser IDE (Monaco + Three.js + param panel)
  cli/             Node.js CLI tool
projects/          Example .forge.ts models
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

## Development

```bash
npm install          # install dependencies
npm run dev          # start dev server (http://localhost:5173)
npm run build        # production build
npm run typecheck    # type-check without emitting
npm test             # run tests with Vitest
npm run lint         # lint with ESLint
```

## Live Sessions

Share a model with an AI assistant or collaborator in real time using OAuth-backed
session APIs and typed source revisions.

```bash
npm run worker:dev   # live-session backend at http://localhost:8787
```

See `docs/live-session-deploy.md` for deployment details.

### North Star Planning Docs

The long-form north star vision lives in `docs/cadlad_north_star_technical_vision.docx`.
For implementation planning, use the composable purpose files in `docs/north-star/README.md`.

### Writing a Model

Create a `.forge.ts` file that calls the CadLad API and returns a `Solid` or `Assembly`:

```ts
// my-part.forge.ts
const r = param("Radius", 10, { min: 5, max: 50, unit: "mm" });

const body = sphere(r).color("#89b4fa");
const cutout = cylinder(r * 2, r * 0.6);
const part = body.subtract(cutout);

return part;
```

The runtime injects all API functions (`param`, `box`, `cylinder`, `sphere`,
`roundedRect`, `Sketch`, `rect`, `circle`, `assembly`, etc.) — no imports needed.

### File Conventions

- `.forge.ts` — 3D model definitions
- Models must `return` a `Solid`, `Assembly`, or array of `Solid`s

## License

MIT

## MCP OAuth + Screenshot Architecture (2026 refactor)

### Auth architecture

- CadLad MCP/resource endpoints now use OAuth 2.1-style bearer tokens instead of per-session write tokens in tool arguments.
- The Worker exposes:
  - `/.well-known/oauth-protected-resource`
  - `/.well-known/oauth-authorization-server`
  - `/oauth/authorize` (auth code + PKCE)
  - `/oauth/token`
  - `/oauth/register` (public client registration)
- The authenticated OAuth subject (`sub`) is resolved server-side and mapped to owned sessions.
- MCP tools no longer accept raw credentials in `inputSchema`.

### ChatGPT linking/auth

1. ChatGPT discovers protected resource metadata at `/.well-known/oauth-protected-resource`.
2. ChatGPT follows authorization server metadata for OAuth endpoints.
3. ChatGPT completes OAuth auth-code + PKCE and calls `/mcp` with `Authorization: Bearer <access_token>`.
4. MCP tool calls use only safe identifiers (or no args); identity/session lookup is server-side.

### Environment variables

- `STUDIO_ORIGIN` — CORS + live URL origin.
- `OAUTH_SIGNING_SECRET` — HMAC signing key for auth codes/access tokens.
- `DEFAULT_USER_SUB` — default subject for local/dev authorize flow.
- `VITE_LIVE_SESSION_API_BASE` — Studio API base override.

### Local dev flow

- Start Worker: `npm run worker:dev`
- Start Studio: `npm run dev`
- Obtain OAuth token through `/oauth/authorize` + `/oauth/token` (PKCE), then pass token to Studio as `?access_token=...` or store in localStorage key `cadlad_access_token`.

### Screenshot generation/retrieval

- Studio posts run results to `/api/live/session/:id/run-result`.
- Server stores stable render artifacts (`artifactRef`) separately from model state.
- MCP `get_session_state` includes latest render status plus `artifactRef` when available, so assistants can see screenshot linkage before requesting image bytes.
- MCP `get_latest_screenshot` returns minimal structured state (`status`, `artifactRef`, `hasImage`) and puts widget-heavy image payload in `_meta`.
- `request_render_refresh` explicitly requests a fresh render cycle when needed.
