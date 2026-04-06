# Roadmap

What's left to build. For what already exists, see the [wiki index](./index.md).

---

## Evaluation & Feedback

| Item | Effort | Priority | Notes |
|---|---|---|---|
| Structural wall thickness (ray-cast) | M | low | Replace bbox-min-extent proxy with ray-based measurement |
| Structural overhang analysis | S | low | Reuse per-triangle normal logic from `max_overhang` constraint |
| Structural draft/undercut detection | M | low | Per-face angle relative to pull direction |

The heuristic domain analysis tools work for gross problems. Structural upgrades can wait until agents report false negatives via `agent.capability_gap` events.

---

## Sessions & History

| Item | Effort | Priority | Notes |
|---|---|---|---|
| Local SQLite event store | M | high | Extract `SqliteEventStore` from Durable Object coupling to work with `better-sqlite3` or `sql.js` |
| Wire local store into MCP server | S | medium | Use local store when no live session is available |

The revision/branch logic is already shared (`packages/session-core/revision-branch.ts`) and the CLI has basic history commands. The remaining gap is a proper local event store backend.

---

## Agent Learning

| Item | Effort | Priority | Notes |
|---|---|---|---|
| `get_known_workarounds` MCP tool | S | **high** | Prevents redundant agent pain; leverages existing aggregation |
| `model.approved` / `model.rejected` events | M | medium | Foundation for model quality corpus |
| Corpus storage + retrieval | L | medium | Approved models as few-shot examples; start with attribute matching |
| `get_similar_examples` MCP tool | M | medium | Retrieve relevant approved models for context |
| Threshold alerts for gaps | S | low | Auto-flag when a gap hits N occurrences |
| Candidate-to-issue pipeline | S | low | Promoted candidates auto-generate draft GitHub issues |

---

## Design Intent & Constraints

| Item | Effort | Priority | Notes |
|---|---|---|---|
| FDM manufacturing profile | M | medium | First concrete profile; exercises constraint infrastructure |
| Injection molding profile | M | medium | Draft, wall uniformity, no undercuts |
| CNC milling profile | M | medium | Min internal radius, depth-to-width ratio |
| Constraint-aware fix suggestions | S per constraint | medium | Convert violations into actionable `suggestedFix` data |
| Hint precision/recall refinement | M | medium | Reduce false positives for magic-number and symmetry nudges |
| Enhanced sketch validation diagnostics | M | medium | Explain *why* a sketch fails, not just that it did |
| Additional sketch constraints (horizontal, vertical, midpoint, symmetric, concentric, parallel, angle) | S each | low | Additive to existing solver; ~30 lines each |

---

## Export & Human UX (Phase 5)

Not started. Agents iterate on geometry; humans export after approval. Start here only after the above gaps are addressed.

| Item | Effort | Priority | Notes |
|---|---|---|---|
| 3MF export | M | high (when needed) | Color/material metadata, assembly structure |
| glTF/GLB export | M | high (when needed) | Web-native, preserves color |
| Revision timeline UI | M | medium | Scrub through modeling history in studio |
| Branch comparison view | M | medium | Side-by-side 3D views of alternatives |
| Validation dashboard UI | M | medium | All diagnostics at a glance (data exists) |
| Approval workflow | M | medium | Depends on `model.approved` events |
| Plugin/extension model | L | low | Wait for API stability |
| Package registry | L | low | Wait for community content |

---

## Dependency Graph

```
Local SQLite event store
  └── Wire local store into MCP server

get_known_workarounds MCP tool  (independent, high value)

model.approved/rejected events
  └── Corpus storage + retrieval
      └── get_similar_examples MCP tool

FDM manufacturing profile  (independent)
Constraint-aware fix suggestions  (independent)
Hint precision/recall refinement  (independent)

3MF export  (independent, when needed)
glTF export  (independent, when needed)
Revision timeline UI  (depends on local event store for full value)
```

**Best parallelization opportunities:**
- `get_known_workarounds` + FDM profile + constraint suggestions (all independent)
- Local event store + hint refinement (independent)

---

## Principles

1. **Feedback speed is everything.** Structured stats in 200ms beat a 5s screenshot.
2. **Semantic operations over raw code.** Every MCP tool that lets an agent express intent reduces error rate.
3. **The system should encode domain knowledge.** Manufacturing constraints belong in the platform, not in prompts.
4. **Don't break the 24 projects.** They're the test suite, gallery, and training corpus.
5. **Don't add event types speculatively.** Only when a tool or reducer actually emits/consumes them.
6. **Don't add heavyweight dependencies.** Lookup tables and constraint config, not simulation engines.
