import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { ModelResult } from '../cad-kernel/types.js';
import type { EventActor, EventEnvelope, EventStore, StreamQuery } from '../core/event-store.js';
import { checkpointRevision, compareBranchHeads, createBranch, checkoutBranch, updateBranchHead, type BranchLike, type BranchHeadComparisonResult, type RevisionSnapshotLike, RevisionBranchError } from '../core/revision-branch.js';

interface RevisionRuntimeInfo {
  stats: ModelResult['evaluation']['stats']['data'] | null;
  validation: ModelResult['evaluation'] | null;
}

interface LocalHistoryState {
  schemaVersion: 'cadlad.local-history.v1';
  projectId: string;
  activeBranchId: string;
  revisions: RevisionSnapshotLike[];
  branches: BranchLike[];
  revisionRuntime: Record<number, RevisionRuntimeInfo | undefined>;
}

interface LocalEventRecord {
  schemaVersion: 'cadlad.local-events.v1';
  events: EventEnvelope[];
}

export interface LocalHistoryPaths {
  projectDir: string;
  storageDir: string;
  historyFile: string;
  eventsFile: string;
}

export interface RecordRunOptions {
  source: string;
  params: Record<string, number>;
  actor: EventActor;
  modelResult: ModelResult;
  sessionId?: string;
  recordEvents: boolean;
}

export interface RecordRunResult {
  revision: RevisionSnapshotLike;
  branch: BranchLike;
  eventCount: number;
}

export function resolveLocalHistoryPaths(modelFilePath: string): LocalHistoryPaths {
  const projectDir = dirname(resolve(modelFilePath));
  const storageDir = resolve(projectDir, '.cadlad');
  mkdirSync(storageDir, { recursive: true });
  return {
    projectDir,
    storageDir,
    historyFile: resolve(storageDir, 'history.json'),
    eventsFile: resolve(storageDir, 'events.json'),
  };
}

export class LocalJsonEventStore implements EventStore {
  constructor(private readonly filePath: string) {}

  async append(events: EventEnvelope[]): Promise<void> {
    if (events.length === 0) return;
    const data = this.readRecord();
    data.events.push(...events);
    data.events.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  async readStream(query: StreamQuery): Promise<EventEnvelope[]> {
    const limit = typeof query.limit === 'number' ? Math.min(Math.max(Math.floor(query.limit), 1), 500) : 100;
    const rows = this.readRecord().events.filter((event) => {
      if (event.projectId !== query.projectId) return false;
      if (query.branchId && event.branchId !== query.branchId) return false;
      if (query.types && query.types.length > 0 && !query.types.includes(event.type)) return false;
      if (query.afterTimestamp !== undefined && event.timestamp <= query.afterTimestamp) return false;
      if (query.beforeTimestamp !== undefined && event.timestamp >= query.beforeTimestamp) return false;
      return true;
    });
    return rows.slice(-limit);
  }

  private readRecord(): LocalEventRecord {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as LocalEventRecord;
      if (parsed?.schemaVersion === 'cadlad.local-events.v1' && Array.isArray(parsed.events)) {
        return parsed;
      }
    } catch {
      // no-op
    }
    return { schemaVersion: 'cadlad.local-events.v1', events: [] };
  }
}

export class LocalHistoryStore {
  private state: LocalHistoryState;
  readonly paths: LocalHistoryPaths;

  constructor(modelFilePath: string) {
    this.paths = resolveLocalHistoryPaths(modelFilePath);
    this.state = this.readState();
  }

  listBranches(): { activeBranchId: string; branches: BranchLike[] } {
    return {
      activeBranchId: this.state.activeBranchId,
      branches: this.state.branches,
    };
  }

  createBranch(name: string, fromRevision?: number, actor: EventActor = { kind: 'human' }): BranchLike {
    const created = createBranch({
      branches: this.state.branches,
      revisions: this.state.revisions,
      name,
      fromRevision: fromRevision ?? this.currentBranch().headRevision,
      actor,
    });
    this.state.branches = created.branches;
    this.persist();
    return created.branch;
  }

  checkoutBranch(idOrName: string): { branch: BranchLike; revision: RevisionSnapshotLike } {
    const branch = this.resolveBranch(idOrName);
    const checkout = checkoutBranch(this.state.branches, this.state.revisions, branch.id);
    this.state.activeBranchId = checkout.branch.id;
    this.persist();
    return checkout;
  }

  getHistory(limit = 50, offset = 0): { total: number; limit: number; offset: number; revisions: RevisionSnapshotLike[] } {
    const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 200);
    const boundedOffset = Math.max(Math.floor(offset), 0);
    const revisions = this.state.revisions.slice(boundedOffset, boundedOffset + boundedLimit);
    return {
      total: this.state.revisions.length,
      limit: boundedLimit,
      offset: boundedOffset,
      revisions,
    };
  }

  compareBranches(branchA: string, branchB: string): BranchHeadComparisonResult {
    const a = this.resolveBranch(branchA);
    const b = this.resolveBranch(branchB);

    const statsByRevision: Record<number, { triangles: number; bodies: number; volume?: number; surfaceArea?: number; componentCount?: number } | undefined> = {};
    const validationByRevision: Record<number, { errorCount?: number; warningCount?: number } | undefined> = {};
    for (const [revisionText, runtime] of Object.entries(this.state.revisionRuntime)) {
      const revision = Number(revisionText);
      if (!runtime) continue;
      statsByRevision[revision] = runtime.stats ?? undefined;
      validationByRevision[revision] = runtime.validation?.summary;
    }

    return compareBranchHeads({
      branches: this.state.branches,
      revisions: this.state.revisions,
      branchAId: a.id,
      branchBId: b.id,
      statsByRevision,
      validationByRevision,
    });
  }

  async recordRun(options: RecordRunOptions): Promise<RecordRunResult> {
    const branch = this.currentBranch();
    const revisionNumber = this.state.revisions.length === 0
      ? 1
      : Math.max(...this.state.revisions.map((entry) => entry.revision)) + 1;

    const checkpoint = await checkpointRevision({
      revisions: this.state.revisions,
      revision: revisionNumber,
      branchId: branch.id,
      source: options.source,
      params: options.params,
      eventIds: [],
      actor: options.actor,
      hashSource: async (source) => sha256(source),
    });

    const events: EventEnvelope[] = [];
    if (options.recordEvents) {
      const sourceEvent: EventEnvelope = {
        id: randomUUID(),
        projectId: this.state.projectId,
        branchId: branch.id,
        ...(options.sessionId ? { sessionId: options.sessionId } : {}),
        actor: options.actor,
        type: 'source.replaced',
        payload: {
          source: options.source,
          params: options.params,
          revision: revisionNumber,
        },
        timestamp: Date.now(),
      };
      const evaluationEvent: EventEnvelope = {
        id: randomUUID(),
        projectId: this.state.projectId,
        branchId: branch.id,
        ...(options.sessionId ? { sessionId: options.sessionId } : {}),
        actor: options.actor,
        type: 'evaluation.completed',
        payload: {
          revision: revisionNumber,
          success: options.modelResult.errors.length === 0,
          errorCount: options.modelResult.evaluation.summary.errorCount,
          warningCount: options.modelResult.evaluation.summary.warningCount,
          hasEvaluationBundle: Boolean(options.modelResult.evaluation),
        },
        timestamp: Date.now(),
      };
      events.push(sourceEvent, evaluationEvent);
      checkpoint.snapshot.eventIds = events.map((event) => event.id);
      checkpoint.snapshot.evaluation = {
        eventId: evaluationEvent.id,
        success: (evaluationEvent.payload as { success: boolean }).success,
        errorCount: (evaluationEvent.payload as { errorCount: number }).errorCount,
        warningCount: (evaluationEvent.payload as { warningCount: number }).warningCount,
        hasEvaluationBundle: (evaluationEvent.payload as { hasEvaluationBundle: boolean }).hasEvaluationBundle,
        timestamp: evaluationEvent.timestamp,
      };
    }

    this.state.revisions = checkpoint.revisions;
    this.state.branches = updateBranchHead(this.state.branches, branch.id, revisionNumber);
    this.state.revisionRuntime[revisionNumber] = {
      stats: options.modelResult.evaluation.stats.available ? (options.modelResult.evaluation.stats.data ?? null) : null,
      validation: options.modelResult.evaluation,
    };

    this.persist();

    if (events.length > 0) {
      const eventStore = new LocalJsonEventStore(this.paths.eventsFile);
      await eventStore.append(events);
    }

    return {
      revision: checkpoint.snapshot,
      branch: this.currentBranch(),
      eventCount: events.length,
    };
  }

  private currentBranch(): BranchLike {
    const branch = this.state.branches.find((entry) => entry.id === this.state.activeBranchId);
    if (!branch) {
      throw new RevisionBranchError('Active branch not found', 'BRANCH_NOT_FOUND', 404);
    }
    return branch;
  }

  private resolveBranch(idOrName: string): BranchLike {
    const query = idOrName.trim();
    const branch = this.state.branches.find((entry) => entry.id === query || entry.name === query);
    if (!branch) {
      throw new RevisionBranchError(`Branch "${query}" not found`, 'BRANCH_NOT_FOUND', 404);
    }
    return branch;
  }

  private readState(): LocalHistoryState {
    try {
      const raw = readFileSync(this.paths.historyFile, 'utf-8');
      const parsed = JSON.parse(raw) as LocalHistoryState;
      if (parsed?.schemaVersion === 'cadlad.local-history.v1' && Array.isArray(parsed.revisions) && Array.isArray(parsed.branches)) {
        return parsed;
      }
    } catch {
      // no-op
    }

    const mainBranch: BranchLike = {
      id: 'main',
      name: 'main',
      headRevision: 0,
      baseRevision: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      actor: { kind: 'human' },
    };

    return {
      schemaVersion: 'cadlad.local-history.v1',
      projectId: basename(this.paths.projectDir),
      activeBranchId: mainBranch.id,
      revisions: [],
      branches: [mainBranch],
      revisionRuntime: {},
    };
  }

  private persist(): void {
    writeFileSync(this.paths.historyFile, JSON.stringify(this.state, null, 2));
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
