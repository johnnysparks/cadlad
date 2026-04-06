# CadLad Wiki

Code-first parametric 3D CAD in TypeScript. Agents are the primary modelers; humans review and approve.

---

## System Reference

| Doc | What it covers |
|---|---|
| [Evaluation Pipeline](./evaluation-pipeline.md) | Geometry stats, 5-stage validation, MCP tools, domain analysis |
| [Sessions & History](./sessions-and-history.md) | Event store, revisions, branches, session cursor |
| [Agent Telemetry](./agent-telemetry.md) | Capability gaps, workarounds, API improvement candidates |
| [Design Intent & Constraints](./design-intent-and-constraints.md) | Constraint system, sketch solver, tool bodies, hints, reference geometry |
| [Scene Layer](./forge-ts-scene-layer.md) | `defineScene()` envelope and validation pipeline |
| [Eval Loop](./agent-eval-loop.md) | Batch model evaluation, benchmarks, scoring, judge |
| [Deployment](./live-session-deploy.md) | Cloudflare Pages + Worker deployment, OAuth |

## Architecture Vision

| Doc | What it covers |
|---|---|
| [North Star](./cadlad_north_star.md) | Core data model: events, reducers, heads, artifacts, source |
| [Semantic System Vision](./cadlad_semantic_system_vision.md) | Long-term direction: semantic layers, domain knowledge, learnability |

## Planning

| Doc | What it covers |
|---|---|
| [Roadmap](./roadmap.md) | What's not done yet, sequencing, priorities |

---

## Architecture at a Glance

```
/apps
  /studio-web       Browser IDE (Monaco + Three.js) and gallery
  /cli              Node CLI (run, eval, export)
  /worker           Cloudflare Worker (live sessions, event store)
  /mcp-gateway      MCP server (bridge for assistants)
/packages
  /cad-kernel       Geometry engine (Manifold WASM), Solid, types
  /cad-api          Public modeling API (.forge.ts surface)
  /rendering        Shared Three.js scene builder
  /validation       Layered validation pipeline
  /session-core     Event/revision store abstractions
  /eval             Model evaluation pipeline
  /prompts          Prompt assets for eval/agents
/content
  /projects         24 example models (.forge.ts)
  /benchmarks       12 evaluation task specs (YAML)
  /snapshots        Visual baseline snapshots
```

## Core Loop

```
Write .forge.ts  -->  evaluateModel()  -->  EvaluationBundle  -->  Iterate
                                               |
                                     GeometryStats + Diagnostics
                                     Constraint checks
                                     Hints (advisory)
                                     Tests (in-source)
```

Render is optional and late. Agents get full structured feedback in ~200ms without rendering a pixel.

## Key Design Decisions

- **Agents are the primary users.** The studio is a review tool. Every API and feedback choice optimizes for agent iteration speed.
- **TypeScript is the file format.** No custom DSL. Models are version-controlled, diffable, composable.
- **Z-up coordinate system.** Matches Manifold and CAD conventions. The rendering layer converts to Y-up for Three.js.
- **Event-sourced history.** Immutable events are the source of truth. Revisions are stable checkpoints. Sessions are ephemeral cursors.
- **Structured feedback over pixels.** Geometry stats, constraint violations, and hints beat screenshots for iteration speed.

## Contributing

- `npm run typecheck` is the most reliable check. Run it after any change.
- Don't break the 24 projects in `content/projects/` — they're the implicit test suite, gallery, and training corpus.
- New API files go in `packages/cad-api/`, new engine methods on `Solid` in `packages/cad-kernel/`.
- New MCP tools go in `apps/mcp-gateway/` and the worker if needed.
- Expose new `.forge.ts` functions in the runtime sandbox (`packages/cad-api/runtime.ts`).
