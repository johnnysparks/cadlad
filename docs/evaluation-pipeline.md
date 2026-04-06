# Evaluation Pipeline

Every `evaluateModel()` call runs a deterministic 5-stage validation pipeline and returns a structured `EvaluationBundle`. Render is optional — agents get full feedback without pixels.

---

## EvaluationBundle

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

Each stage can halt evaluation on errors, preventing later stages from running on invalid input.

**Key files:**
- `packages/cad-api/runtime.ts` — `evaluateModel()` entry point
- `packages/validation/layered-validation.ts` — pipeline implementation
- `packages/cad-kernel/types.ts` — `EvaluationBundle`, `GeometryStats`, `ModelResult` types

---

## Geometry Stats

Every evaluation computes `GeometryStats`:
- Volume, surface area, bounding box, component count
- Per-body stats (individual volumes, areas, bounding boxes)
- Derived checks: zero volume, degenerate bbox, disconnected components

Stats are available in ~200ms and are the primary feedback mechanism for agents.

---

## Validation Stages

### Stage 1: Type-level checks (pre-build)
- Malformed scene envelope structure
- Params missing `{ value: ... }` structure

### Stage 2: Semantic checks (pre-build)
- Scene semantic validators (`validators` with `stage: "semantic"`)
- Passed params context (no geometry yet)

### Stage 3: Geometry checks (post-build)
- Empty scene output / empty mesh buffers
- Disconnected multi-body output (warning, configurable)
- Near-zero volume and degenerate bounding boxes
- Scene geometry envelope checks (`expectedVolume`, `expectedBoundingBox`)
- Scene geometry validators (`validators` with `stage: "geometry"`)

### Stage 4: Stats & relations (post-build)
- Pairwise intersection detection
- Minimum distance computation between named parts
- Declarative constraint enforcement (see [Design Intent & Constraints](./design-intent-and-constraints.md))

### Stage 5: Tests (post-build)
- In-source tests declared in `defineScene().tests` with stable IDs
- Each test gets access to `{ bodies, model, params }`
- Results included in `EvaluationBundle.tests`

---

## Built-in Geometry Validators

Three validators run automatically on every evaluation:

| Validator | Severity | Trigger |
|---|---|---|
| Empty body | warning | `mesh.positions.length === 0` |
| Degenerate bbox | error | any extent < 1e-6 |
| Disconnected components | warning | `componentCount > 1` |

Authors can add custom validators via `defineScene()` (see [Scene Layer](./forge-ts-scene-layer.md)).

---

## CLI JSON Output

`cadlad run --json` returns the full `ModelResult` as stable JSON (`cadlad.run.v1` schema):

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
    "hints": [],
    "camera": [200, -200, 160],
    "bodies": [{ "name": "Body 0", "color": [...], "mesh": {...} }]
  }
}
```

- `bodies` omitted by default (large payload); opt-in via `--include-mesh`
- Primary interface for non-MCP agents and CI pipelines

---

## MCP Evaluation Tools

Four read-only tools for agents to query model state:

| Tool | Returns |
|---|---|
| `evaluate` | Full EvaluationBundle + stats + diagnostics |
| `get_stats` | Triangles, bbox, volume, parts, pairwise relations |
| `get_validation` | All diagnostics + stage summaries + pass/fail |
| `compare` | Revision delta: errors, warnings, stats diff, params |

All fetch from the live session's latest run result. `evaluate` returns cached results — it does not execute arbitrary remote code.

---

## Domain Analysis Tools

Three MCP tools analyze geometry for manufacturing viability using heuristic methods:

| Tool | What it checks |
|---|---|
| `check_printability` | Min dimension vs wall threshold, overhang ratio, bed adhesion footprint, disconnected components |
| `check_moldability` | Draft proxy (side area ratio), wall thickness variance, multi-component risk, complexity indicator |
| `suggest_improvements` | Combines printability + moldability issues + validation diagnostics, dedupes, marks auto-fixable |

**Important:** These are proxy metrics derived from bounding box stats, not ray-casting or FEA. They catch gross problems (paper-thin walls, unsupported overhangs, no draft) but won't detect localized issues like a single thin rib or small undercut.

---

## Key Files

| File | Role |
|---|---|
| `packages/cad-api/runtime.ts` | `evaluateModel()` entry point |
| `packages/validation/layered-validation.ts` | 5-stage pipeline + constraint enforcement |
| `packages/cad-kernel/types.ts` | `EvaluationBundle`, `GeometryStats`, `ModelResult` types |
| `packages/cad-api/scene-contract.ts` | `defineScene()` envelope + validators + tests |
| `apps/mcp-gateway/server.ts` | MCP tool implementations |
| `apps/cli/run-output.ts` | CLI JSON output formatting |
