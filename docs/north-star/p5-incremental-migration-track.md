# P5 — Incremental Migration Track

## Purpose

Define a narrow, staged rollout path from current `forge` workflows to the north-star typed semantic architecture.

## In scope

- Sequenced milestones that minimize breakage and context switching.
- Explicit "adopt for new work first" policy.
- Compatibility posture for existing models during transition.

## Out of scope

- Big-bang rewrites.
- Blocking all feature work until architecture migration is complete.

## Interfaces this enables

- Predictable planning across product and infrastructure work.
- Smaller PRs with clear objective and rollback surface.
- Continuous value delivery while architecture hardens.

## Proposed track

1. **Scene envelope first**: add minimal typed scene declarations and normalization outputs.
2. **Registry pilot**: onboard a few mid-level features with schema + AST edit support.
3. **Validation layering**: stage-based diagnostics shared by studio/CLI.
4. **Agent hardening loop**: formalize wrapper + validator + inline test path.
5. **MCP parity expansion**: generate/compose operations from registry contracts.

## Done signal

Each stage independently ships user-visible reliability improvements, and no stage requires abandoning existing model authoring.
