# Phase 4 — Design Intent, Constraints & Manufacturing

> **Status**: ~40% complete. The constrained sketch solver (5 constraint types, driving dimensions, convergence reporting) and declarative scene constraints (4 constraint types with enforcement) are real and tested. The gaps are substantial: design intent hints are a stub, tool bodies don't exist, assembly-preserving patterns don't exist, manufacturing profiles don't exist, and constraint-aware fix suggestions don't exist.
>
> **Depends on**: Phase 1 (evaluation pipeline), Phase 1.5 API additions (batch booleans, sketch profiles, reference geometry — all done)
> **Unlocks**: Phase 5 (manufacturing profiles feed into export, constraint scores feed into studio UX)

---

## Motivation

Today an agent *can* build any shape, but nothing in the system *encourages* design intent. A pro CAD engineer:
- Models the minimum unique geometry and lets symmetry/patterns do the rest
- Anchors features to reference planes so one parameter change ripples correctly
- Collects boolean cuts into tool bodies
- Tests sketches across the full parameter range

CadLad should make these patterns easy, reward them with feedback, and enforce them through constraints. An agent that models well the first time needs fewer iterations — and fewer iterations means faster, cheaper agent runs.

This phase consolidates the old "Phase 1.5" (design intent API additions) with "Phase 4" (constraint system) since they're architecturally intertwined.

---

## What's done

### 4.A Batch booleans & convenience methods

**Status: DONE**

| Method | Location (`src/engine/solid.ts`) | What it does |
|---|---|---|
| `subtractAll(...tools)` | line 64 | Subtract multiple solids in one call |
| `unionAll(...parts)` | line 47 | Union multiple solids in one call |
| `intersectAll(...parts)` | line 81 | Intersect multiple solids in one call |
| `quarterUnion(n1, n2)` | line 167 | Model one quadrant, mirror across two planes |
| `mirrorUnion(normal)` | line 159 | Model half, mirror and union |
| `linearPattern(count, stepX, stepY, stepZ)` | line 179 | Repeat solid in a line |
| `circularPattern(count, axis, angle, center)` | line 200 | Repeat solid around an axis |

These are small, additive additions to `Solid`. Fully tested.

### 4.B Common sketch profiles

**Status: DONE**

| Method | Location (`src/api/sketch.ts`) | Profile shape |
|---|---|---|
| `Sketch.slot(width, height, endRadius)` | line 482 | Stadium/slot (rounded ends) |
| `Sketch.lShape(w1, h1, w2, h2)` | line 487 | L-profile for angles and brackets |
| `Sketch.channel(width, height, flangeWidth)` | line 492 | C-channel profile |
| `Sketch.tShape(w1, h1, w2, h2)` | line 497 | T-profile for beams |

These reduce boilerplate for the most common 2D-to-3D profiles.

### 4.C Reference geometry

**Status: DONE**

| API | Location (`src/api/reference.ts`) | What it provides |
|---|---|---|
| `plane.XY(z?)`, `plane.XZ(y?)`, `plane.YZ(x?)` | lines 87-98 | Standard construction planes |
| `plane.midplane(solid, axis)` | line 100 | Derived plane at center of solid |
| `datum.fromBBox(solid, anchor)` | line 131 | Reference point at bbox anchor (16 positions) |
| `datum.point(point, name?)` | line 127 | Named reference point |
| `axis.X()`, `axis.Y()`, `axis.Z()` | lines 114-123 | World axes through origin |
| `Solid.translateTo(plane, offsets?)` | `solid.ts` | Position relative to reference plane |

Replaces fragile hard-coded `translate(30, 0, 50)` calls with self-updating references.

### 4.D Constrained sketch solver

**Status: DONE — iterative solver with 5 constraint types**

**Key file:** `src/api/sketch.ts:141-464` (class `ConstrainedSketch`)

The solver supports:

| Constraint | Method | What it enforces |
|---|---|---|
| Coincident | `coincident(ptA, ptB)` | Two points at same location |
| Fixed distance | `fixedDistance(ptA, ptB, dist)` | Exact distance between points |
| Perpendicular | `perpendicular(lineA, lineB)` | Lines at 90 degrees |
| Equal length | `equalLength(lineA, lineB)` | Lines same length |
| Tangent | `tangent(lineId, circleId)` | Line tangent to circle |

**Solver characteristics:**
- Iterative Gauss-Seidel style (not symbolic). Max 60 iterations, tolerance 1e-4.
- Convergence reporting: `getSolveResult()` returns `{ converged, iterations, maxResidual }`.
- Driving dimensions: `dimension(id, value)` + `setDimension(id, value)` for parametric re-solving.
- `toSketch()` converts solved points to a standard `Sketch` for extrusion/revolve.

**Design note:** This solver works for practical cases (rectangles, brackets, simple profiles with 5-15 constraints). It does not guarantee convergence for arbitrary over-constrained or under-constrained systems. A full symbolic solver (e.g., based on algebraic decomposition) would be a significant complexity increase with marginal practical benefit for the models agents build today.

**Tests:** `src/api/__tests__/sketch.test.ts:169-259` — rectangle from constraints, tangent line-circle, parametric re-solving with dimension changes.

### 4.E Declarative scene constraints

**Status: DONE — 4 constraint types with enforcement in validation pipeline**

**Types:** `src/api/constraints.ts` (42 lines)
**Enforcement:** `src/validation/layered-validation.ts:255-359`

| Constraint | What it checks | How |
|---|---|---|
| `wall_thickness` | Min extent of each part against threshold | Per-part min(extents.x, y, z) vs `rule.min` |
| `symmetry` | Bbox symmetry about origin on given axis | `abs(bbox.min[axis] + bbox.max[axis])` vs tolerance |
| `clearance` | Minimum distance between named part pair | Pairwise `minDistance` from stats vs `rule.min` |
| `max_overhang` | Downward-facing triangle normals vs angle limit | Per-triangle normal dot product with build direction |

Usage in `defineScene()`:
```ts
constraints: [
  constraint("wall_thickness", { min: mm(2) }),
  constraint("symmetry", { axis: "X" }),
  constraint("clearance", { between: ["lid", "base"], min: mm(0.5) }),
  constraint("max_overhang", { angle: 45 }),
]
```

Violations appear as diagnostics in `EvaluationBundle` with `featureId` like `constraint:wall_thickness:part1`.

**Tests:** `src/api/__tests__/runtime.test.ts:283-322`

---

## What's NOT done

### 4.1 Tool bodies

**Status: DONE**

Tool bodies are construction-only solids (not rendered in final output) used for organizing boolean cuts. Pro CAD pattern: collect all cutters as tool bodies, subtract in one batch.

- [x] `toolBody(name, solid)` — marks a solid as construction-only geometry
- [x] Tool bodies register as `kind: "tool-body"` bodies in evaluation output (`result.toolBodies`)
- [x] `subtractAll()` / `intersectAll()` accept `ToolBody` directly
- [x] Studio viewport can optionally show tool bodies as wireframe for debugging

**Implemented:**
- `src/api/toolbody.ts` now provides a `ToolBody` wrapper class with `_isToolBody = true`
- `evaluateModel()` now strips tool bodies from final output bodies and exposes them via `result.toolBodies`
- Studio viewport renders tool bodies as wireframe when `Tool bodies` toggle is enabled

**Scope:** Small-medium. The concept is simple; the work is plumbing it through evaluation and rendering.

### 4.2 Design intent hints

**Status: STUB — only empty-body detection exists**

**Current state:** `src/api/hints.ts` (31 lines) has a single check:
```ts
export function collectHints(ctx: HintContext): Hint[] {
  if (ctx.emptyBodies > 0) { /* warn */ }
  return hints;
}
```

`HintContext` only has `emptyBodies: number`. No access to source code, AST, features, or geometry stats.

**5 planned hints (all unstarted):**

| Hint | Detection method | Complexity |
|---|---|---|
| **Magic numbers** | Source analysis: 3+ literal numbers in `translate()` / sketch coords with no `param()` or datum reference | M — needs source text or AST access in hint context |
| **Repeated geometry** | Stats analysis: same primitive constructed 3+ times with offset only | M — needs feature list + geometry comparison |
| **Missed symmetry** | Stats analysis: bbox symmetric about X or Y but no `mirrorUnion()` in source | S — bbox check is trivial; "no mirror" needs source scan |
| **Deep boolean chains** | Source analysis: 5+ sequential `.subtract()` calls | S — simple regex/AST pattern |
| **Unparameterized dimensions** | Source analysis: literal numbers in sketch coordinates | M — needs source text access |

**What HintContext needs to grow into:**
```ts
interface HintContext {
  emptyBodies: number;
  source: string;              // For source-level pattern detection
  features?: SceneFeature[];   // For feature-level analysis
  stats?: GeometryStats;       // For geometry-level checks
  params?: ParamDef[];         // For parameterization analysis
}
```

**Priority:** Medium-high. These hints are advisory (never blocking), but they teach agents pro modeling patterns. An agent that sees "5 sequential .subtract() calls — consider subtractAll() with tool bodies" will produce better code next time.

**Scope:** Medium. Each hint is 20-50 lines, but expanding `HintContext` and wiring source/features/stats into the hint pipeline requires plumbing through `evaluateModel()`.

### 4.3 Assembly-preserving patterns

**Status: NOT IMPLEMENTED**

The existing pattern methods (`linearPattern`, `circularPattern`, `mirrorUnion`) produce anonymous unions. When parts need distinct colors or names, you need assembly-preserving variants.

- [ ] `Solid.mirrorAssembly(normal, namePrefix?)` — mirrors into an Assembly (preserves part identity/color)
- [ ] `Solid.linearPatternAssembly(count, step, namePrefix?)` — pattern into Assembly
- [ ] `Solid.circularPatternAssembly(count, axis, angle, center, namePrefix?)` — pattern into Assembly

**Scope:** Small. Each method is ~15 lines — create N transformed copies, add to an Assembly with prefixed names.

### 4.4 Parametric robustness testing

**Status: NOT IMPLEMENTED**

- [ ] `paramSweepTest(paramName, values)` — helper for `defineScene().tests` that evaluates the model at each param value and reports failures (empty geometry, self-intersection, validation errors)
- [ ] Enhanced sketch `validate()` that reports *why* validation failed (which edges intersect, where area goes to zero)

**Why this matters:** A model that works at default parameters but breaks at min/max is fragile. Agents should test across the parameter range before declaring success. `paramSweepTest` makes this a one-liner in the test block.

**Scope:** Medium. The sweep itself is straightforward (loop over values, evaluate, collect failures). The hard part is making evaluation fast enough for N parameter values — may need geometry caching by source hash.

### 4.5 Manufacturing profiles

**Status: NOT IMPLEMENTED**

Manufacturing profiles auto-activate relevant constraints based on the target process:

```ts
profile("fdm_printing", { layerHeight: 0.2, nozzle: 0.4 })
// Activates: wall_thickness >= 2*nozzle, max_overhang <= 45°, min bridging distance
profile("injection_molding", { material: "ABS" })
// Activates: draft >= 1°, wall uniformity, no undercuts, gate placement hints
profile("cnc_milling", { tool: 3 })
// Activates: min internal radius >= tool/2, max depth-to-width ratio, accessibility
```

**Implementation plan:**
- Each profile is a function that returns an array of `SceneConstraint[]` + advisory hints
- Profiles live in `src/api/profiles/` with one file per manufacturing method
- Material-specific parameters (nozzle size, tool diameter, material properties) come from a lookup table
- An agent says "I'm designing for FDM printing" and gets automatic constraint enforcement — no domain knowledge required in the prompt

**Scope:** Medium per profile. The constraint infrastructure exists (Phase 4.E). Profiles are mostly configuration + the right constraint values for each manufacturing method. FDM is easiest to start with since the constraints are well-understood.

### 4.6 Constraint-aware fix suggestions

**Status: NOT IMPLEMENTED**

When a constraint is violated, the system should suggest a fix — not just report the violation:

```
Constraint wall_thickness failed for "shelf": minimum extent 1.2mm < 2mm.
Suggested: increase shell thickness parameter from 1.5 to 2.5mm.
```

- [ ] Each constraint type gets a `suggest(violation, model)` method that returns structured fix data
- [ ] Suggestions returned as part of `EvaluationBundle.diagnostics` with `suggestedFix` field
- [ ] Fix data is structured (not prose) so agents can act on it programmatically:
  ```ts
  { param: "shell_thickness", currentValue: 1.5, suggestedValue: 2.5, reason: "wall_thickness constraint" }
  ```

**Scope:** Small per constraint type. The enforcement logic already computes the violation magnitude — adding a suggestion is mostly arithmetic (e.g., "increase by delta to meet threshold").

### 4.7 Skills & workflow documentation

**Status: NOT DONE**

- [ ] Add "Design Intent Patterns" section to `SKILLS.md`: symmetry decision tree, reference geometry patterns, tool body patterns, bulletproof sketch patterns
- [ ] New workflow file: `.claude/skills/workflow-design-intent.md` — step-by-step for agents: identify symmetry -> establish datums -> model minimum -> pattern/mirror -> tool bodies for cuts -> parameterize everything -> run design intent check -> sweep params
- [ ] Update `CLAUDE.md` API tables with tool bodies, assembly-preserving patterns, manufacturing profiles

**Scope:** Small-medium. Documentation work, but important for agent onboarding.

---

## Remaining work summary

| Item | Status | Effort | Priority |
|---|---|---|---|
| Tool bodies (4.1) | not started | S-M | **high** — enables pro boolean patterns |
| Design intent hints (4.2) | stub only | M | **high** — teaches agents good patterns |
| Assembly-preserving patterns (4.3) | not started | S | medium |
| Parametric robustness testing (4.4) | not started | M | medium |
| Manufacturing profiles (4.5) | not started | M per profile | medium — FDM first |
| Constraint-aware suggestions (4.6) | not started | S per constraint | medium |
| Skills/workflow docs (4.7) | not started | S-M | medium |

**Recommended next actions for agents working on Phase 4:**
1. **Implement tool bodies** — small, high-value, enables the "collect cutters, subtract once" pattern
2. **Expand HintContext and implement deep-boolean-chain hint** — simplest hint to start with (regex on source), proves the pipeline
3. **Implement FDM manufacturing profile** — first concrete profile, exercises the constraint infrastructure
4. **Add `paramSweepTest` helper** — simple loop, high value for model robustness

---

## Constrained sketch solver: future expansion

The current solver handles 5 constraint types. Potential additions (not currently planned):

| Constraint | Use case | Complexity |
|---|---|---|
| Horizontal/Vertical | Lock lines to axes | S |
| Midpoint | Point at center of line | S |
| Symmetric | Points symmetric about a line | M |
| Concentric | Circles sharing center | S |
| Parallel | Lines at same angle | M |
| Angle | Fixed angle between lines | M |

These would be additive to the existing solver. Each constraint type is ~30 lines (an `apply*` method). The solver architecture doesn't need to change.

**When to add:** When agents report capability gaps requesting specific constraint types (Phase 3 telemetry will surface this automatically).

---

## Key files

| File | Role |
|---|---|
| `src/engine/solid.ts` | Batch booleans, patterns, mirror methods |
| `src/api/sketch.ts:141-464` | `ConstrainedSketch` solver (5 constraint types, driving dimensions) |
| `src/api/sketch.ts:482-510` | Common sketch profiles (slot, lShape, channel, tShape) |
| `src/api/reference.ts` | Plane, axis, datum types + factories + feature declarations |
| `src/api/constraints.ts` | Constraint types + `constraint()` factory (42 lines) |
| `src/api/hints.ts` | Hint system — **stub** (31 lines, only empty-body) |
| `src/validation/layered-validation.ts:255-359` | Declarative constraint enforcement |
| `src/api/__tests__/sketch.test.ts:169-259` | Constrained sketch tests |
| `src/api/__tests__/runtime.test.ts:283-322` | Declarative constraint tests |
