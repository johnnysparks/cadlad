import type { AgentCapabilityGapPayload, AgentWorkaroundRecordedPayload, EventEnvelope } from './event-store.js';

export interface CapabilityGapSignal {
  id: string;
  message: string;
  category: AgentCapabilityGapPayload['category'];
  blockedTask?: string;
  workaroundSummary?: string;
  count: number;
  lastSeenAt: number;
}

export interface ApiImprovementCandidate {
  id: string;
  pattern: string;
  occurrences: number;
  latestSummary: string;
  limitations: string[];
  sampleWorkarounds: string[];
  impact: {
    low: number;
    medium: number;
    high: number;
    unknown: number;
  };
  proposedKind: 'primitive' | 'helper' | 'validator' | 'workflow';
  suggestedName: string;
  rationale: string;
  promotion: {
    ready: boolean;
    threshold: number;
    reason: string;
  };
  capabilityGapSignals: CapabilityGapSignal[];
}

export interface ApiImprovementReport {
  generatedAt: number;
  totalWorkarounds: number;
  groupedPatterns: number;
  promotedCount: number;
  candidates: ApiImprovementCandidate[];
}

const DEFAULT_PROMOTION_THRESHOLD = 2;

interface GapAggregate {
  count: number;
  lastSeenAt: number;
  payload: AgentCapabilityGapPayload;
}

interface WorkaroundGroup {
  key: string;
  latestSummary: string;
  limitations: Set<string>;
  workarounds: Set<string>;
  occurrences: number;
  impacts: ApiImprovementCandidate['impact'];
  lastSeenAt: number;
}

export function buildApiImprovementReport(
  events: EventEnvelope[],
  opts: { promotionThreshold?: number } = {},
): ApiImprovementReport {
  const promotionThreshold = Math.max(1, Math.floor(opts.promotionThreshold ?? DEFAULT_PROMOTION_THRESHOLD));
  const workaroundGroups = new Map<string, WorkaroundGroup>();
  const capabilityGaps = new Map<string, GapAggregate>();

  for (const event of events) {
    if (event.type === 'agent.workaround_recorded') {
      const payload = event.payload as AgentWorkaroundRecordedPayload;
      const key = normalizePatternKey(payload.summary || payload.limitation || payload.workaround);
      const existing = workaroundGroups.get(key) ?? {
        key,
        latestSummary: payload.summary,
        limitations: new Set<string>(),
        workarounds: new Set<string>(),
        occurrences: 0,
        impacts: { low: 0, medium: 0, high: 0, unknown: 0 },
        lastSeenAt: 0,
      };
      existing.latestSummary = payload.summary || existing.latestSummary;
      if (payload.limitation) existing.limitations.add(payload.limitation.trim());
      if (payload.workaround) existing.workarounds.add(payload.workaround.trim());
      existing.occurrences += 1;
      existing.lastSeenAt = Math.max(existing.lastSeenAt, event.timestamp);
      const impact = payload.impact ?? 'unknown';
      if (impact === 'low' || impact === 'medium' || impact === 'high') existing.impacts[impact] += 1;
      else existing.impacts.unknown += 1;
      workaroundGroups.set(key, existing);
    }

    if (event.type === 'agent.capability_gap') {
      const payload = event.payload as AgentCapabilityGapPayload;
      const key = normalizePatternKey(payload.workaroundSummary || payload.message || payload.blockedTask || 'gap');
      const existing = capabilityGaps.get(key) ?? {
        count: 0,
        lastSeenAt: 0,
        payload,
      };
      existing.count += 1;
      existing.lastSeenAt = Math.max(existing.lastSeenAt, event.timestamp);
      existing.payload = payload;
      capabilityGaps.set(key, existing);
    }
  }

  const sorted = [...workaroundGroups.values()].sort((a, b) => b.occurrences - a.occurrences || b.lastSeenAt - a.lastSeenAt);
  const candidates = sorted.map((group, index) => toCandidate(group, capabilityGaps, promotionThreshold, index));

  return {
    generatedAt: Date.now(),
    totalWorkarounds: sorted.reduce((sum, group) => sum + group.occurrences, 0),
    groupedPatterns: sorted.length,
    promotedCount: candidates.filter((candidate) => candidate.promotion.ready).length,
    candidates,
  };
}

function toCandidate(
  group: WorkaroundGroup,
  capabilityGaps: Map<string, GapAggregate>,
  threshold: number,
  index: number,
): ApiImprovementCandidate {
  const proposedKind = inferKind(group);
  const suggestedName = inferSuggestedName(group, proposedKind, index);
  const linkedGaps = [...capabilityGaps.entries()]
    .filter(([gapKey]) => gapKey === group.key || group.key.includes(gapKey) || gapKey.includes(group.key))
    .map(([gapKey, entry]) => ({
      id: gapKey,
      message: entry.payload.message,
      category: entry.payload.category,
      blockedTask: entry.payload.blockedTask,
      workaroundSummary: entry.payload.workaroundSummary,
      count: entry.count,
      lastSeenAt: entry.lastSeenAt,
    }));

  const ready = group.occurrences >= threshold;
  const rationale = ready
    ? `Observed ${group.occurrences} recurring workarounds; promote to a first-class ${proposedKind}.`
    : `Seen ${group.occurrences} time; collect more telemetry before promoting.`;

  return {
    id: `candidate-${index + 1}`,
    pattern: group.key,
    occurrences: group.occurrences,
    latestSummary: group.latestSummary,
    limitations: [...group.limitations].slice(0, 5),
    sampleWorkarounds: [...group.workarounds].slice(0, 3),
    impact: group.impacts,
    proposedKind,
    suggestedName,
    rationale,
    promotion: {
      ready,
      threshold,
      reason: ready ? 'recurrence-threshold-met' : 'needs-more-samples',
    },
    capabilityGapSignals: linkedGaps,
  };
}

function inferKind(group: WorkaroundGroup): ApiImprovementCandidate['proposedKind'] {
  const text = `${group.latestSummary} ${[...group.limitations].join(' ')} ${[...group.workarounds].join(' ')}`.toLowerCase();
  if (text.includes('validate') || text.includes('check') || text.includes('rule')) return 'validator';
  if (text.includes('slot') || text.includes('hole') || text.includes('thread') || text.includes('gear')) return 'primitive';
  if (text.includes('subtract') || text.includes('union') || text.includes('pattern') || text.includes('translate')) return 'helper';
  return 'workflow';
}

function inferSuggestedName(group: WorkaroundGroup, kind: ApiImprovementCandidate['proposedKind'], index: number): string {
  const base = group.key.split('-').slice(0, 3).join('_') || `candidate_${index + 1}`;
  const sanitized = base.replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  switch (kind) {
    case 'primitive':
      return `${sanitized || 'new'}Primitive`;
    case 'validator':
      return `${sanitized || 'new'}Validator`;
    case 'helper':
      return `${sanitized || 'new'}Helper`;
    default:
      return `${sanitized || 'new'}Workflow`;
  }
}

function normalizePatternKey(input: string): string {
  const tokens = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .slice(0, 6);
  if (tokens.length === 0) return 'general-workaround';
  return tokens.join('-');
}
