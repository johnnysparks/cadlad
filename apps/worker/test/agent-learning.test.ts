import { describe, expect, it } from 'vitest';
import type { EventEnvelope } from '../event-store.js';
import { buildApiImprovementReport } from '../agent-learning.js';

function event<T>(type: EventEnvelope<T>['type'], payload: T, timestamp: number): EventEnvelope<T> {
  return {
    id: crypto.randomUUID(),
    projectId: 'project-1',
    branchId: 'project-1:main',
    sessionId: 'project-1',
    actor: { kind: 'agent', id: 'test-agent' },
    type,
    payload,
    timestamp,
  };
}

describe('buildApiImprovementReport', () => {
  it('promotes recurring workaround patterns into API candidates', () => {
    const events: EventEnvelope[] = [
      event('agent.workaround_recorded', {
        summary: 'Manual slot via subtract chain',
        limitation: 'No slot primitive exists',
        workaround: 'Created two cylinders and subtracted bridge box',
        impact: 'medium',
        revision: 3,
      }, 100),
      event('agent.workaround_recorded', {
        summary: 'Manual slot via subtract chain',
        limitation: 'No slot primitive exists',
        workaround: 'Repeated boolean subtraction for slot profile',
        impact: 'high',
        revision: 4,
      }, 200),
      event('agent.capability_gap', {
        message: 'Need slot helper',
        category: 'missing-primitive',
        workaroundSummary: 'Manual slot via subtract chain',
        revision: 4,
      }, 210),
    ];

    const report = buildApiImprovementReport(events, { promotionThreshold: 2 });

    expect(report.totalWorkarounds).toBe(2);
    expect(report.groupedPatterns).toBe(1);
    expect(report.promotedCount).toBe(1);
    expect(report.candidates[0]?.proposedKind).toBe('primitive');
    expect(report.candidates[0]?.promotion.ready).toBe(true);
    expect(report.candidates[0]?.capabilityGapSignals.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps candidates below threshold as non-promoted', () => {
    const events: EventEnvelope[] = [
      event('agent.workaround_recorded', {
        summary: 'Custom validation script',
        limitation: 'No geometry validator for this check',
        workaround: 'Added manual check in test harness',
        impact: 'low',
        revision: 2,
      }, 100),
    ];

    const report = buildApiImprovementReport(events, { promotionThreshold: 3 });
    expect(report.promotedCount).toBe(0);
    expect(report.candidates[0]?.promotion.ready).toBe(false);
    expect(report.candidates[0]?.proposedKind).toBe('validator');
  });
});
