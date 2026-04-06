# Design Intent & Constraints

CadLad encourages pro CAD patterns through API affordances, a constraint system, and advisory hints. An agent that models with design intent produces models that survive parameter changes on the first try.

---

## Batch Booleans

| Method | What it does |
|---|---|
| `subtractAll(...tools)` | Subtract multiple solids in one call |
| `unionAll(...parts)` | Union multiple solids in one call |
| `intersectAll(...parts)` | Intersect multiple solids in one call |
| `quarterUnion(n1, n2)` | Model one quadrant, mirror across two planes |
| `mirrorUnion(normal)` | Model half, mirror and union |
| `linearPattern(count, stepX, stepY, stepZ)` | Repeat solid in a line |
| `circularPattern(count, axis, angle, center)` | Repeat solid around an axis |

---

## Common Sketch Profiles

| Method | Profile shape |
|---|---|
| `Sketch.slot(width, height, endRadius)` | Stadium/slot (rounded ends) |
| `Sketch.lShape(w1, h1, w2, h2)` | L-profile for angles and brackets |
| `Sketch.channel(width, height, flangeWidth)` | C-channel profile |
| `Sketch.tShape(w1, h1, w2, h2)` | T-profile for beams |

---

## Reference Geometry

Replaces fragile hard-coded `translate()` calls with self-updating references.

| API | What it provides |
|---|---|
| `plane.XY(z?)`, `plane.XZ(y?)`, `plane.YZ(x?)` | Standard construction planes |
| `plane.midplane(solid, axis)` | Derived plane at center of solid |
| `datum.fromBBox(solid, anchor)` | Reference point at bbox anchor (16 positions) |
| `datum.point(point, name?)` | Named reference point |
| `axis.X()`, `axis.Y()`, `axis.Z()` | World axes through origin |
| `Solid.translateTo(plane, offsets?)` | Position relative to reference plane |

---

## Tool Bodies

Construction-only solids used for organizing boolean cuts. Not rendered in final output.

```ts
const cutter = toolBody("mounting-holes", holeCutter);
const body = base.subtractAll(cutter);
```

- `toolBody(name, solid)` marks a solid as construction-only
- Tool bodies register as `kind: "tool-body"` in evaluation output (`result.toolBodies`)
- `subtractAll()` / `intersectAll()` accept `ToolBody` directly
- Studio viewport can optionally show tool bodies as wireframe for debugging

---

## Assembly-Preserving Patterns

The standard pattern methods (`linearPattern`, `circularPattern`, `mirrorUnion`) produce anonymous unions — all parts merge. When parts need distinct colors or names, use assembly-preserving variants:

| Method | What it does |
|---|---|
| `Solid.mirrorAssembly(normal, namePrefix?)` | Mirror into Assembly (preserves part identity/color) |
| `Solid.linearPatternAssembly(count, step, namePrefix?)` | Linear pattern into Assembly |
| `Solid.circularPatternAssembly(count, axis, angle, center, namePrefix?)` | Circular pattern into Assembly |

---

## Constrained Sketch Solver

An iterative Gauss-Seidel solver for 2D sketch constraints. Max 60 iterations, tolerance 1e-4.

### Supported Constraints

| Constraint | Method | What it enforces |
|---|---|---|
| Coincident | `coincident(ptA, ptB)` | Two points at same location |
| Fixed distance | `fixedDistance(ptA, ptB, dist)` | Exact distance between points |
| Perpendicular | `perpendicular(lineA, lineB)` | Lines at 90 degrees |
| Equal length | `equalLength(lineA, lineB)` | Lines same length |
| Tangent | `tangent(lineId, circleId)` | Line tangent to circle |

### Driving Dimensions

`dimension(id, value)` + `setDimension(id, value)` for parametric re-solving. Change a dimension and the sketch updates to satisfy all constraints.

### Convergence

`getSolveResult()` returns `{ converged, iterations, maxResidual }`. Works well for practical cases (rectangles, brackets, simple profiles with 5-15 constraints). Not a full symbolic solver.

---

## Declarative Scene Constraints

Four constraint types enforced during validation Stage 4 (stats & relations):

| Constraint | What it checks | How |
|---|---|---|
| `wall_thickness` | Min extent of each part against threshold | Per-part `min(extents.x, y, z)` vs `rule.min` |
| `symmetry` | Bbox symmetry about origin on given axis | `abs(bbox.min[axis] + bbox.max[axis])` vs tolerance |
| `clearance` | Min distance between named part pair | Pairwise `minDistance` from stats vs `rule.min` |
| `max_overhang` | Downward-facing triangle normals vs angle limit | Per-triangle normal dot product with build direction |

### Usage

```ts
constraints: [
  constraint("wall_thickness", { min: mm(2) }),
  constraint("symmetry", { axis: "X" }),
  constraint("clearance", { between: ["lid", "base"], min: mm(0.5) }),
  constraint("max_overhang", { angle: 45 }),
]
```

Each constraint can specify `severity: "error" | "warning"` (defaults to `"error"`). Violations appear as diagnostics in `EvaluationBundle` with `featureId` like `constraint:wall_thickness:part1`.

---

## Design Intent Hints

Heuristic advisory checks that teach agents pro modeling patterns. Hints are never blocking.

### Current Detectors

| Hint | Detection method |
|---|---|
| Empty bodies | Zero-volume body in output |
| Deep boolean chains | 5+ sequential `.subtract()` calls in source |
| Magic numbers | 3+ literal numbers in `translate()` / sketch coords with no `param()` or datum |
| Repeated geometry | Same primitive constructed 3+ times with offset only |
| Missed symmetry | Bbox symmetric about X or Y but no `mirrorUnion()` in source |
| Unparameterized dimensions | Literal numbers in sketch coordinates |

`HintContext` accepts source text, geometry stats, and params so hinting can combine source-level and geometry-level signals.

---

## Parametric Robustness Testing

`paramSweepTest(paramName, values)` — helper in `defineScene().tests` that evaluates alternate parameter values and reports fragile cases. A model that works at default parameters but breaks at min/max is fragile.

```ts
tests: [
  paramSweepTest("Width", [20, 60, 100, 200]),
]
```

---

## Key Files

| File | Role |
|---|---|
| `packages/cad-kernel/solid.ts` | Batch booleans, patterns, mirror methods |
| `packages/cad-api/sketch.ts` | `ConstrainedSketch` solver + common profiles |
| `packages/cad-api/reference.ts` | Plane, axis, datum types + factories |
| `packages/cad-api/constraints.ts` | Constraint types + `constraint()` factory |
| `packages/cad-api/hints.ts` | Hint system — heuristic rules |
| `packages/cad-api/toolbody.ts` | `ToolBody` wrapper class |
| `packages/validation/layered-validation.ts` | Declarative constraint enforcement |
