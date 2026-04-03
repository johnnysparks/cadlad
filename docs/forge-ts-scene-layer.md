# forge.ts strict scene layer (phase 1)

This introduces a strict `defineScene(...)` envelope that is machine-operable while preserving CadLad's existing code-first style.

## What is strict now

A scene can declare:
- `meta` (identity + intent)
- `params` (typed defaults and machine-readable ranges)
- `features` (stable IDs + semantic kinds)
- `validators` (author assertions)
- `tests` (lightweight scene checks)

The runtime normalizes this structure before geometry build and emits deterministic diagnostics for scene envelope errors and failed hooks.

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
