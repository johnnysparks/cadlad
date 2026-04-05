# Phase 1 — Machine-Readable Feedback & Semantic MCP Surface

> **Status**: ~90% complete. Core evaluation pipeline, CLI JSON output, and read-only MCP tools are done. Remaining work is structural (non-heuristic) domain analysis.
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

**Status: DONE**

`cadlad run --json` should return the full `ModelResult` (stats, diagnostics, evaluation bundle) as stable JSON to stdout. This is the primary interface for non-MCP agents and CI pipelines.

**Why it matters:** Any agent running locally via CLI currently gets human-readable text output only. JSON output makes the CLI a first-class agent interface without requiring a live session or MCP server.

**Implementation:**
- [x] Add `--json` flag to `src/cli/index.ts` `run` command
- [x] Serialize `ModelResult` to stable JSON schema via `src/cli/run-output.ts`
- [x] Include: evaluation bundle, geometry stats, diagnostics, param values
- [x] Exclude: raw mesh data by default; opt-in via `--json --include-mesh`
- [x] Document the JSON schema in this file

**Scope:** ~50 lines. `run-output.ts` already has `formatRunOutput()`; add a `formatRunOutputJSON()` path.

**CLI JSON schema (`cadlad.run.v1`)**

```json
{
  "schemaVersion": "cadlad.run.v1",
  "ok": true,
  "file": "projects/demo/demo.forge.ts",
  "mode": "run",
  "errors": [],
  "modelResult": {
    "params": [{ "name": "width", "value": 10 }],
    "geometryStats": { "triangles": 12, "bodies": 1 },
    "diagnostics": [],
    "evaluation": { "summary": { "errorCount": 0, "warningCount": 0 } },
    "sceneValidation": null,
    "hints": [],
    "camera": [200, -200, 160],
    "bodies": [
      {
        "name": "Body 0",
        "color": [0.7, 0.7, 0.7, 1],
        "mesh": {
          "positions": [0, 0, 0],
          "normals": [0, 0, 1],
          "indices": [0, 1, 2]
        }
      }
    ]
  }
}
```

Notes:
- `modelResult.bodies` is omitted by default (large payload).
- `modelResult.bodies[].mesh` appears only when `--include-mesh` is passed with `--json`.
- Numeric arrays are serialized as JSON arrays for cross-language consumers (CI/agents).


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

**Status: REMOVED**

Feature metadata in `defineScene()` and the corresponding MCP listing tool were removed as premature abstractions.
Agents should work directly with source code via `replace_source` + `evaluate`.

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
| Structural wall thickness (1.3.1) | not started | M (ray casting) | low |
| Structural overhang analysis (1.3.1) | not started | S (reuse constraint code) | low |
| Structural draft/undercut (1.3.1) | not started | M | low |

**Recommended next actions for agents working on Phase 1:**
1. Extract overhang normal analysis from constraint checker into reusable utility
2. Add ray-based wall thickness analysis for `check_printability`
3. Add per-face draft + undercut analysis for moldability checks

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
| `src/cli/index.ts` | CLI commands (where `--json` goes) |
| `src/cli/run-output.ts` | Output formatting (where JSON formatter goes) |
