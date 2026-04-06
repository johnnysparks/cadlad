# Scene Layer (`defineScene`)

The `defineScene(...)` envelope makes `.forge.ts` models machine-operable while preserving CadLad's code-first style. See also: [Evaluation Pipeline](./evaluation-pipeline.md), [Design Intent & Constraints](./design-intent-and-constraints.md).

## What a scene declares

```ts
return defineScene({
  meta: { id: "bracket", intent: "Parametric mounting bracket" },
  params: { /* typed defaults and machine-readable ranges */ },
  constraints: [
    constraint("wall_thickness", { min: mm(2) }),
    constraint("symmetry", { axis: "X" }),
    constraint("clearance", { between: ["lid", "base"], min: mm(0.5) }),
    constraint("max_overhang", { angle: 45 }),
  ],
  validators: [
    { id: "hole.fits", stage: "semantic", run: ({ params }) => ... },
    { id: "result.solid", stage: "geometry", run: ({ bodies, model }) => ... },
  ],
  tests: [
    { id: "mesh.non-empty", run: ({ bodies }) => ... },
  ],
  geometry: {
    allowDisconnectedComponents: false,
    expectedVolume: { min: 100, max: 1000 },
    expectedBoundingBox: { min: { z: 0 }, max: { x: 200, y: 200, z: 200 } },
  },
  model: ({ params }) => { /* modeling code */ },
});
```

### Scene fields

| Field | Purpose | Required |
|---|---|---|
| `meta` | Identity + intent for tracking | no |
| `params` | Typed defaults with min/max/unit/step | no (falls back to `param()` calls) |
| `constraints` | Declarative design rules checked after geometry build | no |
| `validators` | Author assertions at semantic or geometry stages | no |
| `tests` | Lightweight in-source checks run after model exists | no |
| `geometry` | Sanity envelope: expected volume, bbox, connectivity | no |
| `model` | The modeling code (direct value or factory function) | **yes** |

## Validation stack

`defineScene()` runs a deterministic 5-stage pipeline. Each stage can halt evaluation on errors.

### Stage 1: Type-level checks (pre-build)

`src/api/scene-contract.ts:206-244, 463-538`

- Malformed scene envelope structure
- Params missing `{ value: ... }` structure

### Stage 2: Semantic checks (pre-build)

`src/api/scene-contract.ts:273-314`

- Scene semantic validators (`validators` with `stage: "semantic"`)
- Passed params (no geometry yet)

### Stage 3: Geometry checks (post-build)

`src/api/scene-contract.ts:316-431`, `src/validation/layered-validation.ts:139-188`

- Empty scene output / empty mesh buffers
- Disconnected multi-body output (warning, configurable)
- Near-zero volume and degenerate bounding boxes
- Scene geometry envelope checks (`expectedVolume`, `expectedBoundingBox`)
- Scene geometry validators (`validators` with `stage: "geometry"`)

### Stage 4: Stats & relations (post-build)

`src/validation/layered-validation.ts:255-359`

- Pairwise intersection detection
- Minimum distance computation between named parts
- **Declarative constraint enforcement:**

| Constraint | What it checks | Location |
|---|---|---|
| `wall_thickness` | Min extent of each part against threshold | `layered-validation.ts:266-278` |
| `symmetry` | Bbox offset from origin plane on given axis | `layered-validation.ts:281-293` |
| `clearance` | Pairwise min distance between named parts | `layered-validation.ts:296-319` |
| `max_overhang` | Per-triangle normal angle against build direction | `layered-validation.ts:322-355` |

### Stage 5: Tests (post-build)

- In-source tests declared in `tests` array with stable IDs
- Each test gets access to `{ bodies, model, params }`
- Results included in `EvaluationBundle.tests`

All checks are deterministic, avoid fuzzy heuristics, and are intentionally cheap.

## Reference geometry integration

Reference objects (`plane.XY()`, `datum.fromBBox()`, `axis.Z()`) are used directly in modeling code.

## Declarative constraints

Constraints are checked during Stage 4 (stats & relations) after the model is built:

```ts
import { constraint } from "../api/constraints.js";

constraints: [
  constraint("wall_thickness", { min: mm(2) }),
  constraint("symmetry", { axis: "X", tolerance: mm(0.1) }),
  constraint("clearance", { between: ["lid", "base"], min: mm(0.5) }),
  constraint("max_overhang", { angle: 45 }),
]
```

Each constraint can specify `severity: "error" | "warning"` (defaults to `"error"`). Violations appear as diagnostics in the `EvaluationBundle` with `featureId` like `"constraint:wall_thickness:part1"`.

**Implementation:** `src/api/constraints.ts` (types + factory), `src/validation/layered-validation.ts:255-359` (enforcement).

## Evaluation output

Every evaluation returns an `EvaluationBundle` (`src/engine/types.ts:162-180`):

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

Render is optional and late. Agents get full structured feedback without rendering a pixel.

## Escape hatch retained

- Models that don't use `defineScene()` still work through the existing evaluation path
- `model` can be a direct `Solid`/`Assembly` value or a factory function
- `.forge.js` and `.forge.ts` files without `defineScene()` evaluate normally

## Key Files

| File | Role |
|---|---|
| `packages/cad-api/scene-contract.ts` | `defineScene()` normalization + validation (stages 1-3, 5) |
| `packages/validation/layered-validation.ts` | Stats/relations + constraint enforcement (stage 4) |
| `packages/cad-api/constraints.ts` | Constraint types + `constraint()` factory |
| `packages/cad-api/reference.ts` | Reference geometry types + factories |
| `packages/cad-kernel/types.ts` | `EvaluationBundle`, `GeometryStats`, `Hint` types |
| `packages/cad-api/runtime.ts` | `evaluateModel()` orchestration |
