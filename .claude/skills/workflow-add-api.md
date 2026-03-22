# Workflow: Add or Extend an API Primitive

You're adding a new method to Solid, a new primitive function, or extending the Sketch API.

## Pre-flight

```bash
npm run test       # green baseline before you start
npm run typecheck  # clean types
```

## Where things live

```
src/engine/
  solid.ts         # Solid class — all instance methods (.translate, .subtract, .smooth, etc.)
  primitives.ts    # Primitive factory functions (box, cylinder, sphere, etc.)
  manifold.ts      # Low-level Manifold WASM wrapper
  types.ts         # Body, Mesh, param types

src/api/
  runtime.ts       # evaluateModel() — executes .forge.js code, injects API into scope
  sketch.ts        # Sketch class (2D profiles → extrude/revolve)
  assembly.ts      # Assembly class (multi-part models)
  params.ts        # param() function
  hints.ts         # Modeling hints/warnings
```

## Adding a method to Solid

1. **Add the method in `src/engine/solid.ts`**.
   - Use `_derive()` to return a new Solid that preserves `_color` and `_name`.
   - All methods are immutable — return a new Solid, never mutate `this`.

2. **No explicit export needed** — Solid instances are already in scope in .forge.js via the primitives.

3. **If it's a new standalone function** (not a Solid method), add it to `src/engine/primitives.ts` and expose it in `src/api/runtime.ts` in the `sandbox` object passed to `evaluateModel`.

## Adding a Sketch method

1. Add the method in `src/api/sketch.ts`.
2. It's already available — Sketch is exposed in the runtime sandbox.

## Exposing to .forge.js runtime

Check `src/api/runtime.ts` — the `sandbox` object defines everything available in model code:

```js
const sandbox = {
  box, cylinder, sphere, roundedRect,  // primitives
  Sketch, circle, rect,                // 2D
  assembly,                            // multi-part
  param,                               // parameters
  extrudePolygon,                      // low-level
  // ... your new function goes here
};
```

## Testing

```bash
npm run test       # vitest — add a test in src/__tests__/ or co-located
npm run typecheck  # ensure no type errors
```

Write a test that exercises the new API. Then validate it works in practice by using it in an example model.

## Validation

After the API change works in tests, create or modify an example model that uses the new feature. Load it in the studio and visually confirm it renders correctly.

See: `workflow-evaluate-model.md`

## Done criteria

- [ ] Method/function implemented with immutable pattern
- [ ] `_derive()` used for Solid methods (preserves color/name)
- [ ] Exposed in runtime sandbox (if new standalone function)
- [ ] Tests pass: `npm run test`
- [ ] Types pass: `npm run typecheck`
- [ ] Used in at least one example model
- [ ] Visually verified in studio
