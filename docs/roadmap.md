# CadLad Roadmap

> Derived from the [north star vision](./cadlad_north_star.md), grounded in the current state of the codebase as of April 2026.
>
> **Key assumption: agents are the primary users.** Humans use the studio for review, visualization, and final approval. Agents do the modeling. Every priority decision flows from this.

---

## Where we are today

CadLad is a working code-first parametric 3D CAD system. The core loop — write `.forge.ts` → evaluate → render → iterate — works:

- **Engine**: Manifold WASM kernel with 11 primitives, booleans, transforms, edge treatments, shell, draft, patterns. ~30 methods on `Solid`.
- **API**: `param()`, `Sketch`, `assembly()`, `defineScene()` with 5-stage layered validation (types → semantic → geometry → stats → tests).
- **Studio**: Monaco + Three.js + parameter sliders + live evaluation. Live session client with WebSocket/REST.
- **CLI**: `run`, `validate`, `export` (STL). Watch mode.
- **Worker**: Cloudflare backend with Durable Objects, OAuth 2.1, MCP server for Claude/ChatGPT.
- **Gallery**: Auto-discovers projects, interactive viewers, high-contrast mode.
- **24 example projects** using `defineScene()` strict envelope.
- **12 test suites**, ~1700 lines of tests.

### The agent bottleneck

Today an agent modeling in CadLad hits these walls, in order of pain:

1. **Feedback is visual.** The agent must render and screenshot to know if geometry is correct. That's slow, expensive, and lossy — a screenshot doesn't tell you wall thickness is 0.3mm or that two parts overlap by 2mm.
2. **No structured evaluation results.** `evaluateModel()` returns bodies and errors, but not a machine-readable quality report. The agent has to infer correctness from absence of errors.
3. **No memory across sessions.** Each agent session starts cold. There's no revision history, no "what did I try last time," no branch-and-compare.
4. **MCP tools are thin.** The current MCP surface is get-state / submit-patch / get-screenshot. Agents write raw `.forge.ts` code for everything — no semantic operations.
5. **No domain knowledge in the loop.** Printability, moldability, structural soundness, clearance checks — the agent has to know these rules. The system doesn't enforce or even check them.

The roadmap is ordered to eliminate these bottlenecks top-down.

---

## Phase 0 — Machine-readable geometry feedback

**Goal: An agent can evaluate a model and get a structured quality report without rendering a single pixel.**

This is the highest-leverage change. Every later phase compounds on it.

### 0.1 Structured GeometryStats in every evaluation

- [x] Compute and return `GeometryStats` as part of every `ModelResult`: volume, surface area, bounding box, component count, per-body stats.
- [x] Include derived checks: is volume zero? Is any bbox dimension degenerate? Are there disconnected components?
- [ ] Return these from CLI (`cadlad run --json`) and MCP (`validate` tool) in a stable JSON schema.

The pieces exist (`Solid.volume()`, `Solid.surfaceArea()`, `Solid.boundingBox()`, `Solid.numComponents()`, `model-stats.ts`). They just aren't wired into the standard evaluation output.

### 0.2 Geometry validators in the standard pipeline

- [ ] Add built-in geometry validators to layered validation that run automatically:
  - Empty body detection (volume < epsilon)
  - Degenerate bbox (any dimension < epsilon)
  - Unexpected disconnected components
  - Volume sanity (configurable expected range)
  - Bbox sanity (configurable expected envelope)
- [ ] Let `defineScene()` authors add project-specific geometry validators with access to the built `Solid`:
  ```ts
  validators: [{
    id: "min-wall",
    stage: "geometry",
    run: (ctx) => ctx.model.shell(2).volume() > 0 
      ? null 
      : { severity: "error", message: "Wall thickness < 2mm" }
  }]
  ```

### 0.3 Evaluation bundles

- [x] Define `EvaluationBundle`: typecheck, semantic validation, geometry validation, stats, tests — all structured, all machine-readable. Render is optional and last.
- [x] Every `evaluateModel()` call returns a bundle. The agent gets a complete structured report.
- [x] Make render truly optional. An agent iterating on geometry doesn't need pixels until it's ready for visual confirmation.

**Why this is Phase 0, not Phase 2:** For human users, screenshots are acceptable primary feedback. For agents, they're a crutch. Agents need numbers, booleans, and structured diagnostics — not pixel interpretation. This phase makes the tight loop (`code → evaluate → read stats → adjust`) fast and non-visual.

---

## Phase 1 — Semantic MCP surface

**Goal: Agents operate on models through semantic tools, not raw code injection.**

### 1.1 Rich evaluation MCP tools

- [x] `evaluate(code?, paramOverrides?)` → full `EvaluationBundle` (not just errors).  
      _Current behavior returns the active session's latest run; arbitrary remote code execution is intentionally not enabled yet._
- [x] `get_stats()` → structured geometry stats for current model.
- [x] `get_validation()` → all diagnostics, validators, tests, with pass/fail and messages.
- [x] `compare(codeA, codeB)` → diff of geometry stats, validation results, param values.  
      _Current behavior compares previously evaluated session revisions/source snapshots._

These let an agent reason about model quality without vision.

### 1.2 Feature-level MCP tools

- [ ] `add_feature(kind, params)` — add a hole, fillet, chamfer, shell, etc. by semantic kind. The system generates correct `.forge.ts` code.
- [ ] `modify_feature(id, params)` — change a feature's parameters by ID. Requires `defineScene()` with stable feature IDs.
- [ ] `remove_feature(id)` — remove a feature.
- [x] `list_features()` → current feature tree with IDs, kinds, params.

**Why semantic operations matter for agents:** Raw code generation works but is fragile. An agent writing `solid.subtract(cylinder(12, 3).translate(5, 0, 6))` has to know the exact API, coordinate system, and sizing rules. An agent calling `add_feature("through_hole", { diameter: 6, position: [5, 0, 6] })` expresses intent. The system handles the implementation, including oversize-cutter rules, coordinate transforms, and validation.

### 1.3 Domain-aware suggestion tools

- [x] `check_printability(opts?)` — analyze for 3D printing: wall thickness, overhang angles, support requirements, bed adhesion area.
- [x] `check_moldability(opts?)` — analyze for injection molding: draft angles, undercuts, wall uniformity, gate placement hints.
- [x] `suggest_improvements()` → list of actionable suggestions with severity and auto-fix capability.

These encode the domain knowledge that's currently in CLAUDE.md's "hard-won lessons" section. The agent shouldn't need to read prose to avoid coplanar boolean artifacts — the system should catch it.

---

## Phase 1.5 — Design Intent & Parametric Intelligence

**Goal: The system teaches and enforces "pro" CAD patterns — symmetry-first modeling, reference geometry, tool bodies, bulletproof sketches — so agents (and humans) produce robust, change-resilient models by default.**

Today an agent can build any shape, but nothing in the system *encourages* design intent. A pro CAD engineer models the minimum unique geometry and lets symmetry/patterns do the rest; anchors features to reference planes so one change ripples correctly; collects boolean cuts into tool bodies; and tests sketches across the full parameter range. CadLad should make these patterns easy and reward them with feedback.

### 1.5.1 Batch booleans & convenience methods on Solid

- [ ] `Solid.subtractAll(...tools)` — subtract multiple solids in one call. Reduces verbose subtract chains.
- [ ] `Solid.unionAll(...parts)` — union multiple solids in one call.
- [ ] `Solid.intersectAll(...parts)` — intersect multiple solids in one call.
- [ ] `Solid.quarterUnion(normal1, normal2)` — model one quadrant, mirror across two planes. Shorthand for `mirrorUnion(n1).mirrorUnion(n2)`.

These are small, additive changes to `src/engine/solid.ts` with no architectural impact.

### 1.5.2 Common sketch profiles

- [x] `Sketch.slot(width, height, endRadius)` — stadium/slot shape (rounded ends).
- [x] `Sketch.lShape(w1, h1, w2, h2)` — L-profile for angles and brackets.
- [x] `Sketch.channel(width, height, flangeWidth)` — C-channel profile.
- [x] `Sketch.tShape(w1, h1, w2, h2)` — T-profile for beams.

These reduce boilerplate for the most common 2D-to-3D profiles. Added to `src/api/sketch.ts`.

### 1.5.3 Reference geometry — Datums, Planes, Axes

- [ ] `Plane` type: origin + normal. Pure data, no Manifold dependency.
- [ ] `Axis` type: origin + direction. For circular patterns and revolve.
- [ ] `Datum` type: named reference point, optionally derived from a solid's bbox.
- [ ] Factory functions:
  - `plane.XY(zOffset?)`, `plane.XZ(yOffset?)`, `plane.YZ(xOffset?)` — standard construction planes.
  - `plane.midplane(solid, axis)` — derived plane at the center of a solid along an axis.
  - `datum.fromBBox(solid, anchor)` — reference point at "center", "top", "bottom", etc. of a bbox.
  - `axis.Z()`, `axis.X()`, `axis.Y()` — world axes through origin.
- [ ] `Solid.translateTo(plane, offsets?)` — position relative to a reference plane instead of absolute coords.
- [ ] Datums/planes register as features in `defineScene()` for dependency tracking.

New file: `src/api/reference.ts`. This replaces fragile hard-coded `translate(30, 0, 50)` calls with self-updating references.

### 1.5.4 Tool bodies

- [ ] `toolBody(name, solid)` — marks a solid as construction-only geometry (not rendered in final output).
- [ ] Tool bodies register as `kind: "tool-body"` features in `defineScene()`.
- [ ] `Solid.subtractAll()` / `Solid.intersectAll()` accept `ToolBody` directly.
- [ ] Studio viewport can optionally show tool bodies as wireframe for debugging.

New file: `src/api/toolbody.ts`. Enables the "collect all cutouts, subtract once" pro pattern.

### 1.5.5 Design intent hints & feedback

Post-evaluation advisory hints (never blocking) added to `src/api/hints.ts`:

- [ ] **Magic numbers**: warn when `translate()` / sketch coordinates use 3+ literal numbers with no `param()` or datum reference.
- [ ] **Repeated geometry**: detect same primitive constructed 3+ times with offset only → suggest `linearPattern()` or `circularPattern()`.
- [ ] **Missed symmetry**: if bbox is symmetric about X or Y but model wasn't built with `mirrorUnion()` → suggest it.
- [ ] **Deep boolean chains**: 5+ sequential `.subtract()` calls → suggest `subtractAll()` with tool bodies.
- [ ] **Unparameterized dimensions**: literal numbers in sketch coordinates → suggest deriving from params.

These hints display in the studio's existing hint panel and are returned in the `ModelResult` for agents.

### 1.5.6 Assembly-preserving patterns

- [ ] `Solid.mirrorAssembly(normal, namePrefix?)` — mirrors into an Assembly (preserves individual part identity and color) instead of anonymous union.
- [ ] `Solid.linearPatternAssembly(count, step, namePrefix?)` — pattern into Assembly.
- [ ] `Solid.circularPatternAssembly(count, axis, angle, center, namePrefix?)` — pattern into Assembly.

These complement the existing union-based patterns for cases where parts need distinct colors or names.

### 1.5.7 Parametric robustness testing

- [ ] `paramSweepTest(paramName, values)` — helper for `defineScene().tests` that evaluates the model at each param value and reports failures (empty geometry, self-intersection, validation errors).
- [ ] Sketch `validate()` enhanced to report *why* validation failed (which edges intersect, where area goes to zero).

### 1.5.8 Skills & workflow documentation

- [ ] Add **"§2.5 Design Intent Patterns"** to `SKILLS.md`: symmetry decision tree, reference geometry patterns, tool body patterns, bulletproof sketch patterns.
- [ ] New workflow file: `.claude/skills/workflow-design-intent.md` — step-by-step for agents: identify symmetry → establish datums → model minimum → pattern/mirror → tool bodies for cuts → parameterize everything → run design intent check → sweep params.
- [ ] Update `CLAUDE.md` API tables and hard-won lessons with new methods.

---

## Phase 2 — Agent memory: events, revisions, branches

**Goal: An agent can pick up where it (or another agent) left off, explore alternatives, and compare approaches.**

This is the north star's core architecture, but motivated by agent workflows rather than abstract event-sourcing elegance.

### 2.1 Event store (minimal)

- [x] `EventEnvelope<T>` type with id, projectId, actor (human | agent), type, payload, timestamp.
- [x] `EventStore` interface: `append()`, `readStream()`.
- [x] In-memory implementation for dev. SQLite for persistence.
- [x] Start with 5 event types — no more:
  - `source.replaced` — full source snapshot
  - `scene.param_set` — parameter change
  - `evaluation.completed` — evaluation bundle reference
  - `agent.intent_declared` — what the agent was trying to do
  - `agent.capability_gap` — what the agent couldn't do

**On the actor field:** Every event records whether it came from a human or an agent, and which agent. This is the foundation for agent learning (Phase 4) and for humans reviewing what an agent did.

### 2.2 Revisions

- [x] `Revision` type: checkpoint over a batch of events, with source hash and evaluation bundle reference.
- [x] Agent creates a revision after each meaningful modeling step (not every keystroke).
- [x] Revisions are addressable: an agent can retrieve the source, stats, and validation state at any revision.

### 2.3 Branches

- [x] `Branch` type: named pointer to a head revision.
- [x] An agent can branch to explore an alternative approach without losing the current one.
- [x] `compare_branches(a, b)` → structured diff of geometry, params, validation at branch heads.
- [x] An agent (or human) can pick the better branch and continue from there.

**Why branches matter for agents:** Agents naturally explore. "Try a thicker wall" and "try a different handle shape" are parallel explorations. Without branches, the agent has to remember (or reconstruct) the alternative. With branches, it forks, evaluates both, and picks the winner — or asks the human to choose.

### 2.4 Session as cursor

- [ ] `Session` becomes a cursor over a branch. It accrues events and periodically checkpoints to revisions.
- [ ] Multiple agents (or an agent + a human) can observe the same branch. Write coordination comes later.

**Grounding the north star:** The north star's 3-layer model (events → revisions → sessions) is right, but the motivation here is concrete: agents need memory, agents need branching, agents need comparison. The event store is the implementation, not the product. If a simpler implementation (e.g., just saving source snapshots with metadata to SQLite) delivers the same agent UX, that's fine too.

---

## Phase 3 — Agent learning & self-improvement

**Goal: The system gets smarter by watching agents work.**

The north star calls agent learning events "gold." Agreed — this is what makes CadLad a platform, not just a tool.

### 3.1 Structured agent telemetry

- [ ] `agent.intent_declared` events record what the agent was trying to build and why.
- [ ] `agent.capability_gap` events record what the agent couldn't do: missing primitives, API limitations, validation gaps.
- [ ] `agent.workaround_recorded` events record hacks the agent used to work around limitations.

### 3.2 Capability gap aggregation

- [ ] A reducer that aggregates capability gaps across all agent sessions.
- [ ] "Agents hit the shell-on-concave-shape problem 47 times this month" → prioritize explicit inner-void subtraction helper.
- [ ] "Agents keep trying to create threads/gears and falling back to crude approximations" → prioritize thread primitive.

### 3.3 Auto-generated API improvements

- [ ] When a workaround pattern appears repeatedly, flag it for promotion to a first-class API method.
- [ ] Example: if agents repeatedly do `box(...).subtract(box(...).translate(...))` to create slots, that suggests a `slot()` primitive.
- [ ] The system proposes new primitives/helpers based on observed agent behavior.

### 3.4 Model quality corpus

- [ ] Successful models (human-approved, validation-passing) become training examples.
- [ ] Failed attempts (with the failure reason) become negative examples.
- [ ] This corpus improves future agent performance — not by fine-tuning, but by providing better few-shot examples and domain rules for the MCP context.

---

## Phase 4 — Constraint system & design rules

**Goal: The system enforces design intent, so agents don't have to carry domain knowledge in their context window.**

### 4.1 Constraint-based sketch solver

- [ ] `Sketch.constrained()` API: define sketches via geometric constraints (coincident, perpendicular, tangent, equal-length, fixed-distance) instead of explicit coordinates.
- [ ] Constraint solver resolves concrete points from constraint graph + driving dimensions.
- [ ] Sketches stay fully-constrained even when parameters change drastically — no broken geometry.
- [ ] This is the highest-complexity item from the Design Intent initiative and depends on Phase 1.5 sketch profile work being stable.

### 4.2 Declarative constraints

- [ ] `constraint("wall_thickness", { min: mm(2) })` — checked after every geometry operation.
- [ ] `constraint("symmetry", { axis: "X" })` — warn on asymmetry.
- [ ] `constraint("clearance", { between: ["lid", "base"], min: mm(0.5) })` — inter-part spacing.
- [ ] `constraint("max_overhang", { angle: 45 })` — 3D printing constraint.

### 4.3 Manufacturing profiles

- [ ] `profile("fdm_printing", { layerHeight: 0.2, nozzle: 0.4 })` — activates relevant constraints automatically.
- [ ] `profile("injection_molding", { material: "ABS" })` — draft angles, wall thickness, gate placement.
- [ ] `profile("cnc_milling", { tool: 3 })` — minimum radius, max depth, accessibility.

An agent says "I'm designing for FDM printing" and gets automatic wall thickness, overhang, and bridging checks. No domain knowledge required in the prompt.

### 4.4 Constraint-aware suggestions

- [ ] When a constraint is violated, the system doesn't just report it — it suggests a fix.
- [ ] "Wall thickness is 1.2mm at [x,y,z]. Minimum is 2mm. Suggested: increase shell thickness from 1.5 to 2.5."
- [ ] These suggestions are returned as structured data, not prose, so agents can act on them programmatically.

---

## Phase 5 — Export, ecosystem & human UX

This phase is last not because it's unimportant, but because agents don't export files — humans do, after approving the agent's work. The human-facing features become the "last mile" of an agent-driven workflow.

### 5.1 Export formats

- [ ] 3MF — color/material metadata, assembly structure. Primary output for 3D printing services.
- [ ] glTF/GLB — web-native, preserves color. For sharing and embedding.
- [ ] OBJ — rendering pipelines.
- [ ] STEP — industry interchange. Hard (mesh → BREP), but important for CNC workflows. Investigate Manifold's STEP support or external post-processing.

### 5.2 Design Intent studio UX

- [ ] **Design Intent score badge** (0–100%) in studio toolbar — based on how many design intent hints fire (magic numbers, missed symmetry, deep boolean chains, etc.). Visual incentive for clean parametric modeling.
- [ ] **Hint → line navigation**: clicking a design intent hint in the hint panel navigates Monaco to the offending line.
- [ ] **Feature dependency graph**: for `defineScene()` models, visualize the feature tree and reference relationships in a side panel. Shows which features depend on which datums/planes.
- [ ] **Tool body wireframe toggle**: show/hide tool bodies as translucent wireframe overlays in the viewport for debugging boolean operations.

### 5.3 Studio as review tool

Reposition the studio from "where you model" to "where you review what the agent built":

- [ ] Revision timeline: scrub through the agent's modeling history, see what changed at each step.
- [ ] Branch comparison view: side-by-side 3D views of alternative designs.
- [ ] Validation dashboard: see all diagnostics, constraints, and test results at a glance.
- [ ] Approval workflow: human reviews agent's work, approves or sends back with feedback.

### 5.4 Plugin / extension model

- [ ] Custom primitives: gears, threads, bezier surfaces, sheet metal bends.
- [ ] Custom validators: domain-specific rules packaged as plugins.
- [ ] Custom exporters: additional output formats.
- [ ] This enables the community to extend CadLad without core changes.

### 5.5 Package registry

- [ ] Publish and import reusable components (`cadlad add @cadlad/fasteners`).
- [ ] Agents can discover and use community components via MCP tools.
- [ ] Version-pinned dependencies in project config.

### 5.6 Platform decoupling

- [ ] Define platform interfaces: `EventStore`, `ArtifactStore`, `EventBus`.
- [ ] Local backend (SQLite + filesystem) for desktop/CLI.
- [ ] Cloudflare backend (Durable Objects + R2) for cloud.
- [ ] Git projection: a reducer that emits git commits from revisions, for teams that want git-based review workflows.

---

## What the north star gets right

1. **The big separation** (transport / persistence / source / artifacts / evaluation) is the correct decomposition. The current codebase braids these together in the studio's live evaluation path.

2. **Event-sourced, revision-checkpointed, source-materialized** is the right data model — and it's even more right when agents are primary users, because agents need addressable history to resume work, compare alternatives, and learn from past attempts.

3. **Agent learning events are gold.** Most tools treat agents as consumers. CadLad can treat them as participants whose struggles drive the roadmap. This is a genuine competitive advantage.

4. **Evaluation bundles with render as optional/late.** For agents, this isn't a nice-to-have — it's the difference between a 200ms feedback loop (geometry stats) and a 5-second feedback loop (render + screenshot + vision).

5. **Git as projection, not substrate.** Agents produce events at high frequency. Git can't keep up as a runtime store. But humans reviewing agent work want git-like diffs and history. Projection is the right answer.

## Where the north star needs grounding

1. **Event taxonomy before usage is still risky.** Even with agents as primary users, start with 5 event types and expand. The agent learning events (`intent_declared`, `capability_gap`, `workaround_recorded`) are worth including from day one because they're the unique value — but don't define `scene.feature_added` until the feature-level MCP tools actually emit it.

2. **Semantic merge is still years away.** Agents branch and compare, but merging two agent-generated `.forge.ts` files at the scene-graph level requires rock-solid feature identity that `defineScene()` doesn't yet provide. Source-level merge (text diff) first. It's honest and debuggable.

3. **The collaboration model assumes humans collaborate with humans.** The more interesting collaboration is agent-agent and human-agent. An agent proposes a design; a human reviews and redirects; the agent iterates. That's not traditional multi-user collaboration — it's a review/approval loop. Design for that interaction pattern first.

4. **No mention of performance or cost.** Agents will evaluate models hundreds of times per session. Manifold WASM evaluation needs to be fast, which it is for simple models — but complex assemblies with many booleans will slow down. Geometry caching (by source hash), incremental evaluation (only rebuild changed features), and evaluation budgets (agent can't burn infinite compute) are practical concerns.

5. **The Cloudflare decoupling matters more with agents.** If agents are the primary users, they're hitting the backend constantly. The local SQLite backend isn't just "nice for offline" — it's "necessary for fast, cheap agent iteration." An agent shouldn't need a network round-trip to evaluate a model.

---

## Sequencing principles

1. **Feedback speed is everything.** An agent that gets structured geometry stats in 200ms will outperform one that waits 5 seconds for a screenshot. Phase 0 is the highest-leverage investment.

2. **Semantic operations over raw code.** Every MCP tool that lets an agent express intent instead of writing implementation reduces error rate and speeds iteration. Phase 1 is the agent's primary interface improvement.

3. **Design intent reduces iteration.** An agent that models half and mirrors, uses datums instead of magic numbers, and batch-subtracts with tool bodies produces models that survive parameter changes on the first try. Phase 1.5 teaches pro patterns through API affordances and advisory hints — the system rewards good modeling practice.

4. **Memory enables learning.** An agent with revision history and branching explores design space more effectively than one that starts fresh each session. Phase 2 is the agent's long-term memory.

5. **The system should encode domain knowledge, not the agent's prompt.** Manufacturing constraints, printability rules, and structural checks belong in the platform. The agent's context window should be spent on the user's design intent, not on "remember to oversize boolean cutters by 2mm." Phase 4 moves knowledge from CLAUDE.md into the runtime.

6. **Human UX is the review layer, not the modeling layer.** The studio's job shifts from "where you model" to "where you approve." Design the human experience around reviewing, comparing, and redirecting agent work — not around manual modeling.

7. **Don't break the 24 projects.** They're the test suite, the gallery, the proof, and (increasingly) the training corpus for agents. Every change must keep them working.
