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

## Done signal

An operation like "update roof pitch" resolves to a schema-checked feature update with deterministic source output and no manual text surgery.
