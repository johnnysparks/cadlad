import { describe, expect, it } from 'vitest';
import {
  checkpointRevision,
  compareBranchHeads,
  createBranch,
  checkoutBranch,
  updateBranchHead,
  RevisionBranchError,
} from './revision-branch.js';
import type { BranchLike, RevisionSnapshotLike } from './revision-branch.js';

const actor = { kind: 'human' as const };

describe('revision-branch core module', () => {
  it('checkpoints revisions and preserves existing evaluation on update', async () => {
    const initial = await checkpointRevision({
      revisions: [],
      revision: 1,
      branchId: 'main',
      source: 'return box(1,1,1);',
      params: { width: 1 },
      eventIds: ['evt-1'],
      actor,
      hashSource: async () => 'hash-1',
      createId: () => 'rev-1',
      now: () => 100,
    });

    const withEvaluation: RevisionSnapshotLike[] = [{
      ...initial.snapshot,
      evaluation: {
        eventId: 'eval-1',
        success: true,
        errorCount: 0,
        warningCount: 0,
        hasEvaluationBundle: true,
        timestamp: 123,
      },
    }];

    const updated = await checkpointRevision({
      revisions: withEvaluation,
      revision: 1,
      branchId: 'main',
      source: 'return box(2,1,1);',
      params: { width: 2 },
      eventIds: ['evt-2'],
      actor,
      hashSource: async () => 'hash-2',
      createId: () => 'rev-1b',
      now: () => 200,
    });

    expect(updated.revisions).toHaveLength(1);
    expect(updated.revisions[0].sourceHash).toBe('hash-2');
    expect(updated.revisions[0].evaluation?.eventId).toBe('eval-1');
  });

  it('creates, checks out, updates, and compares branches', () => {
    const revisions: RevisionSnapshotLike[] = [
      {
        id: 'r1',
        revision: 1,
        branchId: 'main',
        parentRevision: null,
        sourceHash: 'h1',
        source: 'a',
        params: { width: 10 },
        eventIds: ['e1'],
        createdAt: 100,
        actor,
      },
      {
        id: 'r2',
        revision: 2,
        branchId: 'alt',
        parentRevision: 1,
        sourceHash: 'h2',
        source: 'b',
        params: { width: 15, height: 2 },
        eventIds: ['e2'],
        createdAt: 200,
        actor,
      },
    ];
    const branches: BranchLike[] = [{
      id: 'main',
      name: 'main',
      headRevision: 1,
      baseRevision: null,
      createdAt: 100,
      updatedAt: 100,
      actor,
    }];

    const created = createBranch({
      branches,
      revisions,
      name: 'alt',
      fromRevision: 1,
      actor,
      createId: () => 'alt',
      now: () => 150,
    });

    const checkedOut = checkoutBranch(created.branches, revisions, 'alt');
    expect(checkedOut.revision.revision).toBe(1);

    const advanced = updateBranchHead(created.branches, 'alt', 2, () => 250);
    const comparison = compareBranchHeads({
      branches: advanced,
      revisions,
      branchAId: 'main',
      branchBId: 'alt',
      statsByRevision: {
        1: { triangles: 10, bodies: 1, volume: 20 },
        2: { triangles: 12, bodies: 2, volume: 24 },
      },
      validationByRevision: {
        1: { errorCount: 1, warningCount: 2 },
        2: { errorCount: 0, warningCount: 4 },
      },
    });

    expect(comparison.branches.b.headRevision).toBe(2);
    expect(comparison.diff.params.width.delta).toBe(5);
    expect(comparison.diff.params.height.a).toBeNull();
    expect(comparison.diff.stats.triangles).toBe(2);
    expect(comparison.diff.validation.errorCountDelta).toBe(-1);
    expect(comparison.diff.validation.warningCountDelta).toBe(2);
  });

  it('throws typed errors for invalid branch actions', () => {
    const revisions: RevisionSnapshotLike[] = [];
    const branches: BranchLike[] = [];

    expect(() => createBranch({
      branches,
      revisions,
      name: 'main',
      fromRevision: 1,
      actor,
    })).toThrowError(RevisionBranchError);

    expect(() => checkoutBranch(branches, revisions, 'missing')).toThrowError(RevisionBranchError);
  });
});
