# CadLad Roadmap

> Derived from the [north star vision](./cadlad_north_star.md), grounded in the current state of the codebase as of April 2026.

---

## Where we are today

CadLad is a working code-first parametric 3D CAD system. The core loop — write `.forge.ts` → evaluate → render → iterate — is solid:

- **Engine**: Manifold WASM kernel with 11 primitives, booleans, transforms, edge treatments, shell, draft, patterns. ~30 methods on `Solid`.
- **API**: `param()`, `Sketch`, `assembly()`, `defineScene()` with 5-stage layered validation (types → semantic → geometry → stats → tests).
- **Studio**: Monaco + Three.js + parameter sliders + live evaluation. Live session client with WebSocket/REST.
- **CLI**: `run`, `validate`, `export` (STL). Watch mode.
- **Worker**: Cloudflare backend with Durable Objects, OAuth 2.1, MCP server for Claude/ChatGPT.
- **Gallery**: Auto-discovers projects, interactive viewers, high-contrast mode.
- **24 example projects** using `defineScene()` strict envelope.
- **12 test suites**, ~1700 lines of tests.

What's missing is everything above the single-session level: history, branching, collaboration, and the infrastructure to support agent-driven iteration without depending on screenshots for every feedback cycle.

---

## Phase 0 — Foundations (current → near-term)

Stabilize what exists. Reduce friction in the modeling-and-evaluation loop before adding architectural complexity.

### 0.1 Tighten the geometry feedback loop

The north star correctly identifies over-reliance on screenshots. Today, an agent must render and screenshot to know if a model is broken. That's expensive and slow.

**Do now:**
- [ ] Expose `numComponents()`, `volume()`, `surfaceArea()`, `boundingBox()` as first-class validation checks in `defineScene()` validators (they exist on `Solid` but aren't wired into the standard validation pipeline).
- [ ] Add geometry sanity checks to layered validation: empty result, degenerate bbox (any dimension < epsilon), disconnected components (when unintended), volume sanity (non-negative, within expected range).
- [ ] Return structured `GeometryStats` from every evaluation, not just when a studio panel requests it. Make it part of `ModelResult`.

**Why first:** Every later phase benefits from fast, non-visual feedback. Agents iterate faster. Tests become more meaningful. Validation catches real problems before render.

### 0.2 Export format coverage

STL export exists but is the bare minimum for a CAD tool.

- [ ] STEP export (via Manifold or post-processing) — industry standard for CNC/3D printing services.
- [ ] 3MF export — modern replacement for STL, supports color/material metadata.
- [ ] OBJ export — useful for rendering pipelines and game engines.
- [ ] glTF/GLB export — web-native 3D format, preserves color and assembly structure.

**Pragmatic note:** STEP is hard because Manifold works in mesh space, not BREP. This may require an external library or a "best-effort tessellated STEP" approach. Don't let perfect block useful — 3MF and glTF are achievable now and cover most real workflows.

### 0.3 CLI ergonomics

- [ ] `cadlad init <name>` — scaffold a new project directory with boilerplate `defineScene()`.
- [ ] `cadlad gallery` — generate a static gallery HTML from `projects/` (no dev server needed).
- [ ] `cadlad diff <file> --rev <hash>` — visual diff between model revisions (geometry stats comparison, even without full render).

---

## Phase 1 — Event store & revision model

This is the north star's "smallest viable architecture shift." The goal: decouple session state from history, make modeling steps addressable and replayable.

### 1.1 Event envelope & store abstraction

- [ ] Define `EventEnvelope<T>` type (as specified in north star: id, projectId, branchId, actor, type, payload, ts, causation/correlation IDs).
- [ ] Implement `EventStore` interface: `append()`, `readStream()`.
- [ ] Start with an in-memory implementation for local dev and a SQLite implementation for CLI/desktop persistence.
- [ ] Migrate current live-session patch writes to emit events. The existing `live-session-client.ts` WebSocket messages become the transport for events, not the events themselves.

**What the north star gets right:** The event taxonomy is well-considered. Authoring events (`source.replaced`, `scene.feature_added`, `scene.param_set`), workflow events (`session.created`, `branch.created`), and evaluation events (`geometry.built`, `validation.completed`) are the right categories.

**Where to be cautious:** Don't over-engineer the event taxonomy before you have real usage patterns. Start with `source.replaced` and `scene.param_set` — those cover 90% of current activity. Add structural events (`scene.feature_added` etc.) only when the scene-contract layer is mature enough to produce them reliably.

### 1.2 Revisions & checkpoints

- [ ] Define `Revision` type (as specified: id, parentRevisionIds, eventIds, summary, materialized hashes).
- [ ] Implement revision creation: collapse a batch of events into a named checkpoint.
- [ ] Store source snapshot hash at each revision. This is the "authored artifact at checkpoint."
- [ ] Wire into CLI: `cadlad commit "added gable roof"` creates a revision.

### 1.3 Separate session from history

- [ ] `Session` becomes a live cursor over a branch head, not an owner of state.
- [ ] Session accrues uncommitted events; explicit "checkpoint" promotes them to a revision.
- [ ] Multiple sessions can attach to the same branch (read model; write requires coordination, but that's Phase 3).

**Hard truth the north star doesn't fully address:** For local single-user dev (which is the primary use case today), this is over-engineering unless it provides a tangible UX benefit. The benefit is **undo/redo at the modeling-step level** and **branch-and-compare for design exploration.** Lead with those UX features; the event architecture is the implementation, not the product.

---

## Phase 2 — Evaluation bundles & artifact pipeline

### 2.1 First-class evaluation bundles

- [ ] Define `EvaluationBundle` (as in north star: typecheck, semantic validation, geometry validation, stats, tests, render — all optional).
- [ ] Every model evaluation produces a bundle. Store it as an artifact linked to the triggering event/revision.
- [ ] Make render the *last* and *optional* stage. An agent or CI pipeline can stop at geometry validation if that's sufficient.

### 2.2 Artifact store abstraction

- [ ] Define `ArtifactStore` interface: store/retrieve blobs by kind and revision.
- [ ] Local implementation: filesystem (already partially exists in snapshot workflow).
- [ ] Cloud implementation: R2/S3 behind the same interface.
- [ ] Artifact kinds: screenshot, mesh, stats, validation-report, test-report, reference-image, STL, 3MF.

### 2.3 Reference-image-driven validation

Today, reference images exist in `projects/*/reference/` but aren't used programmatically.

- [ ] Define a "reference match" validator: compare rendered output against reference image (perceptual hash or SSIM).
- [ ] Wire into `defineScene()` tests: `referenceMatch("./reference/front.png", { tolerance: 0.95 })`.
- [ ] This replaces manual screenshot comparison for regression testing.

**Note on screenshots vs. geometry:** The north star wants less screenshot dependence — agreed. But for aesthetic evaluation (does this look like a coffee mug?), vision is irreplaceable. The right move is: use geometry validators for structural correctness, use render comparison for aesthetic regression, use agent vision for open-ended design evaluation. Don't eliminate screenshots; demote them from "primary feedback" to "confirmation and aesthetics."

---

## Phase 3 — Branching, collaboration & merge

### 3.1 Local branching

- [ ] `Branch` type: pointer to a head revision on a project.
- [ ] `cadlad branch <name>` — create branch from current revision.
- [ ] `cadlad switch <branch>` — move session to branch head.
- [ ] `cadlad compare <branch-a> <branch-b>` — diff geometry stats, param values, validation results.
- [ ] Studio UI: branch picker, side-by-side comparison view.

### 3.2 Merge

The north star recommends a 3-tier merge hierarchy: event merge → scene merge → source merge. This is intellectually elegant but practically complex.

**Pragmatic approach:**
- [ ] Start with **source-level merge** (text diff/patch on `forge.ts`). It's what developers understand, it's debuggable, and it works today.
- [ ] Add **scene-level merge** only for `defineScene()` projects where features have stable IDs. Merge by feature ID: if two branches modify different features, auto-merge. If same feature, conflict.
- [ ] Defer event-level merge indefinitely. The complexity-to-benefit ratio is poor until the event model is battle-tested.

### 3.3 Multi-user collaboration

- [ ] Real-time presence: see who's looking at what branch/revision.
- [ ] Async collaboration: review a revision, leave comments (linked to features or geometry regions).
- [ ] Live co-editing: shared session with OT/CRDT on source text. This is the hardest part and should come last.

**The north star's transport recommendation is sound:** keep it thin (WebSocket/SSE), use an `EventBus` abstraction, avoid Cloudflare coupling. The existing Worker is a reasonable starting implementation, but the `EventBus`/`EventStore` interfaces should be defined such that the Worker is an adapter, not the architecture.

---

## Phase 4 — Agent-native modeling

This is where CadLad differentiates from traditional CAD. The system should be as natural for an AI agent to operate as for a human.

### 4.1 Semantic MCP tools

Current MCP server supports basic operations. Expand to:

- [ ] `add_feature(kind, params)` — add a feature by semantic kind (hole, fillet, shell, etc.) rather than raw code injection.
- [ ] `modify_feature(id, params)` — modify an existing feature's parameters.
- [ ] `validate()` — run full evaluation bundle, return structured results (not just screenshots).
- [ ] `compare_revisions(a, b)` — structured diff of geometry, params, validation.
- [ ] `suggest_improvements()` — run heuristic analysis (draft angles for molding, wall thickness for printability, etc.).

### 4.2 Agent learning events

The north star identifies these as "gold" — agreed.

- [ ] `agent.intent_declared` — what the agent was trying to do.
- [ ] `agent.capability_gap_reported` — what the agent couldn't do and why.
- [ ] `agent.workaround_recorded` — how the agent worked around a limitation.

These events become the input for roadmap prioritization. If agents keep reporting the same capability gap, that's a signal to build it.

### 4.3 Design intent & constraint system

Beyond `defineScene()` validators (which are post-hoc checks), support **declarative constraints**:

- [ ] `constraint("wall_thickness", { min: mm(2) })` — enforced during modeling, not just validated after.
- [ ] `constraint("symmetry", { axis: "X" })` — flag asymmetry as a warning.
- [ ] `constraint("clearance", { between: ["lid", "base"], min: mm(0.5) })` — inter-part constraints.

This is hard to implement fully (constraint solvers are a deep rabbit hole), but even a "check constraints after every operation and warn" approach is valuable.

---

## Phase 5 — Platform & ecosystem

### 5.1 Decouple from Cloudflare

The north star is explicit: Cloudflare is an adapter, not the architecture.

- [ ] Define platform interfaces: `EventStore`, `ProjectionStore`, `ArtifactStore`, `EventBus`, `RevisionService`, `EvaluationService`.
- [ ] Implement local backend (SQLite + filesystem) for desktop/CLI use.
- [ ] Implement Cloudflare backend (Durable Objects + R2) for cloud use.
- [ ] Implement Postgres backend for self-hosted server use.
- [ ] All three share the same interfaces. Studio doesn't know which backend it's talking to.

### 5.2 Git as a projection

- [ ] A `GitProjection` reducer that emits git commits from revisions.
- [ ] `cadlad sync` — push current revision history to a git remote.
- [ ] This preserves git's strengths (diff, review, collaboration) without making it the runtime database.

### 5.3 Plugin / extension model

- [ ] Custom primitives: register new geometry generators (e.g., gears, threads, bezier surfaces).
- [ ] Custom validators: domain-specific checks (injection molding rules, 3D printing constraints).
- [ ] Custom exporters: additional output formats without core changes.
- [ ] Custom UI panels: extend studio with domain-specific tools.

### 5.4 Package registry

- [ ] Publish and import reusable model components (`cadlad add @cadlad/fasteners`).
- [ ] Version-pinned dependencies in project config.
- [ ] This is a long-term play but critical for building an ecosystem.

---

## What the north star gets right

1. **The big separation** (transport / persistence / source / artifacts / evaluation) is the correct decomposition. The current codebase braids several of these together in the studio's live evaluation path.

2. **Event-sourced, revision-checkpointed, source-materialized** is the right data model for a tool where both humans and agents need to understand, replay, and branch history.

3. **Git as projection, not substrate** avoids the trap of forcing real-time collaboration through a tool designed for async text snapshots.

4. **Agent learning events** are genuinely novel. Most developer tools treat agents as consumers; CadLad can treat them as participants whose struggles inform the roadmap.

5. **Evaluation bundles with render as optional/late** correctly identifies that screenshots are expensive confirmation, not cheap feedback.

## Where the north star needs grounding

1. **Premature abstraction risk.** The 3-layer event model (events → revisions → sessions) is architecturally sound but heavy for a project with 24 example models and zero real multi-user sessions. Ship the UX benefits (undo, branching, comparison) first; refactor toward the clean architecture as usage patterns emerge.

2. **Event taxonomy before usage.** Defining 20+ event types before you have real event flow is speculative. Start with 3-5 events (`source.replaced`, `scene.param_set`, `revision.created`, `geometry.built`, `validation.completed`) and expand as actual needs arise.

3. **Semantic merge is years away.** The 3-tier merge hierarchy (event → scene → source) is elegant in theory. In practice, text-level merge on `.forge.ts` files handles 95% of cases. Scene-level merge requires rock-solid feature identity, which `defineScene()` is only beginning to provide. Event-level merge requires a mature, stable event schema. Do source merge first, and well.

4. **Cloudflare decoupling is urgent but the replacement isn't.** The Worker currently bundles routing, identity, state, and fanout. Defining interfaces is the right first step — but don't build three backend implementations in parallel. Build the local SQLite backend (it's the one that enables offline desktop use) and keep Cloudflare as the cloud option. Postgres can wait until there's a self-hosting demand signal.

5. **The geometry feedback gap is the real bottleneck.** The north star talks about reducing screenshot dependence, but the actual missing piece is structured geometry analysis: is this model printable? Are clearances sufficient? Is the wall thickness uniform? These domain-specific checks are what let agents iterate fast. They matter more than event architecture.

6. **No mention of performance.** As models grow in complexity (more features, more booleans, larger meshes), evaluation time will become a bottleneck. Incremental evaluation (only rebuild what changed), geometry caching (by source hash), and worker-thread parallelism for multi-part assemblies are practical concerns the north star doesn't address.

---

## Sequencing principles

1. **Make the current loop faster before adding layers.** Geometry feedback, export formats, CLI ergonomics — these benefit every user and every agent today.

2. **Ship UX, not architecture.** Users want undo, branching, and comparison. They don't care that it's backed by an event store. Build the features; let the architecture emerge to support them.

3. **Agents are the forcing function.** Every improvement to structured feedback (geometry validators, evaluation bundles, semantic MCP tools) disproportionately benefits agent-driven workflows, which is CadLad's differentiator.

4. **Local-first, cloud-optional.** The desktop/CLI experience should be fully capable without a network connection. Cloud features (collaboration, shared sessions) layer on top.

5. **Don't break the 24 projects.** Every architectural change must keep the existing `defineScene()` models working. They are the test suite, the gallery, and the proof that the system works.
