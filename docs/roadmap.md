# CadLad Roadmap

> Derived from the [north star vision](./cadlad_north_star.md), grounded in a full codebase audit as of April 2026.
>
> **Key assumption: agents are the primary users.** Humans use the studio for review, visualization, and final approval. Agents do the modeling. Every priority decision flows from this.

---

## Phase docs

Each phase has its own detailed doc with implementation status, file references, and next actions:

| Phase | Doc | Status | Focus |
|---|---|---|---|
| **1** | [roadmap-phase-1.md](./roadmap-phase-1.md) | ~90% done | Machine-readable feedback & semantic MCP surface |
| **2** | [roadmap-phase-2.md](./roadmap-phase-2.md) | ~90% done | Agent memory: events, revisions, branches |
| **3** | [roadmap-phase-3.md](./roadmap-phase-3.md) | ~60% done | Agent learning & self-improvement |
| **4** | [roadmap-phase-4.md](./roadmap-phase-4.md) | ~70% done | Design intent, constraints & manufacturing |
| **5** | [roadmap-phase-5.md](./roadmap-phase-5.md) | not started | Export, ecosystem & human UX |

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
- Read tools: `evaluate`, `get_stats`, `get_validation`, `compare`
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

**Gallery**: Auto-discovers the retained `.forge.ts` corpus, interactive viewers

**CLI**: `run`, `validate` (with `--watch`), `export` (STL), `studio` launcher

**Tests**: 17 test suites, ~2,000 lines, covering engine/api/validation/worker

### What's genuinely NOT done (marked [ ] in phase docs)

**Phase 1 gaps:**
- Domain analysis is heuristic-only (bbox proxies), not structural (ray-cast, per-face)

**Phase 2 gaps:**
- All memory features (events, revisions, branches) are **worker-only** — local CLI agents can't use them
- No local SQLite event store parity with the worker-backed event model

**Phase 3 gaps:**
- Model quality corpus (training examples from approved/failed models) — not implemented
- Capability gap dashboard/reporting beyond raw aggregation — not implemented

**Phase 4 gaps:**
- Manufacturing profiles (`profile("fdm_printing", ...)`) — not implemented
- Constraint-aware fix suggestions — not implemented
- Design intent hints need precision/recall refinement (baseline heuristics are implemented)
- Full constrained sketch API (beyond current 5 constraint types) — partial

**Phase 5 (export, human UX, ecosystem):**
- Export formats (3MF, glTF, STEP) — not implemented
- Studio as review tool (revision timeline, branch comparison, approval workflow) — not implemented
- Plugin/extension model, package registry — not implemented

### Infrastructure debt

These aren't roadmap features but affect every agent working on the codebase:

- Check tooling repaired: run `npm ci`, then `npm run typecheck:full`, `npm run lint`, `npm test`, and `npm run build`. Missing local tools and all diagnostics fail checks; no silent skips or error suppression.
- Gallery and snapshots use `content/projects/*/*.forge.ts`. Legacy files are unsupported. The corpus test validates the actual Vite glob and CLI/gallery geometry parity for every retained model.

---

## The agent bottleneck (updated)

Today an agent modeling in CadLad hits these walls, in order of pain:

1. **No semantic write operations.** Agents still write raw `.forge.ts`; higher-level intent transforms are not available yet.

2. **Design intent is advisory, not enforced.** The constraint system checks `wall_thickness` and `symmetry` post-hoc; hints exist, but they are guidance rather than automatic remediation.

3. **Domain knowledge is still in CLAUDE.md.** The printability/moldability tools are heuristic proxies. Real DFM analysis (minimum wall by ray-cast, undercut detection) would let agents skip the domain knowledge entirely.

4. **No local agent memory parity.** Event store, revisions, and branches are stronger in worker sessions than local CLI workflows.

---

## Sequencing principles

1. **Feedback speed is everything.** Structured stats in 200ms beat a 5s screenshot. Keep this loop fast and stable for agents.

2. **Semantic operations over raw code.** Every MCP tool that lets an agent express intent instead of writing implementation reduces error rate. Feature-level edit tools are the biggest missing piece.

3. **Design intent reduces iteration.** An agent that mirrors, uses datums, and batch-subtracts with tool bodies produces models that survive parameter changes on the first try. Phase 4 teaches pro patterns through API affordances and advisory hints.

4. **Memory enables learning.** Revision history and branching let agents explore design space. Phase 2 is done in the worker; local parity is the gap.

5. **The system should encode domain knowledge.** Manufacturing constraints, printability rules, and structural checks belong in the platform. Phase 4 moves knowledge from CLAUDE.md into the runtime.

6. **Human UX is the review layer.** The studio's job shifts from "where you model" to "where you approve." Design the human experience around reviewing agent work.

7. **Keep retained fixtures executable.** The corpus is tested; obsolete examples may be deliberately removed.

---

## For agents implementing roadmap items

### Before you start

1. **Read the relevant phase doc** — it has exact file paths, line numbers, and implementation notes.
2. **Run `npm ci` before checks.** Use `npm run typecheck:full` for all runtimes.
3. **Run `npm test`, `npm run lint`, and `npm run build`.** All require local tools and fail on missing dependencies.
4. **Read the code before changing it.** Many "not implemented" items have partial infrastructure already in place (types, interfaces, plumbing). Build on what exists.

### Task dependency graph

Some items must be done in order. Others can be parallelized.

```
Tool bodies (Phase 4.1)              ← done
CLI --json output (Phase 1)          ← done
Design intent hints (Phase 4.2)      ← needs expanded HintContext first
  └── HintContext expansion          ← wire source/features/stats into hints.ts
  └── Individual hint detectors      ← can parallelize after HintContext
Assembly-preserving patterns (Phase 4.3)  ← done
paramSweepTest (Phase 4.4)           ← done
Manufacturing profiles (Phase 4.5)   ← depends on constraint infrastructure (done)
Constraint fix suggestions (Phase 4.6)   ← depends on constraint infrastructure (done)
Feature edit MCP tools (Phase 1.2)   ← hard; needs code generation layer
  └── add_feature                    ← do first, proves the pattern
  └── modify_feature / remove_feature ← depend on add_feature pattern
Local event store (Phase 2)          ← extract from worker, medium-large
Cross-session workaround sharing (Phase 3.5) ← depends on gap aggregation (done)
Model quality corpus (Phase 3.4)     ← needs approval event type first
```

**Best parallelization opportunities** (independent, can run simultaneously):
- Manufacturing profiles + constraint suggestions + local parity event store
- Individual hint detector refinement (precision/recall tuning)
- Phase 3 learning-loop items (workaround sharing + corpus work)

### Implementation conventions

- **New API files** go in `src/api/` (e.g., `src/api/toolbody.ts`)
- **New engine methods** go on `Solid` in `src/engine/solid.ts` using `_derive()` pattern
- **New constraint types** add a case to `src/api/constraints.ts` and enforcement in `src/validation/layered-validation.ts:validateDeclarativeConstraints()`
- **New MCP tools** add to both `mcp/src/server.ts` (tool definition + handler) and the worker endpoint if needed
- **Tests** go in `src/api/__tests__/` or `src/engine/__tests__/` — co-located with the module
- **Runtime sandbox** — if you add a new standalone function agents should use in `.forge.ts`, expose it in `src/api/runtime.ts`'s sandbox object
- **Keep retained corpus tests passing.** Obsolete fixtures can be removed; there is no legacy model compatibility layer.

### Anti-patterns

- **Don't add event types speculatively.** Only add a new event type when a tool or reducer actually emits/consumes it.
- **Don't build MCP write tools that generate raw source code inline.** The code generation for `add_feature` should be a separate, testable module — not string concatenation inside the MCP handler.
- **Don't add heavyweight dependencies.** The constrained sketch solver is deliberately simple (iterative, no symbolic math library). Manufacturing profiles should be lookup tables + constraint config, not simulation engines.
- **Don't optimize for edge cases before the common case works.** The hints system should detect the 3 most common anti-patterns before worrying about false positive rates.

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
