# Phase 2 — Agent Memory: Events, Revisions, Branches

> **Status**: ~90% complete. Event store, revisions, branches, and session cursor are all implemented, tested, and wired into the live session backend. The gap is **local parity** — all of this only works through the Cloudflare worker, not the local CLI.
>
> **Depends on**: Phase 1 (evaluation bundles feed into revision snapshots)
> **Unlocks**: Phase 3 (agent learning reads from event store), Phase 5 (studio review UX)

---

## Motivation

An agent without memory starts cold every session. It can't resume where it left off, compare alternatives, or learn from past attempts. Phase 2 gives agents:

1. **Addressable history** — retrieve source, stats, and validation at any revision
2. **Branching** — fork to explore alternatives without losing the current approach
3. **Comparison** — structured diff between branches or revisions
4. **Actor attribution** — every event records whether it came from a human or agent

The north star's 3-layer model (events -> revisions -> sessions) is implemented here. Events are the atomic truth, revisions are stable checkpoints, sessions are ephemeral cursors.

---

## 2.1 Event store

**Status: DONE — InMemory + SQLite implementations, wired into live session**

### What exists

Two `EventStore` implementations behind a common interface:

```ts
interface EventStore {
  append(events: EventEnvelope[]): Promise<void>;
  readStream(query: StreamQuery): Promise<EventEnvelope[]>;
}
```

| Implementation | Backend | Location | Use |
|---|---|---|---|
| `InMemoryEventStore` | Array + sort | `worker/src/event-store.ts:90-111` | Dev/testing |
| `SqliteEventStore` | Durable Object SQL storage | `worker/src/event-store.ts:121-227` | Production |

### Event types (6 total)

| Event type | Payload type | When emitted |
|---|---|---|
| `source.replaced` | `SourceReplacedPayload` | Patch applied or session initialized |
| `scene.param_set` | `SceneParamSetPayload` | Parameter slider change or param update patch |
| `evaluation.completed` | `EvaluationCompletedPayload` | After every model evaluation |
| `agent.intent_declared` | `AgentIntentDeclaredPayload` | Agent submits patch with `intent` field |
| `agent.capability_gap` | `AgentCapabilityGapPayload` | Agent reports something it couldn't do |
| `agent.workaround_recorded` | `AgentWorkaroundRecordedPayload` | Agent reports a hack it used |

All payloads are typed in `worker/src/event-store.ts:8-61`. The `EventPayloadMap` discriminated union ensures type safety.

### EventEnvelope structure

```ts
interface EventEnvelope<T = unknown> {
  id: string;          // UUID
  projectId: string;   // Durable Object ID
  branchId?: string;   // Which branch this event belongs to
  sessionId?: string;  // Which session emitted it
  actor: EventActor;   // { kind: 'human' | 'agent', id?: string }
  type: EventType;     // One of the 6 types above
  payload: T;          // Typed payload
  timestamp: number;   // Unix ms
}
```

### Query capabilities

`StreamQuery` supports filtering by:
- `projectId` (required)
- `branchId` (optional)
- `types` (optional — filter to specific event types)
- `afterTimestamp` / `beforeTimestamp` (optional — time range)
- `limit` (optional — max 500, default 100)

### Integration

- Events appended during: init (`live-session.ts:221-227`), patch (`live-session.ts:489-511`), revert (`live-session.ts:558-564`), capability gap, workaround recording
- Event log exposed at `GET /event-log` endpoint (`live-session.ts:143`)
- SQLite schema includes indices on `(project_id, ts)`, `(project_id, branch_id, ts)`, and `(project_id, type, ts)`

### Design decisions

- **6 event types, no more (for now).** The north star defines ~25 event types. We deliberately started with 6 to avoid speculative taxonomy. New types should only be added when a tool or reducer actually emits/consumes them.
- **Actor attribution on every event.** This is the foundation for Phase 3 agent learning — you can't analyze agent behavior if you don't know which events came from agents.
- **No `causationId`/`correlationId` yet.** The north star includes these for event chaining. We'll add them when feature-level MCP tools (Phase 1.2) need to link `add_feature` commands to the events they produce.

---

## 2.2 Revisions

**Status: DONE — checkpointing, retrieval, evaluation reference**

### What exists

A revision is a stable checkpoint over a batch of events:

```ts
interface RevisionSnapshot {
  id: string;
  revision: number;           // Monotonically increasing
  branchId: string;
  parentRevision: number | null;
  sourceHash: string;         // SHA-256 of source text
  source: string;             // Full source snapshot
  params: Record<string, number>;
  eventIds: string[];         // Events since last revision
  createdAt: number;
  actor: { kind: 'human' | 'agent', id?: string };
  evaluation?: RevisionEvaluationRef;  // Link to evaluation results
}
```

**Key file:** `worker/src/types.ts:48-63`

### Checkpointing

`checkpointRevision()` in `live-session.ts:898-927`:
- Computes SHA-256 source hash
- Creates `RevisionSnapshot` with parent tracking
- Links evaluation results (error count, warning count, has-bundle flag)
- Updates session cursor

Revisions are created after each meaningful modeling step (patch application), not on every keystroke.

### Retrieval

| Endpoint | Returns |
|---|---|
| `GET /revisions` | Paginated list of revision snapshots |
| `GET /revisions/:id` | Source, params, stats, and validation state at a specific revision |

An agent can retrieve the complete state at any revision — source code, parameter values, evaluation results — and resume from there.

### Tests

`worker/test/session.test.ts:282-361`:
- Creates revision with source hash
- Retrieves revision by ID
- Validates source content, stats, and validation data

---

## 2.3 Branches

**Status: DONE — creation, checkout, comparison, head tracking**

### What exists

```ts
interface Branch {
  id: string;
  name: string;
  headRevision: number;
  baseRevision: number | null;  // Where this branch forked from
  createdAt: number;
  updatedAt: number;
  actor: { kind: 'human' | 'agent', id?: string };
}
```

**Key file:** `worker/src/types.ts:65-76`

### Operations

| Endpoint | Method | Handler | What it does |
|---|---|---|---|
| `/branches` | GET | `handleGetBranches()` | List all branches |
| `/branches` | POST | `handleCreateBranch()` :313 | Create branch from specified or current revision |
| `/branches/:id/checkout` | POST | `handleCheckoutBranch()` :344 | Switch to branch, restore its head revision's source/params |
| `/compare-branches?a=X&b=Y` | GET | `handleCompareBranches()` :366 | Structured diff of two branch heads |

### Branch comparison

`handleCompareBranches()` returns:
- Revision metadata for both branches (revision number, source hash, actor, timestamp)
- Parameter diff (which params changed, old vs new values)
- Evaluation state diff (error/warning counts, stats deltas)

This lets an agent fork to try two approaches, evaluate both, and pick the winner — or present both to the human for review.

### Validation

- Branch names must be unique within a session
- Creating a branch from a non-existent revision returns 404
- Active branch is tracked in session state and persisted

### Tests

`worker/test/session.test.ts:363-423`:
- Lists branches
- Creates branch from revision
- Checks out branch
- Applies patches on checked-out branch
- Compares two branches with structured diff

---

## 2.4 Session as cursor

**Status: DONE**

### What exists

```ts
interface SessionCursorState {
  branchId: string;           // Currently active branch
  baseRevision: number;       // Where the session started
  headRevision: number;       // Latest revision on this branch
  checkpointRevision: number; // Last checkpointed revision
}
```

**Key file:** `worker/src/types.ts:26-31`

A session is an ephemeral cursor over a branch. It:
- Initializes with a branch and base revision (`handleInit()` :186-191)
- Accrues events as the agent/human works
- Periodically checkpoints to revisions
- Can switch branches via checkout
- Persists cursor state to Durable Object storage

Multiple observers (agents or humans) can attach to the same session via SSE. Write coordination is first-come-first-served (not yet multi-writer safe).

### Tests

`worker/test/session.test.ts:70-85`:
- Session cursor initialized with branch
- Tracks baseRevision and headRevision

---

## The local parity gap

**Status: NOT DONE — the biggest remaining gap in Phase 2**

All Phase 2 features live exclusively in the Cloudflare worker (`worker/src/`). An agent using the local CLI (`cadlad run`, `cadlad validate`) has:

- No event store
- No revisions
- No branches
- No comparison
- No actor attribution

This means local agents start cold every time. The MCP server (`mcp/src/server.ts`) proxies to the worker, so MCP-connected agents get full Phase 2 — but only when a live session is running.

### What's needed

- [ ] **Local EventStore backend** — SQLite file in the project directory (e.g., `.cadlad/events.db`). The `SqliteEventStore` class already exists but is coupled to Durable Object SQL storage. Extract it to work with any SQLite driver (better-sqlite3, sql.js).

- [x] **Local revision/branch management** — Core revision/branch logic (checkpointing, branch CRUD, comparison) now lives in `src/core/revision-branch.ts` and is consumed by `worker/src/live-session.ts`, so the worker and local backends can share one implementation.

- [x] **CLI integration** — `cadlad run --record-events` now writes `source.replaced` + `evaluation.completed` events to a local store (`.cadlad/events.json`), and new `cadlad branch`, `cadlad compare`, and `cadlad history` commands provide local branch/revision management.

- [x] **Shared interfaces** — `RevisionStore` and `BranchStore` now live in `src/core/revision-branch.ts` with a shared `InMemoryRevisionBranchStore` adapter that can be reused by both worker and local backends. This provides the common contract MCP-facing backends can target.

### Why this matters

The north star says: "An agent shouldn't need a network round-trip to evaluate a model." Today, an agent using the CLI gets fast local evaluation but no memory. An agent using MCP gets memory but requires a running worker. Local parity closes this gap — fast evaluation AND persistent memory, no network required.

### Recommended approach

1. Extract `EventStore`, revision checkpointing, and branch CRUD into `src/core/` (shared between worker and CLI)
2. Add a `better-sqlite3` (or `sql.js`) adapter for the local `EventStore`
3. Wire into CLI commands
4. Update MCP server to use local store when no live session is available

**Scope:** Medium-large. The logic exists; the work is extraction and adaptation, not invention.

---

## Key files

| File | Role |
|---|---|
| `worker/src/event-store.ts` | `EventStore` interface + InMemory/SQLite implementations (246 lines) |
| `worker/src/types.ts` | `EventEnvelope`, `RevisionSnapshot`, `Branch`, `SessionCursorState` types |
| `worker/src/live-session.ts` | Session Durable Object: event emission, revision checkpointing, branch CRUD |
| `worker/test/session.test.ts` | Integration tests for events, revisions, branches, cursor (432 lines) |
| `mcp/src/server.ts` | MCP tools that proxy to worker (branch/revision operations) |

---

## MCP tools for Phase 2

These tools exist in the MCP server and proxy to the worker:

| Tool | What it does |
|---|---|
| `create_branch` | Fork current state to a named branch |
| `checkout_branch` | Switch to a different branch |
| `list_branches` | List all branches with head revision info |
| `compare_branches` | Structured diff between two branch heads |
| `get_history` | Revision list with metadata |

All return structured JSON. An agent can branch, evaluate alternatives, compare, and pick — without screenshots or manual diffing.
