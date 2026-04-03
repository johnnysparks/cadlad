# P2 — Feature Registry + AST Operations

## Purpose

Create a composable feature registry that binds together feature types, schemas, builders, validators, and deterministic source edits.

## In scope

- Registry-backed feature definitions (`kind`, schema, build, validate).
- AST insert/update operations for registered features.
- Deterministic source printing and stable edit results.

## Out of scope

- Auto-generating every possible MCP tool in one pass.
- Free-form natural-language code patching as primary mechanism.

## Interfaces this enables

- One feature contract reused by TypeScript, runtime, validators, and MCP.
- Deterministic machine edits without whole-file replacement.
- Composable mid-level features built from primitives.

## First milestone

- Implement registry support for a small set of mid-level features.
- Add AST-based `insertFeature` and `updateFeature` operations.
- Validate schema mismatches before source mutation.

## Progress update (2026-04-03)

- ✅ Added a registry pilot with two mid-level feature kinds: `wall.straight` and `roof.gable`.
- ✅ Added `insertFeature()` and `updateFeature()` operations that mutate `defineScene({ features: [...] })` via TypeScript AST node ranges.
- ✅ Enforced schema validation before source edits and covered the flow with unit tests.
- 🔜 Next step: wire these operations into scene normalization + tooling entry points so MCP calls can consume the same contract directly.

## Done signal

An operation like "update roof pitch" resolves to a schema-checked feature update with deterministic source output and no manual text surgery.
