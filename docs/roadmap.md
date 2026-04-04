# CadLad Roadmap

> Derived from the [north star vision](./cadlad_north_star.md), grounded in a full codebase audit as of April 2026.
>
> **Key assumption: agents are the primary users.** Humans use the studio for review, visualization, and final approval. Agents do the modeling. Every priority decision flows from this.

---

## Phase docs

Each phase has its own detailed doc with implementation status, file references, and next actions:

| Phase | Doc | Status | Focus |
|---|---|---|---|
| **1** | [roadmap-phase-1.md](./roadmap-phase-1.md) | ~75% done | Machine-readable feedback & semantic MCP surface |
| **2** | [roadmap-phase-2.md](./roadmap-phase-2.md) | ~90% done | Agent memory: events, revisions, branches |
| **3** | [roadmap-phase-3.md](./roadmap-phase-3.md) | ~60% done | Agent learning & self-improvement |
| **4** | roadmap-phase-4.md (pending) | ~40% done | Design intent, constraints & manufacturing |

---

## Where we are today (April 2026 audit)

CadLad is a working code-first parametric 3D CAD system. The core loop — write `.forge.ts` -> evaluate -> render -> iterate — works end-to-end.

### What's real and working

**Engine** (~560 LOC `src/engine/solid.ts`):
- Manifold WASM kernel with 11 primitives, full booleans (including batch: `unionAll`, `subtractAll`, `intersectAll`, `quarterUnion`), transforms, patterns, edge treatments, shell, draft
- ~30 methods on `Solid`, all tested

**API** (~2,000 LOC across `src/api/`):
- `param()` with slider-driven parameters
- `Sketch` with constraint solver (5 constraint types, iterative resolution, driving dimensions)
- `assembly()` for multi-part grouping
- `defineScene()` with 5-stage layered validation (types -> semantic -> geometry -> stats -> tests)
- Reference geometry: `plane`, `axis`, `datum`, `translateTo()`
- Declarative constraints: `wall_thickness`, `symmetry`, `clearance`, `max_overhang`
- Common sketch profiles: `slot`, `lShape`, `channel`, `tShape`

**Evaluation pipeline** (`src/validation/layered-validation.ts`):
- Structured `EvaluationBundle` with all 5 stages + stats + tests
- Built-in geometry validators (empty body, degenerate bbox, disconnected components)
- Declarative constraint enforcement (wall thickness, symmetry, clearance, overhang)
- Render is optional — agents get full structured feedback without pixels

**MCP tools** (`mcp/src/server.ts`, `worker/src/mcp-handler.ts`):
- Read tools: `evaluate`, `get_stats`, `get_validation`, `compare`, `list_features`
- Domain analysis: `check_printability`, `check_moldability`, `suggest_improvements` (heuristic, not structural)
- Agent telemetry: `submit_capability_gap`, `record_workaround`, `get_api_improvements`
- Session management: `create_branch`, `checkout_branch`, `compare_branches`, revision history

**Worker/backend** (~4,400 LOC `worker/`):
- Cloudflare Durable Objects with event store (InMemory + SQLite backends)
- Revisions with source hashing, branches with comparison, session cursor
- Agent telemetry: intent, capability gaps, workaround recording
- Capability gap aggregation with promotion-threshold logic
- OAuth 2.1 for live sessions

**Studio** (`src/studio/`):
- Monaco + Three.js + parameter sliders + live evaluation
- Patch history, branch UI, inline diagnostics
- 3-point lighting, edge strokes, auto-color, high-contrast mode

**Gallery**: Auto-discovers 25 projects, interactive viewers

**CLI**: `run`, `validate` (with `--watch`), `export` (STL), `studio` launcher

**Tests**: 17 test suites, ~2,000 lines, covering engine/api/validation/worker

### What's genuinely NOT done (marked [ ] in phase docs)

**Phase 1 gaps:**
- `cadlad run --json` — CLI agents get no structured output
- `add_feature` / `modify_feature` / `remove_feature` MCP tools — the code generation layer doesn't exist
- Domain analysis is heuristic-only (bbox proxies), not structural (ray-cast, per-face)

**Phase 2 gaps:**
- All memory features (events, revisions, branches) are **worker-only** — local CLI agents can't use them
- No local SQLite event store, no CLI commands for branch/revision management

**Phase 1.5 gaps (now folded into Phase 4):**
- Tool bodies (`toolBody()`) — not implemented
- Design intent hints — only empty-body detection exists; magic numbers, repeated geometry, missed symmetry, deep boolean chains, unparameterized dimensions are all unstarted
- Assembly-preserving patterns (`mirrorAssembly`, `linearPatternAssembly`, `circularPatternAssembly`) — not implemented
- Parametric robustness testing (`paramSweepTest`) — not implemented

**Phase 3 gaps:**
- Model quality corpus (training examples from approved/failed models) — not implemented
- Capability gap dashboard/reporting beyond raw aggregation — not implemented

**Phase 4 gaps:**
- Manufacturing profiles (`profile("fdm_printing", ...)`) — not implemented
- Constraint-aware fix suggestions — not implemented
- Full constrained sketch API (beyond current 5 constraint types) — partial

**Phase 5 (export, human UX, ecosystem):**
- Export formats (3MF, glTF, STEP) — not implemented
- Studio as review tool (revision timeline, branch comparison, approval workflow) — not implemented
- Plugin/extension model, package registry — not implemented

### Infrastructure debt

These aren't roadmap features but affect every agent working on the codebase:

- **vitest not installed locally** — `npm run test` exits 0 without running tests. Tests only run in CI or with manual vitest install.
- **eslint not installed locally** — `npm run lint` exits 0 without linting.
- **typecheck suppresses 17 files** with missing package deps (Manifold WASM, Three.js, Monaco, vitest). No genuine type errors, but the suppression masks potential issues.

---

## The agent bottleneck (updated)

Today an agent modeling in CadLad hits these walls, in order of pain:

1. **No structured CLI output.** The MCP tools return structured data, but `cadlad run` returns human-readable text. CLI-based agents must parse prose or use the MCP server.

2. **No semantic write operations.** Agents can read model state through MCP tools but must write raw `.forge.ts` code. There's no `add_feature("through_hole", ...)` that generates correct code. This is the biggest remaining gap.

3. **Design intent is advisory, not enforced.** The constraint system checks `wall_thickness` and `symmetry` post-hoc, but nothing in the system *teaches* agents to model well (use datums, mirror for symmetry, batch booleans with tool bodies). The hints system is a stub.

4. **Domain knowledge is still in CLAUDE.md.** The printability/moldability tools are heuristic proxies. Real DFM analysis (minimum wall by ray-cast, undercut detection) would let agents skip the domain knowledge entirely.

5. **No local agent memory.** Event store, revisions, and branches only work through the Cloudflare worker. A local agent has no revision history, no branching, no comparison.

---

## Sequencing principles

1. **Feedback speed is everything.** Structured stats in 200ms beat a 5s screenshot. Phase 1 completion (especially CLI JSON) is the highest-leverage remaining investment.

2. **Semantic operations over raw code.** Every MCP tool that lets an agent express intent instead of writing implementation reduces error rate. Feature-level edit tools are the biggest missing piece.

3. **Design intent reduces iteration.** An agent that mirrors, uses datums, and batch-subtracts with tool bodies produces models that survive parameter changes on the first try. Phase 4 teaches pro patterns through API affordances and advisory hints.

4. **Memory enables learning.** Revision history and branching let agents explore design space. Phase 2 is done in the worker; local parity is the gap.

5. **The system should encode domain knowledge.** Manufacturing constraints, printability rules, and structural checks belong in the platform. Phase 4 moves knowledge from CLAUDE.md into the runtime.

6. **Human UX is the review layer.** The studio's job shifts from "where you model" to "where you approve." Design the human experience around reviewing agent work.

7. **Don't break the 25 projects.** They're the test suite, the gallery, and the training corpus. Every change must keep them working.

---

## What the north star gets right

1. **The big separation** (transport / persistence / source / artifacts / evaluation) is the correct decomposition.
2. **Event-sourced, revision-checkpointed, source-materialized** is the right data model for agent-primary workflows.
3. **Agent learning events are gold.** CadLad treats agents as participants whose struggles drive the roadmap.
4. **Evaluation bundles with render as optional/late.** This is implemented and working.
5. **Git as projection, not substrate.** Agents produce events at high frequency. Git can't keep up as a runtime store.

## Where the north star needs grounding

1. **Event taxonomy before usage is risky.** Start with the 6 event types we have and expand only when tools emit new types.
2. **Semantic merge is years away.** Source-level merge (text diff) first. It's honest and debuggable.
3. **The collaboration model should be agent-human review loops**, not multi-user real-time editing.
4. **Performance matters.** Complex assemblies with many booleans will slow down. Geometry caching by source hash and incremental evaluation are practical concerns.
5. **Local parity matters more than cloud features.** If agents are the primary users, a local SQLite backend isn't "nice for offline" — it's necessary for fast, cheap iteration.
