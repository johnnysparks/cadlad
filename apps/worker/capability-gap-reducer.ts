export interface CapabilityGapEvent {
  projectId: string;
  sessionId: string;
  branchId?: string;
  revision: number;
  actorId?: string;
  message: string;
  context?: string;
  timestamp: number;
}

export interface CapabilityGapAggregateEntry {
  key: string;
  normalizedMessage: string;
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  latest: {
    message: string;
    context?: string;
    projectId: string;
    sessionId: string;
    branchId?: string;
    revision: number;
    actorId?: string;
  };
}

export interface CapabilityGapAggregateState {
  schemaVersion: 1;
  updatedAt: number;
  totalReports: number;
  uniqueGaps: number;
  entries: CapabilityGapAggregateEntry[];
}

const CAPABILITY_GAP_AGGREGATE_KEY = 'analytics:capability-gaps:v1';
const MAX_ENTRIES = 500;

export async function recordCapabilityGapEvent(kv: KVNamespace, event: CapabilityGapEvent): Promise<void> {
  const prior = parseAggregate(await kv.get(CAPABILITY_GAP_AGGREGATE_KEY));
  const next = reduceCapabilityGapEvents(prior.entries, event, prior.totalReports);
  await kv.put(CAPABILITY_GAP_AGGREGATE_KEY, JSON.stringify(next));
}

export async function getCapabilityGapSummary(
  kv: KVNamespace,
  opts: { limit?: number; minCount?: number } = {},
): Promise<CapabilityGapAggregateState> {
  const parsed = parseAggregate(await kv.get(CAPABILITY_GAP_AGGREGATE_KEY));
  const minCount = Math.max(1, Math.floor(opts.minCount ?? 1));
  const limit = Math.min(Math.max(Math.floor(opts.limit ?? 20), 1), 200);
  const entries = parsed.entries
    .filter((entry) => entry.count >= minCount)
    .sort((a, b) => b.count - a.count || b.lastSeenAt - a.lastSeenAt)
    .slice(0, limit);
  return {
    ...parsed,
    uniqueGaps: entries.length,
    entries,
  };
}

function reduceCapabilityGapEvents(
  entries: CapabilityGapAggregateEntry[],
  event: CapabilityGapEvent,
  totalReports: number,
): CapabilityGapAggregateState {
  const key = normalizeGapKey(event.message);
  const existing = entries.find((entry) => entry.key === key);
  if (existing) {
    existing.count += 1;
    existing.lastSeenAt = event.timestamp;
    existing.latest = {
      message: event.message.trim(),
      context: cleanOptionalText(event.context),
      projectId: event.projectId,
      sessionId: event.sessionId,
      branchId: event.branchId,
      revision: event.revision,
      actorId: event.actorId,
    };
  } else {
    entries.push({
      key,
      normalizedMessage: key,
      count: 1,
      firstSeenAt: event.timestamp,
      lastSeenAt: event.timestamp,
      latest: {
        message: event.message.trim(),
        context: cleanOptionalText(event.context),
        projectId: event.projectId,
        sessionId: event.sessionId,
        branchId: event.branchId,
        revision: event.revision,
        actorId: event.actorId,
      },
    });
  }
  const sorted = entries
    .sort((a, b) => b.count - a.count || b.lastSeenAt - a.lastSeenAt)
    .slice(0, MAX_ENTRIES);
  return {
    schemaVersion: 1,
    updatedAt: event.timestamp,
    totalReports: totalReports + 1,
    uniqueGaps: sorted.length,
    entries: sorted,
  };
}

function parseAggregate(raw: string | null): CapabilityGapAggregateState {
  if (!raw) {
    return { schemaVersion: 1, updatedAt: 0, totalReports: 0, uniqueGaps: 0, entries: [] };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CapabilityGapAggregateState>;
    if (!Array.isArray(parsed.entries)) throw new Error('bad entries');
    const entries = parsed.entries
      .map((entry) => normalizeEntry(entry))
      .filter((entry): entry is CapabilityGapAggregateEntry => Boolean(entry));
    return {
      schemaVersion: 1,
      updatedAt: Number(parsed.updatedAt ?? 0) || 0,
      totalReports: Number(parsed.totalReports ?? 0) || 0,
      uniqueGaps: entries.length,
      entries,
    };
  } catch {
    return { schemaVersion: 1, updatedAt: 0, totalReports: 0, uniqueGaps: 0, entries: [] };
  }
}

function normalizeEntry(entry: unknown): CapabilityGapAggregateEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  const typed = entry as Partial<CapabilityGapAggregateEntry>;
  if (typeof typed.key !== 'string' || typeof typed.normalizedMessage !== 'string') return null;
  if (!typed.latest || typeof typed.latest !== 'object') return null;
  const latest = typed.latest;
  if (typeof latest.message !== 'string') return null;
  return {
    key: typed.key,
    normalizedMessage: typed.normalizedMessage,
    count: Number(typed.count ?? 0) || 0,
    firstSeenAt: Number(typed.firstSeenAt ?? 0) || 0,
    lastSeenAt: Number(typed.lastSeenAt ?? 0) || 0,
    latest: {
      message: latest.message,
      context: cleanOptionalText(latest.context),
      projectId: String(latest.projectId ?? ''),
      sessionId: String(latest.sessionId ?? ''),
      branchId: cleanOptionalText(latest.branchId),
      revision: Number(latest.revision ?? 0) || 0,
      actorId: cleanOptionalText(latest.actorId),
    },
  };
}

function cleanOptionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeGapKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}
