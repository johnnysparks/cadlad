# Phase 5 — Export, Ecosystem & Human UX

> **Status**: Not started. This phase is last because agents don't export files — humans do, after approving the agent's work. The human-facing features become the "last mile" of an agent-driven workflow.
>
> **Depends on**: Phases 1-4 (the export and review features consume the evaluation, revision, and constraint infrastructure)
> **Do not start this phase until Phases 1-4 gaps are addressed.**

---

## Why this is last

Agents iterate on geometry. Humans review, approve, and export. Phase 5 is the human review and output layer. Implementing it before the agent-facing phases (feedback, memory, learning, constraints) are solid would be building the roof before the walls.

**Exception:** If a specific export format is blocking a real user workflow, it can be prioritized out of order. But don't build speculative infrastructure here.

---

## 5.1 Export formats

**Status: NOT STARTED**

Currently only STL export exists (`cadlad export` CLI command).

| Format | Priority | Why | Complexity |
|---|---|---|---|
| **3MF** | high | Color/material metadata, assembly structure. Primary for 3D printing services. | M — XML-based, well-documented spec |
| **glTF/GLB** | high | Web-native, preserves color. For sharing and embedding. | M — good libraries exist (e.g., glTF-Transform) |
| **OBJ** | low | Rendering pipelines. Simple mesh format. | S — trivial |
| **STEP** | low | Industry interchange for CNC. | L — mesh-to-BREP is hard. Investigate Manifold's STEP support or external post-processing. |

**Implementation approach:**
- Export pipeline lives in `src/cli/` (CLI command) and `src/api/export/` (shared logic)
- Each format is a standalone module: `export-3mf.ts`, `export-gltf.ts`, etc.
- Assembly metadata (part names, colors, positions) must survive the export — this is why `assembly()` preserves identity
- Studio gets an Export button that calls the same modules

---

## 5.2 Studio as review tool

**Status: NOT STARTED**

Reposition the studio from "where you model" to "where you review what the agent built":

- [ ] **Revision timeline** — scrub through the agent's modeling history, see what changed at each step. Requires Phase 2 revisions (done in worker, needs studio UI).
- [ ] **Branch comparison view** — side-by-side 3D views of alternative designs. Requires Phase 2 branches (done in worker, needs studio UI).
- [ ] **Validation dashboard** — see all diagnostics, constraints, and test results at a glance. The data exists in `EvaluationBundle`; needs a dedicated UI panel.
- [ ] **Design intent score badge** — 0-100% score in toolbar based on how many design intent hints fire. Requires Phase 4.2 hints (currently a stub).
- [ ] **Approval workflow** — human reviews agent's work, approves or sends back with feedback. Requires Phase 3.4 approval events (not started).

---

## 5.3 Plugin / extension model

**Status: NOT STARTED — do not implement yet**

- Custom primitives (gears, threads, bezier surfaces, sheet metal bends)
- Custom validators (domain-specific rules packaged as plugins)
- Custom exporters (additional output formats)

**Wait until:** The core API is stable enough that plugins won't break on every release. Currently the API is still evolving (Phase 4 adds tool bodies, hints, manufacturing profiles). Stabilize first, then open to extensions.

---

## 5.4 Package registry

**Status: NOT STARTED — do not implement yet**

- `cadlad add @cadlad/fasteners` — publish and import reusable components
- Version-pinned dependencies in project config
- Agents can discover and use community components via MCP tools

**Wait until:** There's a real community producing reusable components. Building registry infrastructure before content exists is premature.

---

## 5.5 Platform decoupling

**Status: NOT STARTED — partially addressed by Phase 2 local parity work**

- [ ] Define platform interfaces: `EventStore`, `ArtifactStore`, `EventBus`
- [ ] Local backend (SQLite + filesystem) for desktop/CLI
- [ ] Cloudflare backend (Durable Objects + R2) for cloud
- [ ] Git projection: a reducer that emits git commits from revisions

**Note:** The Phase 2 "local parity" work (extracting EventStore from the worker for local CLI use) is the first concrete step here. That's tracked in [roadmap-phase-2.md](./roadmap-phase-2.md), not here.

---

## What agents should NOT do in Phase 5

1. **Don't build a plugin system.** The API isn't stable enough yet.
2. **Don't build a package registry.** There's no community content to serve.
3. **Don't build STEP export.** Mesh-to-BREP is a research problem, not an afternoon task.
4. **Don't build real-time collaboration UI.** The north star envisions this, but the near-term collaboration model is agent-human review loops, not Google Docs for CAD.
5. **Don't build studio features that depend on Phase 4 items that are still stubs** (e.g., design intent score requires hints, which are a stub).

## What agents CAN do if asked

1. **3MF export** — well-scoped, useful, documented spec
2. **glTF export** — well-scoped, useful, good library ecosystem
3. **Validation dashboard UI** — the data already exists in EvaluationBundle, just needs rendering
4. **Revision timeline UI** — the data exists in the worker, needs a studio panel
