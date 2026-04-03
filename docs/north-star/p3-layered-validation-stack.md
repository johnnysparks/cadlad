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

## Progress update (2026-04-03)

- ✅ Added a shared validation pipeline module (`src/validation/layered-validation.ts`) with explicit stage ordering:
  1. `types/schema`
  2. `semantic`
  3. `geometry`
  4. `stats/relations`
  5. `render/snapshots/tests` (reserved marker stage)
- ✅ Runtime now returns stage-tagged diagnostics (`ModelResult.diagnostics`) and derives `errors` from diagnostics so existing callers remain compatible.
- ✅ CLI now prints stage-aware error text and includes diagnostics in `--json` responses.
- ✅ Studio now surfaces stage-aware diagnostics in the error bar and forwards warning diagnostics to live session telemetry.
- ✅ Added focused tests for stage halting behavior, feature ID tagging, and diagnostic formatting.

### Next slice

- Wire source/transpile diagnostics into `types/schema` for CLI/studio in the same data model.
- Add an explicit validation report object that includes stage latency timings.
- Add configurable fail policies (e.g., warn-only vs fail on `stats/relations` overlap checks) per surface (CLI/studio/automation).

## Done signal

A broken change can be located by stage and semantic node, with most failures caught before render/snapshot work begins.
