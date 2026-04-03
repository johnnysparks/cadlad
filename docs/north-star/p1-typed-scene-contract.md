# P1 — Typed Scene Contract

## Purpose

Define a strict, typed semantic scene model derived from `forge.ts` so every downstream system uses the same normalized structure.

## In scope

- Typed scene declarations (`params`, `features`, `validators`, `tests`) in source.
- Stable semantic IDs and references.
- Deterministic normalization pipeline: source -> AST -> semantic scene.

## Out of scope

- Full feature catalog coverage.
- Complex MCP write tooling.
- Rich UI workflows beyond showing diagnostics from scene semantics.

## Interfaces this enables

- Scene-aware diagnostics (pointing to semantic node + source range).
- Stable targets for validators, stats, and render labels.
- Deterministic diffing at semantic-node granularity.

## First milestone

- Add an internal `defineScene()` contract for a minimal typed scene envelope.
- Ensure scene normalization emits stable feature IDs and source ranges.
- Surface normalization errors before geometry build.

## Done signal

At least one model path can be parsed into a typed semantic scene where diagnostics refer to stable IDs instead of free-form runtime text.
