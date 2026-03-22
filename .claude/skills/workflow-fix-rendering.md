# Workflow: Fix a Rendering or Visual Bug

Something looks wrong in the viewport or gallery. Diagnose and fix it.

## Pre-flight

```bash
npm run dev  # localhost:5173 — studio + gallery
```

Reproduce the bug visually first. Check both studio and gallery — they share rendering code but have separate integration points.

## Where rendering lives

```
src/rendering/
  scene-builder.ts    # THE shared rendering module. Lighting, grid, body→mesh,
                      # edge strokes, auto-color, Z-up→Y-up transform.
                      # buildBodyGroup(), createLighting(), createGrid()

src/studio/
  viewport.ts         # Studio 3D viewport — OrbitControls, camera, resize
  main.ts             # Studio boot — wires editor + viewport + params

gallery/
  main.ts             # Gallery — disposable renderers, card layout, interactive viewer
```

## The coordinate transform

Z-up (Manifold/model code) → Y-up (Three.js) happens in ONE place:

`buildBodyGroup(bodies, { zUpToYUp: true })` in `scene-builder.ts`

This applies a -90-degree X rotation to the mesh group. It's used by:
- Studio viewport (`viewport.ts`)
- Gallery static render (`gallery/main.ts`)
- Gallery interactive viewer (`gallery/main.ts`)

If something is oriented wrong, check whether `zUpToYUp: true` is being passed.

## Common bug patterns

### Colors lost after boolean
`.color()` after `.union()` overwrites all part colors. Fix: use `assembly()` or apply `.color()` before `.union()`.

The color/name preservation chain: `_derive()` in `solid.ts` carries `_color` and `_name` through transforms and booleans. If a new Solid method doesn't use `_derive()`, color will be lost.

### Z-fighting / flickering faces
Coplanar geometry from boolean operations. Fix: oversize cutters by +2mm.

### Edge strokes wrong
`EdgesGeometry` at 30-degree threshold in `scene-builder.ts`. Edge color adapts: 50% darker for light surfaces, 50% lighter for dark. If edges disappear or look wrong, check the threshold angle and color computation.

### Model blank or inverted
- Blank: WebGL context issue, or geometry has zero volume
- Inverted: winding order wrong (CW instead of CCW). `extrudePolygon()` and `revolve()` auto-fix this, but direct `CrossSection` use doesn't.

### Gallery-specific
- WebGL context limit: browsers cap at ~8-16 contexts. Gallery uses disposable renderers (render → dataURL → dispose). If cards go blank, check the dispose chain.
- High-contrast mode: separate style path in `renderToImage()` and `buildBodyGroup()`.

## Debugging approach

1. **Isolate**: Does it happen in studio only, gallery only, or both?
   - Both → `scene-builder.ts`
   - Studio only → `viewport.ts`
   - Gallery only → `gallery/main.ts`

2. **Simplify**: Replace the model with `box(10, 10, 10)`. If the bug persists, it's rendering. If it goes away, it's model geometry.

3. **Check the console**: Winding warnings, WebGL errors, and hint messages all log there.

4. **Screenshot from multiple angles**: Use `window.__cadlad.setView()` to check all 7 views.

## Testing

```bash
npm run test       # unit tests
npm run typecheck  # types
```

Then visually verify the fix in both studio and gallery. See: `workflow-evaluate-model.md`

## Done criteria

- [ ] Bug reproduced and root cause identified
- [ ] Fix applied in the correct layer (scene-builder vs viewport vs gallery)
- [ ] No regressions in other models (check gallery)
- [ ] Tests and typecheck pass
- [ ] Visually verified from multiple angles
