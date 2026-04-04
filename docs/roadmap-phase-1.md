# Phase 1 — Machine-Readable Feedback & Semantic MCP Surface

> **Status**: ~75% complete. Core evaluation pipeline and read-only MCP tools are done. Remaining work: CLI JSON output, feature-level edit tools, and upgrading domain analysis from heuristic to structural.
>
> **Depends on**: nothing (foundational phase)
> **Unlocks**: Phase 2 (agent memory), Phase 3 (agent learning), Phase 4 (constraints)

---

## Motivation

Agents are the primary users. The fastest path to better agent modeling is better feedback:

1. **Structured geometry stats** beat screenshots for iteration speed (200ms vs 5s).
2. **Semantic MCP tools** beat raw code generation for reliability.
3. **Domain analysis** beats prose rules in CLAUDE.md for catching manufacturing problems.

Everything in this phase makes the tight loop — `code -> evaluate -> read stats -> adjust` — fast and non-visual.

---

## 0.1 Structured GeometryStats in every evaluation

**Status: DONE**

Every `evaluateModel()` call computes and returns `GeometryStats`:
- Volume, surface area, bounding box, component count, per-body stats
- Derived checks: zero volume, degenerate bbox, disconnected components

**Key files:**
- `src/api/runtime.ts:199` — wires stats into `withLayeredValidation()`
- `src/validation/layered-validation.ts:37` — calls `computeModelStats()`
- `src/studio/model-stats.ts` — stat computation logic
- `src/engine/types.ts:187` — `ModelResult.geometryStats` field

**Tests:** `src/api/__tests__/runtime.test.ts:15-20`

### 0.1.1 CLI JSON output

**Status: NOT DONE**

`cadlad run --json` should return the full `ModelResult` (stats, diagnostics, evaluation bundle) as stable JSON to stdout. This is the primary interface for non-MCP agents and CI pipelines.

**Why it matters:** Any agent running locally via CLI currently gets human-readable text output only. JSON output makes the CLI a first-class agent interface without requiring a live session or MCP server.

**Implementation:**
- [ ] Add `--json` flag to `src/cli/index.ts` `run` command
- [ ] Serialize `ModelResult` to stable JSON schema via `src/cli/run-output.ts`
- [ ] Include: evaluation bundle, geometry stats, diagnostics, param values
- [ ] Exclude: raw mesh data (too large; use `--json --include-mesh` if needed)
- [ ] Document the JSON schema in this file or a linked reference

**Scope:** ~50 lines. `run-output.ts` already has `formatRunOutput()`; add a `formatRunOutputJSON()` path.

---

## 0.2 Geometry validators in the standard pipeline

**Status: DONE**

Three built-in validators run automatically in the layered validation pipeline:

| Validator | Location | Severity | Trigger |
|---|---|---|---|
| Empty body | `layered-validation.ts:139-147` | warning | `mesh.positions.length === 0` |
| Degenerate bbox | `layered-validation.ts:171-178` | error | any extent < 1e-6 |
| Disconnected components | `layered-validation.ts:181-188` | warning | `componentCount > 1` |

These fire automatically on every evaluation. No opt-in required.

### 0.2.1 Custom project-level geometry validators

**Status: DONE** (via `defineScene()`)

Authors can add geometry validators in `defineScene()`:

```ts
validators: [{
  id: "min-wall",
  stage: "geometry",
  run: (ctx) => ctx.model.shell(2).volume() > 0
    ? null
    : { severity: "error", message: "Wall thickness < 2mm" }
}]
```

**Key file:** `src/api/scene-contract.ts` — validators run at geometry stage after model build.

---

## 0.3 Evaluation bundles

**Status: DONE**

Every `evaluateModel()` call returns a structured `EvaluationBundle`:

```ts
EvaluationBundle {
  haltedAt?: ValidationStage;
  summary: { errorCount, warningCount };
  typecheck: EvaluationStageSummary;
  semanticValidation: EvaluationStageSummary;
  geometryValidation: EvaluationStageSummary;
  relationValidation: EvaluationStageSummary;
  stats: { available: boolean, data?: GeometryStats };
  tests: { status, total, failures, results };
  render: { requested: boolean };
}
```

Render is truly optional. An agent iterating on geometry gets the full structured report without rendering a pixel.

**Key files:**
- `src/engine/types.ts:162-180` — `EvaluationBundle` type
- `src/validation/layered-validation.ts:399-447` — `buildEvaluationBundle()`
- `src/api/runtime.ts:199` — wired into `evaluateModel()`

---

## 1.1 Rich evaluation MCP tools

**Status: DONE**

Four read-only MCP tools for agents to query model state:

| Tool | Location (`mcp/src/server.ts`) | Returns |
|---|---|---|
| `evaluate` | lines 599-624 | Full EvaluationBundle + stats + diagnostics |
| `get_stats` | lines 626-657 | Triangles, bbox, volume, parts, pairwise relations |
| `get_validation` | lines 659-679 | All diagnostics + stage summaries + pass/fail |
| `compare` | lines 681-725 | Revision delta: errors, warnings, stats diff, params |

**Note:** `evaluate` returns the active session's latest run result. It does not execute arbitrary remote code — that's intentional.

**Backend:** All fetch from `SessionClient.getRunResult()` which pulls from the live session Durable Object.

---

## 1.2 Feature-level MCP tools

**Status: PARTIAL — `list_features` done, edit tools not implemented**

### Done

- [x] `list_features()` — parses `defineScene()` features from source, returns `{ revision, count, features: [{ id, kind, label, refs }] }`
  - `mcp/src/server.ts:728-754`
  - `mcp/src/scene-features.ts` — feature extraction from source

### Not done

- [ ] `add_feature(kind, params)` — add a hole, fillet, chamfer, shell by semantic kind
- [ ] `modify_feature(id, params)` — change a feature's parameters by ID
- [ ] `remove_feature(id)` — remove a feature

**Why these matter for agents:** Raw code generation works but is fragile. `add_feature("through_hole", { diameter: 6, position: [5, 0, 6] })` expresses intent. The system handles oversize-cutter rules, coordinate transforms, and validation. The agent doesn't need to know the API quirks.

**Implementation considerations:**
- Requires stable feature IDs in `defineScene()` — which exist
- Requires source-level code generation or AST patching — this is the hard part
- Start with `add_feature` for the 5 most common operations: through_hole, pocket, fillet, chamfer, shell
- `modify_feature` and `remove_feature` can follow once feature identity in source is reliable
- Each operation should: generate valid `.forge.ts` code, re-evaluate, return the new EvaluationBundle

**Scope:** Medium-large. The feature extraction (`scene-features.ts`) provides the read side. The write side needs a code generation layer that doesn't exist yet.

---

## 1.3 Domain-aware analysis tools

**Status: DONE — heuristic analysis, not structural simulation**

Three MCP tools analyze geometry for manufacturing viability:

| Tool | Location (`mcp/src/server.ts`) | Analysis Method |
|---|---|---|
| `check_printability` | lines 756-763, 1060-1116 | Heuristic: min dimension vs wall threshold, overhang ratio (max(X,Y)/Z), bed adhesion (XY footprint / surface area), disconnected components |
| `check_moldability` | lines 765-772, 1118-1175 | Heuristic: draft proxy (side area ratio), wall thickness variance (extent spread), multi-component risk, complexity indicator |
| `suggest_improvements` | lines 774-785, 1177-1239 | Combines printability + moldability issues + validation diagnostics, dedupes, marks auto-fixable |

**Important caveat for agents:** These are proxy metrics derived from bounding box stats, not ray-casting or FEA. They catch gross problems (no draft, paper-thin walls, unsupported overhangs) but won't detect localized issues like a single thin rib or a small undercut. When the roadmap says "check_printability" it means "fast heuristic screen," not "full DFM analysis."

### 1.3.1 Upgrade to structural analysis

**Status: NOT DONE — future improvement**

For each domain tool, the upgrade path is:

- [ ] **Wall thickness**: ray-based minimum wall measurement (cast rays from surface normals, measure to opposite face). Replaces bbox-min-extent proxy.
- [ ] **Overhang detection**: per-triangle normal analysis against build direction. The max_overhang constraint (`layered-validation.ts:322-355`) already does this for declarative constraints — extract and reuse.
- [ ] **Draft analysis**: per-face angle relative to pull direction. Similar to overhang but for mold release.
- [ ] **Undercut detection**: identify geometry that would prevent mold separation along a given axis.

**Priority:** Low. The heuristic tools are useful now. Structural upgrades can happen when agents report false negatives via `agent.capability_gap` events.

---

## Remaining work summary

| Item | Status | Effort | Priority |
|---|---|---|---|
| CLI `--json` output (0.1.1) | not started | S (~50 LOC) | **high** — unblocks CLI-based agents |
| `add_feature` MCP tool (1.2) | not started | L (code gen layer) | **high** — biggest agent UX improvement |
| `modify_feature` MCP tool (1.2) | not started | L (depends on add_feature) | medium |
| `remove_feature` MCP tool (1.2) | not started | M (AST deletion) | medium |
| Structural wall thickness (1.3.1) | not started | M (ray casting) | low |
| Structural overhang analysis (1.3.1) | not started | S (reuse constraint code) | low |
| Structural draft/undercut (1.3.1) | not started | M | low |

**Recommended next actions for agents working on Phase 1:**
1. Implement `cadlad run --json` — small, high-value, no dependencies
2. Prototype `add_feature("through_hole", ...)` — proves the code generation pattern
3. Extract overhang normal analysis from constraint checker into reusable utility

---

## Key files

| File | Role |
|---|---|
| `src/api/runtime.ts` | `evaluateModel()` entry point |
| `src/validation/layered-validation.ts` | 5-stage validation pipeline + constraint enforcement |
| `src/engine/types.ts` | `EvaluationBundle`, `GeometryStats`, `ModelResult` types |
| `src/studio/model-stats.ts` | Stat computation (volume, area, bbox, pairwise) |
| `src/api/scene-contract.ts` | `defineScene()` envelope + validators + tests |
| `mcp/src/server.ts` | All MCP tool implementations |
| `mcp/src/scene-features.ts` | Feature extraction for `list_features` |
| `src/cli/index.ts` | CLI commands (where `--json` goes) |
| `src/cli/run-output.ts` | Output formatting (where JSON formatter goes) |
