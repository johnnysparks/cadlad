# forge.ts strict scene layer (phase 1)

This introduces a strict `defineScene(...)` envelope that is machine-operable while preserving CadLad's existing code-first style.

## What is strict now

A scene can declare:
- `meta` (identity + intent)
- `params` (typed defaults and machine-readable ranges)
- `features` (stable IDs + semantic kinds + deterministic `refs`)
- `validators` (author assertions at semantic and/or geometry stages)
- `tests` (lightweight in-source checks run after model output exists)

The runtime normalizes this structure before geometry build and emits deterministic diagnostics for scene envelope errors and failed hooks. It also records a structured `sceneValidation` report that includes diagnostics, per-validator/per-test pass-fail status, and summary counts for downstream MCP/agent/UI surfaces.

## Validation stack (high-speed first)

`defineScene(...)` now runs a deterministic stack in this order:

1. **Type-level checks (pre-render)**
   - malformed scene envelope
   - missing feature IDs
   - duplicate feature IDs
2. **Semantic checks (pre-render)**
   - invalid feature references (`feature.refs` target unknown IDs)
   - scene semantic validators (`validators` with `stage: "semantic"`)
3. **Geometry checks (post-model, pre-render surface use)**
   - empty scene output / empty mesh buffers
   - disconnected multi-body output warning
   - scene geometry validators (`validators` with `stage: "geometry"`)
4. **In-source tests (post-model)**
   - tests declared in `tests` with stable IDs

All checks are deterministic, avoid fuzzy heuristics, and are intentionally cheap.

## Authoring pattern

```ts
return defineScene({
  features: [
    { id: "base", kind: "primitive.box" },
    { id: "hole", kind: "primitive.cylinder" },
    { id: "result", kind: "boolean.subtract", refs: ["base", "hole"] },
  ],
  validators: [
    { id: "hole.fits", stage: "semantic", run: ({ params }) => ... },
    { id: "result.one-body", stage: "geometry", run: ({ bodies }) => ... },
  ],
  tests: [
    { id: "mesh.non-empty", run: ({ bodies }) => ... },
    { id: "height.positive", run: ({ params }) => ... },
  ],
  model: ({ params }) => ...
});
```

## Escape hatch retained

`model` can still be regular expressive modeling code:
- direct `Solid` / `Assembly` return values still work exactly as before
- `defineScene({ model: ... })` supports either a direct model value or a model factory function

This preserves code-first authoring and gives LLMs one ergonomic object literal target when they need strict scene output.

## Param typing and units

`mm(...)` is a branded unit helper (`Millimeters`) for type-safe authoring in `.forge.ts`.
At runtime it remains a number, so no geometry APIs had to change.

## Migration scaffolding

The implementation is additive:
- no breaking change to existing runtime return contracts
- `.forge.js` models that do not use `defineScene` continue to evaluate through the existing path
- scene params are surfaced as collected runtime params, enabling future UI wiring without changing model code

## Path to machine-operable scenes

This layer gives us stable handles for automation:
- `meta.id` and feature IDs for deterministic edit targets
- structured params for reliable agent-side mutation and validation
- validators/tests as local quality gates before rendering/export

Future phases can attach richer feature schemas and AST-assisted rewrite tools to these IDs without replacing the current modeling style.
