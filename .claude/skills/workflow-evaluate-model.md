# Workflow: Evaluate Model Quality

You're checking whether a model looks correct. This pairs with build-model and is also used for regression testing.

## Why multi-angle matters

A model can look perfect from ISO view and be completely hollow from the back. Always check multiple angles.

## Option A: Studio (interactive, fast iteration)

```bash
# Ensure dev server is running
npm run dev  # localhost:5173
```

Open the studio in a browser. The studio exposes `window.__cadlad` for automation:

```js
window.__cadlad.setCode(code)    // inject model code
window.__cadlad.run()            // evaluate
window.__cadlad.setView("front") // position camera
window.__cadlad.hasError()       // boolean
window.__cadlad.getErrors()      // error text
```

Views: `"front"`, `"back"`, `"top"`, `"bottom"`, `"left"`, `"right"`, `"iso"`

## Option B: Headless screenshots (CI, batch, automated)

**Read `.claude/skills/sniff_screenshot.md` first** — it has the full environment setup.

Quick path if Puppeteer is already installed:

```bash
# Render one model from 7 angles
node /tmp/cadlad_sniff/render.mjs examples/mymodel.forge.js /tmp/screenshots

# Snapshot-test all examples against references
node scripts/snapshot-test.mjs --url http://localhost:5173

# Update reference snapshots
node scripts/snapshot-test.mjs --url http://localhost:5173 --update
```

## Option C: Gallery (visual scan of all models)

```bash
npm run dev  # gallery is at localhost:5173/gallery/
```

Open `/gallery/` in a browser. All `.forge.js` files from `examples/` render automatically. Toggle "High Contrast" mode for better geometry evaluation (light gray surfaces, dark edges, white background).

## What to look for

### Geometry
- Is it recognizable as the intended object?
- No missing faces, holes where there shouldn't be, or inside-out surfaces
- Proportions match expectations (not too flat, too tall, too thin)
- Features visible from all angles (not just the "hero" angle)

### Parameters
- Slide every parameter to min and max — does geometry stay valid?
- No self-intersections or zero-thickness walls at extremes
- No NaN or degenerate geometry

### Color & Assembly
- Are individual part colors visible? (if using `.color()` after `.union()`, they won't be)
- Assembly parts distinguishable (auto-color assigns muted hues to uncolored parts)

### Rendering
- Edge strokes visible (30-degree threshold)
- No z-fighting (flickering faces from coplanar geometry)
- Grid visible as ground reference

## Snapshot references

Reference snapshots live in `snapshots/reference/`. Current test captures go to `snapshots/current/`.

```bash
# Compare current renders against references
node scripts/snapshot-test.mjs --url http://localhost:5173

# Accept current as new reference
node scripts/snapshot-test.mjs --url http://localhost:5173 --update
```

## Done criteria

- [ ] Model viewed from at least front, side, top, and ISO angles
- [ ] No geometry errors or visual artifacts
- [ ] Parameters tested at min/max extremes
- [ ] Screenshots captured if this is for a PR or regression check
