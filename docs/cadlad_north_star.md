# CADLAD NORTH STAR

What you want is not “a CAD app with some history.”
You want a **revisioned geometric programming system** where everything is reducible from a sequence of changes.

That suggests a data model with a few strong separations:

## The big separation

Do **not** collapse these into one thing:

* transport/session runtime
* persistence/history model
* authored source files
* derived geometry artifacts
* evaluation outputs

Right now some of those are braided together in the live-session worker. That was fine to get moving. It is not the end state.

The cleaner shape is:

1. **Events**
   immutable facts about actions or state transitions

2. **Reducers / materializers**
   deterministic projections from events into useful state

3. **Heads / sessions / branches**
   pointers to a chosen point in history, not the history itself

4. **Artifacts**
   screenshots, meshes, stats, validation results, test results

5. **Source snapshots**
   authored `forge.ts` at particular revisions

That’s the map-reduce framing.

---

# North-star mental model

A project is a **stream graph of changes**.

From that, you can reduce into:

* latest source tree
* semantic scene
* param state
* feature registry state
* validation results
* geometry/stats
* artifacts
* session views
* branch comparisons

So the question becomes:

> what is the minimal append-only event set that can drive all these projections?

That is the right question.

---

# My recommendation: 3-layer history model

## Layer 1: atomic events

These are immutable, append-only records.

Examples:

* user edited source
* agent inserted feature
* param changed
* validator ran
* geometry build completed
* test failed
* screenshot captured
* branch created
* branch merged
* session attached
* reference image added

These are the raw log.

## Layer 2: commits / revisions

A revision is a **named checkpoint** over one or more events.

This is the thing you compare, branch from, revert to, review, and share.

Think:

* event stream is the truth of motion
* revision is the stable addressable checkpoint

## Layer 3: live heads

A session or branch head points at a revision and accrues new events optimistically.

This is where live coding happens.

That gives you:

* append-only truth
* reviewable checkpoints
* session flexibility
* low-coupling runtime

---

# Concrete entities

## `Project`

Long-lived identity.

```ts id="jpyafj"
interface Project {
  id: string;
  name: string;
  createdAt: number;
  defaultBranchId: string;
}
```

## `Branch`

Not git necessarily, but git-like enough.

```ts id="4efghn"
interface Branch {
  id: string;
  projectId: string;
  name: string;
  headRevisionId: string | null;
  createdFromRevisionId: string | null;
  createdAt: number;
  createdBy: ActorRef;
}
```

## `Session`

Ephemeral collaborative context, attached to a branch or revision.

```ts id="n08ue5"
interface Session {
  id: string;
  projectId: string;
  branchId: string;
  baseRevisionId: string;
  status: "active" | "paused" | "closed";
  participants: ActorRef[];
  createdAt: number;
  updatedAt: number;
}
```

Important: session is **not** the persistence model. It is a live cursor over it.

## `Event`

The append-only primitive.

```ts id="v7x3l7"
interface EventEnvelope<T = unknown> {
  id: string;
  projectId: string;
  branchId: string;
  sessionId?: string;
  revisionBaseId?: string;
  actor: ActorRef;
  type: string;
  payload: T;
  ts: number;
  causationId?: string;
  correlationId?: string;
}
```

## `Revision`

Stable checkpoint.

```ts id="cs3c2u"
interface Revision {
  id: string;
  projectId: string;
  branchId: string;
  parentRevisionIds: string[];
  eventIds: string[];
  summary: string;
  createdAt: number;
  createdBy: ActorRef;

  materialized: {
    sourceHash?: string;
    sceneHash?: string;
    validationSummary?: ValidationSummary;
    geometrySummary?: GeometrySummary;
    artifactRefs?: string[];
  };
}
```

## `Artifact`

Derived outputs, never canonical.

```ts id="2f0wv7"
interface Artifact {
  id: string;
  projectId: string;
  revisionId: string;
  kind: "screenshot" | "mesh" | "stats" | "validation-report" | "test-report" | "reference-image";
  contentRef: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}
```

---

# Event taxonomy

I would make the event model explicit and boring. Boring is good here.

## Authoring events

These change the authored model.

* `source.replaced`
* `source.ast_patch_applied`
* `scene.feature_added`
* `scene.feature_updated`
* `scene.feature_removed`
* `scene.param_set`
* `scene.validator_added`
* `scene.test_added`

## Workflow/runtime events

These describe activity, not truth of authored content.

* `session.created`
* `session.joined`
* `session.left`
* `branch.created`
* `branch.head_moved`
* `revision.created`
* `revision.merged`

## Evaluation events

These describe derived outcomes.

* `validation.completed`
* `geometry.built`
* `stats.computed`
* `tests.completed`
* `render.completed`
* `render.failed`

## Agent learning / roadmap events

These are gold.

* `agent.intent_declared`
* `agent.capability_gap_reported`
* `agent.feature_proposed`
* `agent.workaround_recorded`

This is where your roadmap harvesting comes from.

---

# The map-reduce view

You said “giant map reduce.” Good. Treat it literally.

## Map step

Normalize incoming actions into domain events.

UI click:

* user drags slider
* becomes `scene.param_set`

Agent MCP call:

* `add_feature(roof.gable, ...)`
* becomes `scene.feature_added`

Raw source edit:

* Monaco text change
* eventually becomes either:

  * `source.ast_patch_applied`
  * or `source.replaced`

Reference image attach:

* becomes `artifact.created(kind=reference-image)` plus maybe `design.intent_updated`

## Reduce step

Materialize projections.

### Source reducer

Produces current `forge.ts`

### Scene reducer

Produces typed scene model

### Validation reducer

Produces fast semantic validation state

### Geometry reducer

Produces geometry summary/stats

### Artifact reducer

Indexes screenshots, reports, meshes

### Branch reducer

Computes branch heads and ancestry

### Session reducer

Computes active session state

That’s the system.

---

# Should the database be git?

## My answer

**Not as the runtime event store.**
Possibly yes as a **revision export / long-term mirror / interchange layer**.

Git is great at:

* source snapshots
* branching
* diff/review
* collaboration
* persistence semantics humans understand

Git is bad at:

* high-frequency realtime event streams
* incremental UI/agent ops
* low-latency push/pull for collaborative state
* storing lots of derived transient artifacts cleanly
* being your operational query model

So I would use:

* **event log + materialized projections** as the operational core
* optional **git projection** for source snapshots/revisions

Think of git as one downstream materialization, not the runtime substrate.

That avoids “hard realtime collaborative codebase via git” nonsense while preserving git’s strengths.

## Better framing

Not “the DB is git.”
More like:

**the DB stores the event/revision graph, and one reducer emits a git-like source history**

That is cleaner.

---

# How heavy should live push/pull be?

You’re right to be skeptical about doing realtime collaboration as literal codebase sync.

I’d keep the live transport thin:

* clients send commands
* server/app layer emits events
* subscribers receive reduced state deltas or relevant events
* local editors update projections

That means you can use:

* WebSocket
* SSE
* local process bus
* Postgres LISTEN/NOTIFY
* Redis pub/sub
* NATS
* in-memory event bus for single-node dev

No Cloudflare dependency required.

The portable abstraction is:

```ts id="n83n2r"
interface EventBus {
  publish(events: EventEnvelope[]): Promise<void>;
  subscribe(projectId: string, handler: (event: EventEnvelope) => void): Unsubscribe;
}
```

And:

```ts id="d8y1i4"
interface EventStore {
  append(events: EventEnvelope[]): Promise<void>;
  readStream(query: StreamQuery): Promise<EventEnvelope[]>;
}
```

Everything else can swap under that.

---

# How to avoid Cloudflare coupling

This is a design smell you already noticed.

Durable Objects currently bundle together:

* routing
* identity
* state persistence
* realtime fanout
* session semantics
* revision logic

Split those.

## Better interfaces

### Event store

Append/read events

### Projection store

Read/write materialized state

### Realtime bus

Publish/subscribe changes

### Artifact store

Blob/object storage

### Revision service

Create checkpoints, branch, merge, compare

### Evaluation service

Build geometry, run validators/tests, produce stats/artifacts

Then the runtime can be backed by:

* Cloudflare
* Node + Postgres
* SQLite local dev
* desktop app local filesystem
* future distributed infra

That is the portability line.

---

# Source snapshots vs structural events

This is where people get religious and annoying. Don’t.

You need **both**.

## Structural events

Best for:

* MCP semantic actions
* validators
* analytics
* mergeability
* agent self-protection

## Source snapshots

Best for:

* human inspection
* git interoperability
* debugging
* reproducibility
* escape hatches

So I’d keep source snapshots at revisions, but not require every event to be source-native.

Example:

* `scene.feature_added`
* reducer updates scene
* source materializer rewrites relevant semantic zone in `forge.ts`
* revision checkpoint stores resulting source snapshot hash

That gives you semantic operability and human-readable continuity.

---

# Screenshot dependence vs tighter geometry loop

You’re right to want less dependence on screenshots.

The current system leans on screenshot/render evaluation because that was the easiest visible loop. Fine. But long term, the better loop is:

1. types
2. semantic validators
3. geometry validators
4. stats/queries
5. selective render

So I’d define a first-class evaluation model:

```ts id="5y3fjw"
interface EvaluationBundle {
  revisionId: string;
  typecheck?: TypecheckResult;
  semanticValidation?: SemanticValidationResult;
  geometryValidation?: GeometryValidationResult;
  stats?: GeometryStats;
  tests?: TestRunResult;
  render?: RenderResult;
}
```

And make render optional, late, and comparatively expensive.

### Tight geometry loop should answer things like:

* empty?
* disconnected?
* invalid booleans?
* bbox sane?
* triangle count okay?
* part relationships okay?
* clearances okay?
* symmetry okay?
* anchors where expected?

That lets agents iterate rapidly without always paying for image generation.

Render becomes:

* confirmation
* aesthetics
* reference matching
* human review

Exactly where it belongs.

---

# Merge model

If you want git-like branching, define merge at the **revision / scene event** level, not raw text if possible.

Possible merge levels:

1. **event merge**
   easiest when events target distinct entities

2. **scene merge**
   merge semantic feature graph

3. **source merge**
   fallback, only when semantic merge unavailable

That hierarchy matters.

If everything becomes raw text early, you lose a lot of the benefits.

---

# What I’d make canonical

Here’s the sharp answer.

## Canonical truth

**append-only domain events + revision checkpoints**

## Canonical authored artifact at each revision

**`forge.ts` source snapshot**

## Derived operational models

* scene graph
* validation state
* geometry stats
* render artifacts
* test results
* session view state

That is the balance.

Not “source only.”
Not “events only.”
Not “scene graph only.”

Events are truth of change.
Revisions are truth of checkpoints.
Source is truth of authored model at a checkpoint.

---

# The smallest viable architecture shift

If you want to move toward this without a rewrite, I’d do:

## Step 1

Introduce a real event envelope and event store abstraction behind current live session writes.

Current patch writes become events.

## Step 2

Separate session state from revision state.

Sessions point to branch heads, they do not own history.

## Step 3

Add explicit revision creation/checkpointing.

Not every keystroke needs a revision, but every meaningful modeling step should be able to become one.

## Step 4

Add evaluation bundles as first-class artifacts.

Stop treating screenshot as the only meaningful feedback product.

## Step 5

Move toward semantic events for strict features.
Keep `source.replaced` as fallback.

That gets you most of the way without detonating the current workflow.

---

# My opinionated summary

The model I’d choose is:

**Event-sourced, revision-checkpointed, source-materialized, projection-driven**

In one line:

* append-only events are the underlying motion
* revisions are stable checkpoints
* `forge.ts` is the human-readable authored state at a checkpoint
* sessions are ephemeral live cursors over branches
* geometry/stats/tests/renders are derived artifacts
* git is a useful projection, not the runtime database
* Cloudflare is an adapter, not the architecture

That’s the non-joke version.

The next smallest lever is to define your event taxonomy and branch/session/revision boundaries before doing more MCP surface work. Without that, you’ll keep adding capabilities onto a runtime model that still thinks “session object = reality,” and that will get ugly fast.
