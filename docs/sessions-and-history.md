# Sessions & History

CadLad uses an event-sourced data model: immutable events are the source of truth, revisions are stable checkpoints, and sessions are ephemeral cursors over branches.

---

## Event Store

Two `EventStore` implementations behind a common interface:

```ts
interface EventStore {
  append(events: EventEnvelope[]): Promise<void>;
  readStream(query: StreamQuery): Promise<EventEnvelope[]>;
}
```

| Implementation | Backend | Use |
|---|---|---|
| `InMemoryEventStore` | Array + sort | Dev/testing |
| `SqliteEventStore` | Durable Object SQL storage | Production |

### Event Types

| Event type | When emitted |
|---|---|
| `source.replaced` | Patch applied or session initialized |
| `scene.param_set` | Parameter slider change or param update |
| `evaluation.completed` | After every model evaluation |
| `agent.intent_declared` | Agent submits patch with `intent` field |
| `agent.capability_gap` | Agent reports something it couldn't do |
| `agent.workaround_recorded` | Agent reports a hack it used |

### EventEnvelope

```ts
interface EventEnvelope<T = unknown> {
  id: string;          // UUID
  projectId: string;   // Durable Object ID
  branchId?: string;
  sessionId?: string;
  actor: EventActor;   // { kind: 'human' | 'agent', id?: string }
  type: EventType;
  payload: T;          // Typed per event type
  timestamp: number;   // Unix ms
}
```

### Querying Events

`StreamQuery` supports filtering by:
- `projectId` (required)
- `branchId`, `types` (optional)
- `afterTimestamp` / `beforeTimestamp` (optional)
- `limit` (max 500, default 100)

SQLite indices on `(project_id, ts)`, `(project_id, branch_id, ts)`, and `(project_id, type, ts)`.

---

## Revisions

A revision is a stable checkpoint created after each meaningful modeling step (patch application, not every keystroke).

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
  evaluation?: RevisionEvaluationRef;
}
```

Agents can retrieve the complete state at any revision — source code, parameter values, evaluation results — and resume from there.

### Endpoints

| Endpoint | Returns |
|---|---|
| `GET /revisions` | Paginated list of revision snapshots |
| `GET /revisions/:id` | Source, params, stats, and validation at a specific revision |

---

## Branches

Branches let agents fork to explore design alternatives without losing the current approach.

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

### Operations

| Endpoint | Method | What it does |
|---|---|---|
| `/branches` | GET | List all branches |
| `/branches` | POST | Create branch from specified or current revision |
| `/branches/:id/checkout` | POST | Switch to branch, restore its head revision's source/params |
| `/compare-branches?a=X&b=Y` | GET | Structured diff of two branch heads |

Branch comparison returns revision metadata, parameter diffs, and evaluation state diffs for both heads. An agent can fork, evaluate both approaches, and pick the winner.

---

## Session Cursor

A session is an ephemeral cursor over a branch:

```ts
interface SessionCursorState {
  branchId: string;
  baseRevision: number;
  headRevision: number;
  checkpointRevision: number;
}
```

Sessions:
- Initialize with a branch and base revision
- Accrue events as the agent/human works
- Periodically checkpoint to revisions
- Can switch branches via checkout
- Persist cursor state to Durable Object storage

Multiple observers (agents or humans) can attach via SSE. Write coordination is first-come-first-served.

---

## MCP Tools

| Tool | What it does |
|---|---|
| `create_branch` | Fork current state to a named branch |
| `checkout_branch` | Switch to a different branch |
| `list_branches` | List all branches with head revision info |
| `compare_branches` | Structured diff between two branch heads |
| `get_history` | Revision list with metadata |

---

## Local CLI History

The CLI provides local history management without requiring a live session:

- `cadlad run --record-events` writes `source.replaced` + `evaluation.completed` events to `.cadlad/events.json`
- `cadlad branch` / `cadlad compare` / `cadlad history` manage local branches and revisions
- Shared `RevisionStore` and `BranchStore` interfaces live in `packages/session-core/revision-branch.ts`

---

## Key Files

| File | Role |
|---|---|
| `apps/worker/event-store.ts` | `EventStore` interface + InMemory/SQLite implementations |
| `apps/worker/types.ts` | `EventEnvelope`, `RevisionSnapshot`, `Branch`, `SessionCursorState` |
| `apps/worker/live-session.ts` | Session Durable Object: events, revisions, branches |
| `packages/session-core/revision-branch.ts` | Shared revision/branch logic (worker + CLI) |
| `apps/mcp-gateway/server.ts` | MCP tools for branch/revision operations |
