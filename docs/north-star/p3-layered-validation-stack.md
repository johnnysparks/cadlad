# P3 — Layered Validation Stack

## Purpose

Enforce a fast-to-slow validation pyramid where each layer consumes the same semantic scene and fails as early as possible.

## In scope

- Validation ordering: types/schema -> semantic validation -> geometry validation -> stats/relations -> render/snapshots/tests.
- Layer-specific diagnostics and latency expectations.
- Reusable validation entry points for CLI, studio, and automation.

## Out of scope

- Expanding snapshot breadth before fast layers are stable.
- Hiding validation semantics behind ad-hoc runtime logs.

## Interfaces this enables

- Quick rejection of malformed edits.
- Consistent diagnostics across authoring surfaces.
- Predictable cost profile for local and CI checks.

## First milestone

- Introduce explicit validation pipeline stages in one shared module.
- Tag diagnostics with `stage` and semantic feature IDs.
- Add targeted checks that can run without full render.

## Done signal

A broken change can be located by stage and semantic node, with most failures caught before render/snapshot work begins.
