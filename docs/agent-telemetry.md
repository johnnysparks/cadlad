# Agent Telemetry & Learning

CadLad treats agents as participants whose struggles drive the platform roadmap. Structured telemetry captures what agents try, where they fail, and what hacks they resort to. This data feeds into API improvement candidates.

---

## Telemetry Events

Three agent-specific event types are emitted to the [event store](./sessions-and-history.md):

| Event type | When emitted | Key fields |
|---|---|---|
| `agent.intent_declared` | Agent submits a patch with `intent` field | `intent`, `summary`, `patchId`, `revision` |
| `agent.capability_gap` | Agent explicitly reports a gap | `message`, `category`, `blockedTask`, `attemptedApproach` |
| `agent.workaround_recorded` | Agent reports a hack | `summary`, `limitation`, `workaround`, `impact` (low/medium/high) |

### Capability Gap Categories

Gaps are bucketed for aggregation:
- `missing-primitive` — a shape/operation the API doesn't support
- `api-limitation` — the API exists but doesn't handle a specific case
- `validation-gap` — the system doesn't catch a problem it should
- `other` — uncategorized

### How Telemetry Gets Emitted

- **Patch submission:** When an agent submits a patch with `intent` and `approach` fields, an `agent.intent_declared` event is automatically emitted.
- **Explicit reporting:** Agents call `report_capability_gap` or `record_workaround` MCP tools at any time.
- **Actor tracking:** All events record `actor: { kind: 'agent', id?: string }` from request headers.

---

## MCP Tools

| Tool | What it does |
|---|---|
| `report_capability_gap` | Records a structured gap with category, blocked task, attempted approach |
| `record_workaround` | Records a hack with limitation, workaround steps, impact severity |
| `suggest_api_improvements` | Returns ranked improvement candidates from aggregated telemetry |

---

## Capability Gap Aggregation

A reducer aggregates capability gap events across all sessions into a ranked summary.

### How It Works

1. **Normalize:** Gap messages are lowercased, stripped of punctuation, truncated to 160 chars to create a stable key.
2. **Aggregate:** Identical gaps (by normalized key) are merged: count incremented, `lastSeenAt` updated, latest context preserved.
3. **Rank:** Entries sorted by count descending, then recency. Capped at 500 entries.
4. **Persist:** Aggregate state stored in Cloudflare KV (`analytics:capability-gaps:v1`).

### Query

`getCapabilityGapSummary(kv, { limit?, minCount? })` returns the filtered, ranked aggregate.

---

## API Improvement Candidates

The system analyzes workaround and capability gap events to propose API improvements.

### Generation Pipeline

1. **Group workarounds** by normalized pattern key (occurrences, limitations, workaround set, impact distribution).
2. **Aggregate gaps** similarly.
3. **Link gaps to workarounds** by key overlap (substring matching).
4. **Classify** each group as `primitive`, `helper`, `validator`, or `workflow` based on text pattern matching.
5. **Suggest name** — a sanitized API-style name (e.g., `threadPrimitive`, `slotHelper`).
6. **Check promotion** — groups with `occurrences >= threshold` (default: 2) are marked `promotion.ready = true`.

### Candidate Structure

```ts
interface ApiImprovementCandidate {
  id: string;
  pattern: string;
  occurrences: number;
  latestSummary: string;
  limitations: string[];
  sampleWorkarounds: string[];
  impact: { low, medium, high, unknown };
  proposedKind: 'primitive' | 'helper' | 'validator' | 'workflow';
  suggestedName: string;
  rationale: string;
  promotion: {
    ready: boolean;
    threshold: number;
    reason: 'recurrence-threshold-met' | 'needs-more-samples';
  };
  capabilityGapSignals: CapabilityGapSignal[];
}
```

### Access

| Surface | What it returns |
|---|---|
| `GET /api-improvements?threshold=N` | Full `ApiImprovementReport` |
| `suggest_api_improvements` MCP tool | Same report via MCP |

---

## Key Files

| File | Role |
|---|---|
| `apps/worker/event-store.ts` | Agent telemetry event payload types |
| `apps/worker/capability-gap-reducer.ts` | Gap aggregation reducer with KV persistence |
| `apps/worker/agent-learning.ts` | API improvement candidate generation |
| `apps/worker/live-session.ts` | Endpoint routing + handlers for gaps, workarounds, improvements |
| `apps/mcp-gateway/server.ts` | MCP tools: `report_capability_gap`, `record_workaround`, `suggest_api_improvements` |
