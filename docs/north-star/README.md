# CadLad North Star (Composable Purpose Files)

This folder turns `docs/cadlad_north_star_technical_vision.docx` into smaller, narrowly scoped purpose files that can be implemented and reviewed incrementally.

## Why this split

The `.docx` defines a strong end state, but most implementation work is easier when each stream has:

- a single purpose,
- a bounded interface,
- explicit non-goals,
- a measurable "done" signal.

Composition is the default: each purpose file should stand alone, but also compose cleanly with the others.

## Purpose files

1. [P1 — Typed Scene Contract](./p1-typed-scene-contract.md)
2. [P2 — Feature Registry + AST Operations](./p2-feature-registry-and-ast-ops.md)
3. [P3 — Layered Validation Stack](./p3-layered-validation-stack.md)
4. [P4 — Agent Hardening Workflow](./p4-agent-hardening-workflow.md)
5. [P5 — Incremental Migration Track](./p5-incremental-migration-track.md)

## Working agreement

When proposing a change toward the north star:

1. Link it to **one primary purpose file**.
2. Name any cross-purpose dependencies explicitly.
3. Keep PR scope constrained to one milestone whenever possible.
4. Add tests/diagnostics at the same layer where the change is introduced.
