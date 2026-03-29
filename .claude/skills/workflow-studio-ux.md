# Workflow: Studio or Gallery UX Improvement

You're modifying the browser IDE or the gallery page.

## Pre-flight

```bash
npm run dev  # localhost:5173 (studio) and localhost:5173/gallery/ (gallery)
```

## Studio architecture

```
index.html              # Studio HTML shell (editor pane, viewport, param panel, buttons)

src/studio/
  main.ts               # Boot sequence: creates editor, viewport, param panel
                        # Handles ?code= URL param (base64-encoded model from gallery links)
                        # Exposes window.__cadlad for automation
                        # Ctrl+Enter to run, Export STL button
  editor.ts             # Monaco editor setup, DEFAULT_CODE (trophy cup), syntax config
  viewport.ts           # Three.js viewport, OrbitControls, camera presets (front/back/etc)
  param-panel.ts        # Slider UI for param() values, re-runs model on change
```

## Gallery architecture

```
gallery/
  index.html            # Gallery HTML shell
  main.ts               # Reads all projects/*.forge.js via Vite glob import
                        # Renders each to static image (disposable WebGL renderer)
                        # Click for interactive 3D orbit viewer
                        # "Open in Studio" links (base64 ?code= param)
                        # High-contrast toggle
```

## Shared rendering

Both studio and gallery use `src/rendering/scene-builder.ts` for:
- `buildBodyGroup()` — mesh construction, edge strokes, auto-color
- `createLighting()` — 3-point lighting setup
- `createGrid()` — ground grid

Changes here affect both surfaces.

## Key integration points

### URL code loading (gallery → studio)
Gallery generates: `../?code=${encodeURIComponent(btoa(unescape(encodeURIComponent(code))))}`
Studio reads: `URLSearchParams.get("code")` → `atob` → `editor.setValue()`
After loading, URL is cleaned via `history.replaceState`.

### Model evaluation
Both use `evaluateModel(code, paramValues?)` from `src/api/runtime.ts`.
Returns: `{ bodies, params, errors, hints, camera }`.

### Automation API (`window.__cadlad`)
Set in `studio/main.ts`. Used by Puppeteer snapshot tests.
`setCode()`, `run()`, `setView()`, `hasError()`, `getErrors()`

## Build system

Vite with multi-page config in `vite.config.ts`. Studio is the root entry, gallery is a secondary entry at `gallery/index.html`.

## Testing

```bash
npm run typecheck  # types
npm run build      # verify production build works (catches import issues)
npm run dev        # manual testing in browser
```

No unit tests for UI — verify manually in the browser. Check both studio and gallery.

## Done criteria

- [ ] Feature works in dev mode (`npm run dev`)
- [ ] Production build succeeds (`npm run build`)
- [ ] Typecheck passes
- [ ] Tested in browser (both studio and gallery if change touches shared code)
- [ ] No console errors
