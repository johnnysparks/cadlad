import { describe, expect, it } from 'vitest';
import { getCapabilityGapSummary, recordCapabilityGapEvent } from '../src/capability-gap-reducer.js';

class InMemoryKv {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

}

describe('capability gap reducer', () => {
  it('aggregates repeated capability gaps under a normalized key', async () => {
    const kv = new InMemoryKv();

    await recordCapabilityGapEvent(kv as unknown as KVNamespace, {
      projectId: 'p1',
      sessionId: 's1',
      branchId: 's1:main',
      revision: 2,
      actorId: 'agent-a',
      message: 'Need semantic hole-adding helper',
      context: 'Hand-wrote subtract chain',
      timestamp: 100,
    });
    await recordCapabilityGapEvent(kv as unknown as KVNamespace, {
      projectId: 'p2',
      sessionId: 's2',
      branchId: 's2:main',
      revision: 5,
      actorId: 'agent-b',
      message: 'Need semantic hole adding helper!',
      context: 'Repeated in second model',
      timestamp: 200,
    });
    await recordCapabilityGapEvent(kv as unknown as KVNamespace, {
      projectId: 'p2',
      sessionId: 's2',
      branchId: 's2:alt',
      revision: 7,
      actorId: 'agent-b',
      message: 'No thread primitive for screws',
      context: 'Approximated with crude helix',
      timestamp: 300,
    });

    const summary = await getCapabilityGapSummary(kv as unknown as KVNamespace);
    expect(summary.totalReports).toBe(3);
    expect(summary.entries).toHaveLength(2);
    expect(summary.entries[0].key).toBe('need semantic hole adding helper');
    expect(summary.entries[0].count).toBe(2);
    expect(summary.entries[0].lastSeenAt).toBe(200);
    expect(summary.entries[0].latest.sessionId).toBe('s2');
    expect(summary.entries[1].key).toBe('no thread primitive for screws');
    expect(summary.entries[1].count).toBe(1);
  });

  it('supports filtering with minCount and limit', async () => {
    const kv = new InMemoryKv();
    await recordCapabilityGapEvent(kv as unknown as KVNamespace, {
      projectId: 'p',
      sessionId: 's',
      revision: 1,
      message: 'A',
      timestamp: 1,
    });
    await recordCapabilityGapEvent(kv as unknown as KVNamespace, {
      projectId: 'p',
      sessionId: 's',
      revision: 2,
      message: 'B',
      timestamp: 2,
    });
    await recordCapabilityGapEvent(kv as unknown as KVNamespace, {
      projectId: 'p',
      sessionId: 's',
      revision: 3,
      message: 'B',
      timestamp: 3,
    });

    const filtered = await getCapabilityGapSummary(kv as unknown as KVNamespace, { minCount: 2, limit: 1 });
    expect(filtered.entries).toHaveLength(1);
    expect(filtered.entries[0].key).toBe('b');
    expect(filtered.entries[0].count).toBe(2);
  });
});
