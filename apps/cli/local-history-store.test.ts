import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { ModelResult } from '@cadlad/kernel/types.js';
import { LocalHistoryStore } from './local-history-store.js';

function makeModelResult(): ModelResult {
  return {
    bodies: [],
    params: [{ name: 'width', value: 10 }],
    errors: [],
    diagnostics: [],
    hints: [],
    evaluation: {
      summary: { errorCount: 0, warningCount: 0 },
      typecheck: { status: 'pass', errorCount: 0, warningCount: 0, diagnostics: [] },
      semanticValidation: { status: 'pass', errorCount: 0, warningCount: 0, diagnostics: [] },
      geometryValidation: { status: 'pass', errorCount: 0, warningCount: 0, diagnostics: [] },
      relationValidation: { status: 'pass', errorCount: 0, warningCount: 0, diagnostics: [] },
      stats: {
        available: true,
        data: {
          triangles: 10,
          bodies: 1,
          componentCount: 1,
          boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
          volume: 100,
          surfaceArea: 200,
          parts: [],
          pairwise: [],
          checks: {
            hasZeroVolume: false,
            hasDegenerateBoundingBox: false,
            hasDisconnectedComponents: false,
          },
        },
      },
      tests: { status: 'skipped', total: 0, failures: 0, results: [] },
      render: { requested: false },
    },
  };
}

describe('local-history-store', () => {
  it('records revisions and supports branching/comparison', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cadlad-history-'));
    try {
      const file = join(dir, 'demo.forge.ts');
      writeFileSync(file, 'return box(1, 1, 1);', 'utf-8');

      const store = new LocalHistoryStore(file);
      await store.recordRun({
        source: 'return box(1,1,1);',
        params: { width: 10 },
        actor: { kind: 'human' },
        modelResult: makeModelResult(),
        recordEvents: true,
      });

      const alt = store.createBranch('alt', 1);
      expect(alt.name).toBe('alt');

      store.checkoutBranch('alt');
      await store.recordRun({
        source: 'return box(2,2,2);',
        params: { width: 20 },
        actor: { kind: 'agent', id: 'test-agent' },
        modelResult: makeModelResult(),
        recordEvents: true,
      });

      const comparison = store.compareBranches('main', 'alt');
      expect(comparison.branches.a.name).toBe('main');
      expect(comparison.branches.b.name).toBe('alt');

      const history = store.getHistory(10, 0);
      expect(history.total).toBe(2);
      expect(history.revisions[0].revision).toBe(1);
      expect(history.revisions[1].revision).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
