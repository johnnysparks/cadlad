import type { EventActor } from './event-store.js';

export interface RevisionEvaluationRefLike {
  eventId: string;
  success: boolean;
  errorCount: number;
  warningCount: number;
  hasEvaluationBundle: boolean;
  timestamp: number;
}

export interface RevisionSnapshotLike {
  id: string;
  revision: number;
  branchId: string;
  parentRevision: number | null;
  sourceHash: string;
  source: string;
  params: Record<string, number>;
  eventIds: string[];
  createdAt: number;
  actor: EventActor;
  evaluation?: RevisionEvaluationRefLike;
}

export interface BranchLike {
  id: string;
  name: string;
  headRevision: number;
  baseRevision: number | null;
  createdAt: number;
  updatedAt: number;
  actor: EventActor;
}

export interface ComparableStats {
  triangles: number;
  bodies: number;
  volume?: number;
  surfaceArea?: number;
  componentCount?: number;
}

export interface BranchRevisionComparison {
  revision: number;
  sourceHash: string;
  params: Record<string, number>;
  evaluation: RevisionEvaluationRefLike | null;
}

export interface BranchHeadComparisonResult {
  branches: {
    a: { id: string; name: string; headRevision: number };
    b: { id: string; name: string; headRevision: number };
  };
  revisions: {
    a: BranchRevisionComparison;
    b: BranchRevisionComparison;
  };
  diff: {
    params: Record<string, { a: number | null; b: number | null; delta: number | null }>;
    stats: Record<string, number | null>;
    validation: {
      errorCountDelta: number;
      warningCountDelta: number;
    };
  };
}

export class RevisionBranchError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'BRANCH_NAME_CONFLICT'
      | 'BRANCH_NOT_FOUND'
      | 'REVISION_NOT_FOUND'
      | 'INVALID_REQUEST',
    readonly status: number,
  ) {
    super(message);
    this.name = 'RevisionBranchError';
  }
}

export interface CheckpointRevisionInput {
  revisions: RevisionSnapshotLike[];
  revision: number;
  branchId: string;
  source: string;
  params: Record<string, number>;
  eventIds: string[];
  actor: EventActor;
  hashSource: (source: string) => Promise<string>;
  now?: () => number;
  createId?: () => string;
}

export async function checkpointRevision(input: CheckpointRevisionInput): Promise<{ revisions: RevisionSnapshotLike[]; snapshot: RevisionSnapshotLike }> {
  const previous = input.revisions[input.revisions.length - 1];
  const sourceHash = await input.hashSource(input.source);
  const snapshot: RevisionSnapshotLike = {
    id: input.createId?.() ?? crypto.randomUUID(),
    revision: input.revision,
    branchId: input.branchId,
    parentRevision: previous?.revision ?? null,
    sourceHash,
    source: input.source,
    params: { ...input.params },
    eventIds: [...input.eventIds],
    createdAt: input.now?.() ?? Date.now(),
    actor: input.actor,
  };

  const existingIdx = input.revisions.findIndex((entry) => entry.revision === input.revision);
  if (existingIdx >= 0) {
    const existing = input.revisions[existingIdx];
    const updated = {
      ...snapshot,
      evaluation: existing.evaluation,
    };
    const revisions = [...input.revisions];
    revisions[existingIdx] = updated;
    return { revisions, snapshot: updated };
  }

  return {
    revisions: [...input.revisions, snapshot],
    snapshot,
  };
}

export interface CreateBranchInput {
  branches: BranchLike[];
  revisions: RevisionSnapshotLike[];
  name: string;
  fromRevision: number;
  actor: EventActor;
  now?: () => number;
  createId?: () => string;
}

export function createBranch(input: CreateBranchInput): { branches: BranchLike[]; branch: BranchLike } {
  const name = input.name.trim();
  if (!name) {
    throw new RevisionBranchError('name is required', 'INVALID_REQUEST', 400);
  }
  if (input.branches.some((branch) => branch.name === name)) {
    throw new RevisionBranchError('Branch name already exists', 'BRANCH_NAME_CONFLICT', 409);
  }
  const snapshot = input.revisions.find((entry) => entry.revision === input.fromRevision);
  if (!snapshot) {
    throw new RevisionBranchError('fromRevision not found', 'REVISION_NOT_FOUND', 404);
  }

  const ts = input.now?.() ?? Date.now();
  const branch: BranchLike = {
    id: input.createId?.() ?? crypto.randomUUID(),
    name,
    headRevision: input.fromRevision,
    baseRevision: input.fromRevision,
    createdAt: ts,
    updatedAt: ts,
    actor: input.actor,
  };

  return {
    branches: [...input.branches, branch],
    branch,
  };
}

export function checkoutBranch(branches: BranchLike[], revisions: RevisionSnapshotLike[], branchId: string): {
  branch: BranchLike;
  revision: RevisionSnapshotLike;
} {
  const branch = branches.find((entry) => entry.id === branchId);
  if (!branch) {
    throw new RevisionBranchError('Branch not found', 'BRANCH_NOT_FOUND', 404);
  }
  const revision = revisions.find((entry) => entry.revision === branch.headRevision);
  if (!revision) {
    throw new RevisionBranchError('Branch head revision not found', 'REVISION_NOT_FOUND', 404);
  }

  return { branch, revision };
}

export function updateBranchHead(branches: BranchLike[], activeBranchId: string | undefined, revision: number, now?: () => number): BranchLike[] {
  if (!activeBranchId) return branches;
  const idx = branches.findIndex((branch) => branch.id === activeBranchId);
  if (idx < 0) return branches;

  const updated = [...branches];
  updated[idx] = {
    ...updated[idx],
    headRevision: revision,
    updatedAt: now?.() ?? Date.now(),
  };
  return updated;
}

export function compareBranchHeads(input: {
  branches: BranchLike[];
  revisions: RevisionSnapshotLike[];
  branchAId: string;
  branchBId: string;
  statsByRevision?: Record<number, ComparableStats | undefined>;
  validationByRevision?: Record<number, { errorCount?: number; warningCount?: number } | undefined>;
}): BranchHeadComparisonResult {
  const branchA = input.branches.find((entry) => entry.id === input.branchAId);
  const branchB = input.branches.find((entry) => entry.id === input.branchBId);
  if (!branchA || !branchB) {
    throw new RevisionBranchError('One or both branches not found', 'BRANCH_NOT_FOUND', 404);
  }

  const revisionA = input.revisions.find((entry) => entry.revision === branchA.headRevision);
  const revisionB = input.revisions.find((entry) => entry.revision === branchB.headRevision);
  if (!revisionA || !revisionB) {
    throw new RevisionBranchError('One or both branch heads are missing revisions', 'REVISION_NOT_FOUND', 404);
  }

  const statsA = input.statsByRevision?.[revisionA.revision];
  const statsB = input.statsByRevision?.[revisionB.revision];
  const validationA = input.validationByRevision?.[revisionA.revision];
  const validationB = input.validationByRevision?.[revisionB.revision];

  return {
    branches: {
      a: { id: branchA.id, name: branchA.name, headRevision: branchA.headRevision },
      b: { id: branchB.id, name: branchB.name, headRevision: branchB.headRevision },
    },
    revisions: {
      a: {
        revision: revisionA.revision,
        sourceHash: revisionA.sourceHash,
        params: revisionA.params,
        evaluation: revisionA.evaluation ?? null,
      },
      b: {
        revision: revisionB.revision,
        sourceHash: revisionB.sourceHash,
        params: revisionB.params,
        evaluation: revisionB.evaluation ?? null,
      },
    },
    diff: {
      params: compareParams(revisionA.params, revisionB.params),
      stats: compareStats(statsA, statsB),
      validation: {
        errorCountDelta: (validationB?.errorCount ?? 0) - (validationA?.errorCount ?? 0),
        warningCountDelta: (validationB?.warningCount ?? 0) - (validationA?.warningCount ?? 0),
      },
    },
  };
}

function compareParams(a: Record<string, number>, b: Record<string, number>): Record<string, { a: number | null; b: number | null; delta: number | null }> {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diff: Record<string, { a: number | null; b: number | null; delta: number | null }> = {};
  for (const key of keys) {
    const av = a[key];
    const bv = b[key];
    diff[key] = {
      a: av ?? null,
      b: bv ?? null,
      delta: av === undefined || bv === undefined ? null : bv - av,
    };
  }
  return diff;
}

function compareStats(
  a: ComparableStats | undefined,
  b: ComparableStats | undefined,
): Record<string, number | null> {
  if (!a || !b) {
    return {
      triangles: null,
      bodies: null,
      volume: null,
      surfaceArea: null,
      componentCount: null,
    };
  }
  return {
    triangles: b.triangles - a.triangles,
    bodies: b.bodies - a.bodies,
    volume: (b.volume ?? 0) - (a.volume ?? 0),
    surfaceArea: (b.surfaceArea ?? 0) - (a.surfaceArea ?? 0),
    componentCount: (b.componentCount ?? 0) - (a.componentCount ?? 0),
  };
}
