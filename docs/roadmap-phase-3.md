# Phase 3 — Agent Learning & Self-Improvement

> **Status**: ~60% complete. Structured telemetry (intent, capability gaps, workarounds) is fully implemented and wired into MCP tools. Capability gap aggregation and API improvement candidate generation work. The gap is **closing the loop** — no model quality corpus, no automated prioritization dashboard, and no mechanism for agents to consume learnings from other agents' sessions.
>
> **Depends on**: Phase 2 (events store provides the telemetry substrate)
> **Unlocks**: Better primitives, helpers, and validators driven by real agent pain data

---

## Motivation

Most tools treat AI agents as consumers. CadLad treats them as participants whose struggles drive the roadmap. Phase 3 captures structured data about what agents try, where they fail, and what hacks they resort to — then uses that data to improve the platform.

The north star calls agent learning events "gold." The concrete value:
- **Capability gaps** tell us what primitives/helpers to build next
- **Workaround patterns** tell us which hacks should become first-class API methods
- **Intent declarations** tell us what agents are trying to accomplish (context for debugging failures)
- **Model quality data** (future) provides few-shot examples for better agent performance

---

## 3.1 Structured agent telemetry

**Status: DONE — 3 event types, MCP tools, live session integration**

### Event types

Three agent-specific event types are emitted to the event store:

| Event type | Payload type | When emitted | Key fields |
|---|---|---|---|
| `agent.intent_declared` | `AgentIntentDeclaredPayload` | Agent submits a patch with `intent` field | `intent`, `summary`, `patchId`, `revision` |
| `agent.capability_gap` | `AgentCapabilityGapPayload` | Agent explicitly reports a gap | `message`, `category`, `blockedTask`, `attemptedApproach`, `workaroundSummary` |
| `agent.workaround_recorded` | `AgentWorkaroundRecordedPayload` | Agent explicitly reports a hack | `summary`, `limitation`, `workaround`, `impact` (low/medium/high) |

**Payload types:** `worker/src/event-store.ts:28-52`

### Capability gap categories

Gaps are bucketed for aggregation:
- `missing-primitive` — a shape/operation the API doesn't support (threads, gears, etc.)
- `api-limitation` — the API exists but doesn't handle a specific case
- `validation-gap` — the system doesn't catch a problem it should
- `other` — uncategorized

### MCP tools

| Tool | Location (`mcp/src/server.ts`) | What it does |
|---|---|---|
| `report_capability_gap` | line 322 | Records a structured gap with category, blocked task, attempted approach |
| `record_workaround` | line 339 | Records a hack with limitation, workaround steps, impact severity |

Both tools POST to the live session worker, which appends events to the event store with full actor attribution.

### Integration points

- **Patch submission:** When an agent submits a patch with `intent` and `approach` fields (`live-session.ts:489-511`), an `agent.intent_declared` event is automatically emitted.
- **Explicit reporting:** Agents call `report_capability_gap` or `record_workaround` MCP tools at any time.
- **Actor tracking:** All events record `actor: { kind: 'agent', id?: string }` from request headers.
- **Event log:** All telemetry events appear in the event log (`GET /event-log`) and are queryable by type.

### Tests

`worker/test/session.test.ts:111-223`:
- Records capability gaps with category, message, context
- Records workarounds with limitation, workaround, impact
- Events appear in event log with correct types and actor attribution

---

## 3.2 Capability gap aggregation

**Status: DONE — reducer with KV persistence, query endpoint**

### What exists

A reducer that aggregates capability gap events across all sessions into a ranked summary.

**Key file:** `worker/src/capability-gap-reducer.ts` (174 lines)

### How it works

1. **Normalization:** Gap messages are lowercased, stripped of punctuation, and truncated to 160 chars to create a stable key (`normalizeGapKey()` line 166).
2. **Aggregation:** Identical gaps (by normalized key) are merged: count incremented, `lastSeenAt` updated, latest context preserved.
3. **Ranking:** Entries sorted by count descending, then recency. Capped at 500 entries.
4. **Persistence:** Aggregate state stored in Cloudflare KV (`analytics:capability-gaps:v1` key).

### Data structure

```ts
interface CapabilityGapAggregateState {
  schemaVersion: 1;
  updatedAt: number;
  totalReports: number;
  uniqueGaps: number;
  entries: CapabilityGapAggregateEntry[];  // sorted by count desc
}

interface CapabilityGapAggregateEntry {
  key: string;                  // Normalized message
  normalizedMessage: string;
  count: number;                // How many times reported
  firstSeenAt: number;
  lastSeenAt: number;
  latest: {                     // Most recent report's context
    message: string;
    context?: string;
    projectId: string;
    sessionId: string;
    revision: number;
  };
}
```

### Query

`getCapabilityGapSummary(kv, { limit?, minCount? })` — returns filtered, ranked aggregate. Used by the API improvements endpoint and available for direct querying.

### Tests

`worker/test/capability-gap-reducer.test.ts:21-96`:
- Records 3 gaps (2 identical, 1 unique), verifies aggregation
- Confirms count tracking and `lastSeenAt` updates
- Tests `minCount` and `limit` filtering

---

## 3.3 Auto-generated API improvement candidates

**Status: DONE — candidate generation with kind inference and promotion logic**

### What exists

A report generator that analyzes workaround and capability gap events to propose API improvements.

**Key file:** `worker/src/agent-learning.ts` (200 lines)

### How it works

`buildApiImprovementReport(events, { promotionThreshold? })`:

1. **Group workarounds:** Events of type `agent.workaround_recorded` are grouped by normalized pattern key. Each group tracks: occurrences, limitation set, workaround set, impact distribution.
2. **Aggregate gaps:** Events of type `agent.capability_gap` are aggregated similarly.
3. **Link gaps to workarounds:** Gap entries are matched to workaround groups by key overlap (substring matching).
4. **Infer kind:** Each workaround group is classified as `primitive`, `helper`, `validator`, or `workflow` based on text pattern matching (`inferKind()` line 167).
5. **Generate name:** A sanitized API-style name is suggested (`inferSuggestedName()` line 175).
6. **Promotion check:** Groups with `occurrences >= threshold` (default: 2) are marked `promotion.ready = true`.

### Candidate structure

```ts
interface ApiImprovementCandidate {
  id: string;
  pattern: string;              // Normalized pattern key
  occurrences: number;
  latestSummary: string;
  limitations: string[];        // What platform limitations forced the hack
  sampleWorkarounds: string[];  // What hacks agents actually used
  impact: { low, medium, high, unknown };
  proposedKind: 'primitive' | 'helper' | 'validator' | 'workflow';
  suggestedName: string;        // e.g., "threadPrimitive", "slotHelper"
  rationale: string;
  promotion: {
    ready: boolean;
    threshold: number;
    reason: 'recurrence-threshold-met' | 'needs-more-samples';
  };
  capabilityGapSignals: CapabilityGapSignal[];  // Linked gap reports
}
```

### Endpoints and tools

| Surface | Location | What it returns |
|---|---|---|
| `GET /api-improvements?threshold=N` | `live-session.ts:144, 267-283` | Full `ApiImprovementReport` |
| `suggest_api_improvements` MCP tool | `mcp/src/server.ts:355` | Same report via MCP |

### Tests

- `worker/test/agent-learning.test.ts:18-69`: Records workarounds, verifies promotion logic, kind inference
- `worker/test/session.test.ts:227-280`: Integration test through live session endpoint

---

## 3.4 Model quality corpus

**Status: NOT DONE**

### What's needed

Successful models (human-approved, validation-passing) should become training examples. Failed attempts (with failure reasons) should become negative examples. This corpus improves future agent performance by providing better few-shot examples and domain rules for MCP context.

### Proposed implementation

- [ ] **Approval event:** New event type `model.approved` emitted when a human marks a model as good. Payload: revision ID, approval reason, quality rating.
- [ ] **Failure tagging:** New event type `model.rejected` or attach failure metadata to existing `evaluation.completed` events when a human flags a model as bad. Payload: revision ID, rejection reason, what was wrong.
- [ ] **Corpus storage:** Approved models (source + params + stats + validation results) stored as artifacts. Could be Cloudflare R2, local filesystem, or KV depending on backend.
- [ ] **Corpus query:** MCP tool `get_similar_examples(intent, constraints?)` that retrieves relevant approved models for few-shot context. Matching by: feature kinds used, similar parameter ranges, similar geometry stats, matching manufacturing profile.
- [ ] **Negative examples:** Failed attempts paired with the fix that resolved them. Structured as "tried X, failed because Y, fixed by Z" — directly useful as few-shot guidance.

### Why this matters

Agents today get domain knowledge from CLAUDE.md prose and SKILLS.md reference tables. A corpus of real approved/failed models with structured metadata is more specific and actionable: "Here's a bracket that passed all constraints with these exact dimensions and features" beats "remember to oversize boolean cutters."

### Scope

Medium-large. The event types and storage are straightforward. The hard part is the retrieval/matching — finding *relevant* examples for a given modeling task without a vector database or embeddings. Start with simple attribute matching (feature kinds, geometry stats ranges) and upgrade later.

---

## 3.5 Closing the learning loop

**Status: NOT DONE**

The current system captures telemetry and generates improvement candidates, but doesn't close the loop. What's missing:

### Automated prioritization

- [ ] **Threshold-based alerts:** When a capability gap hits N occurrences (configurable), automatically create a GitHub issue or flag in the studio.
- [ ] **Trend detection:** Compare gap aggregates week-over-week. Rising gaps = urgent. Stable gaps = backlog.
- [ ] **Impact weighting:** Gaps tagged `high` impact by multiple agents should rank above `low` impact gaps with higher counts.

### Cross-session knowledge sharing

- [ ] **Gap broadcast:** When an agent encounters a known gap, the system proactively warns: "This is a known limitation (reported 12 times). Known workaround: [pattern]."
- [ ] **Workaround library:** MCP tool `get_known_workarounds(limitation)` that returns proven hacks from other sessions. Agents shouldn't reinvent workarounds.

### Agent-to-roadmap pipeline

- [ ] **Candidate-to-issue:** Promoted API improvement candidates auto-generate draft GitHub issues with: title, description, sample workarounds, impact data, suggested implementation.
- [ ] **Feedback after implementation:** When a promoted candidate is actually implemented as a new API method, track whether agents stop reporting the corresponding gap. This validates that the improvement worked.

---

## Remaining work summary

| Item | Status | Effort | Priority |
|---|---|---|---|
| Model approval/rejection events (3.4) | not started | M | medium — enables corpus |
| Corpus storage + retrieval (3.4) | not started | L | medium — high value but complex |
| `get_similar_examples` MCP tool (3.4) | not started | M | medium |
| Threshold alerts for gaps (3.5) | not started | S | low — nice-to-have |
| Cross-session workaround sharing (3.5) | not started | M | **high** — prevents redundant agent pain |
| Candidate-to-issue pipeline (3.5) | not started | S | low |

**Recommended next actions:**
1. Add `get_known_workarounds(limitation)` MCP tool — small, high-value, leverages existing aggregation
2. Add `model.approved` / `model.rejected` event types — foundational for corpus
3. Build simple corpus retrieval by feature-kind and geometry-stat matching

---

## Key files

| File | Role |
|---|---|
| `worker/src/event-store.ts:28-61` | Agent telemetry event payload types |
| `worker/src/capability-gap-reducer.ts` | Gap aggregation reducer with KV persistence (174 lines) |
| `worker/src/agent-learning.ts` | API improvement candidate generation (200 lines) |
| `worker/src/live-session.ts:144,158-159` | Endpoint routing for gaps, workarounds, API improvements |
| `worker/src/live-session.ts:640-690` | Handlers: `handleCapabilityGap()`, `handleWorkaroundRecorded()` |
| `mcp/src/server.ts:322-360` | MCP tools: `report_capability_gap`, `record_workaround`, `suggest_api_improvements` |
| `worker/test/session.test.ts:111-280` | Integration tests for telemetry + API improvements |
| `worker/test/agent-learning.test.ts` | Unit tests for candidate generation |
| `worker/test/capability-gap-reducer.test.ts` | Unit tests for gap aggregation |
