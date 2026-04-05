// live-session.ts — Durable Object: one instance per live session

import type {
  Env,
  InitPayload,
  BranchState,
  SessionCursorState,
  SessionObserverSummary,
  Patch,
  SessionEvent,
  SessionState,
  SessionSummary,
  ApplyPatchRequest,
  RevertRequest,
  PostRunResultRequest,
  RenderStatus,
  RunResult,
  CapabilityGapRequest,
  WorkaroundRecordedRequest,
  RevisionSnapshot,
  RevisionEvaluationRef,
  Branch,
} from './types.js';
import { createLinkCode, saveScreenshot } from './oauth-store.js';
import type { EventActor, EventEnvelope, EventType } from './event-store.js';
import { SqliteEventStore, createDurableObjectSqliteRunner } from './event-store.js';
import { recordCapabilityGapEvent } from './capability-gap-reducer.js';
import { buildApiImprovementReport } from './agent-learning.js';
import {
  checkpointRevision as checkpointRevisionSnapshot,
  compareBranchHeads,
  createBranch,
  checkoutBranch,
  updateBranchHead,
  RevisionBranchError,
} from '../../src/core/revision-branch.js';

const MAX_PATCHES = 100;
const HEARTBEAT_INTERVAL_MS = 25_000; // keep SSE connections alive

// ── Stored payload (everything we persist to DO storage) ─────────────────────

interface StoredSession {
  id: string;
  source: string;
  params: Record<string, number>;
  branch: BranchState;
  cursor: SessionCursorState;
  revision: number;
  lastSuccessfulRevision: number;
  patches: Patch[];
  writeToken: string;
  createdAt: number;
  updatedAt: number;
  lastRunResult?: RunResult | null;
  lastRunRevision?: number | null;
  revisions?: RevisionSnapshot[];
  branches?: Branch[];
  activeBranchId?: string;
}

// ── Durable Object ────────────────────────────────────────────────────────────

export class LiveSession implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly env: Env;

  // In-memory SSE connections: connectionId → writer
  private readonly sseClients: Map<string, {
    writer: WritableStreamDefaultWriter<Uint8Array>;
    observer: SessionObserverSummary;
  }> = new Map();

  // Session state (loaded from storage in blockConcurrencyWhile)
  private id = '';
  private source = '';
  private params: Record<string, number> = {};
  private branch: BranchState = {
    id: '',
    name: 'main',
    headRevision: 0,
    createdFromRevision: null,
    createdAt: 0,
  };
  private cursor: SessionCursorState = {
    branchId: '',
    baseRevision: 0,
    headRevision: 0,
    checkpointRevision: 0,
  };
  private revision = 0;
  private lastSuccessfulRevision = 0;
  private patches: Patch[] = [];
  private writeToken = '';
  private createdAt = 0;
  private updatedAt = 0;
  /** Latest run result posted by a connected studio */
  private lastRunResult: RunResult | null = null;
  /** Revision associated with lastRunResult */
  private lastRunRevision: number | null = null;
  private revisions: RevisionSnapshot[] = [];
  private branches: Branch[] = [];
  private activeBranchId = '';
  private readonly eventStore: SqliteEventStore;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.eventStore = new SqliteEventStore(createDurableObjectSqliteRunner(this.state.storage.sql));

    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<StoredSession>('session');
      if (stored) {
        this.id = stored.id;
        this.source = stored.source;
        this.params = stored.params;
        this.branch = stored.branch ?? this.branch;
        this.cursor = stored.cursor ?? this.cursor;
        this.revision = stored.revision;
        this.lastSuccessfulRevision = stored.lastSuccessfulRevision;
        this.patches = stored.patches ?? [];
        this.writeToken = stored.writeToken;
        this.createdAt = stored.createdAt;
        this.updatedAt = stored.updatedAt;
        this.lastRunResult = stored.lastRunResult ?? null;
        this.lastRunRevision = stored.lastRunRevision ?? null;
        this.revisions = stored.revisions ?? [];
        this.branches = stored.branches ?? [];
        this.activeBranchId = stored.activeBranchId ?? '';
        this.ensureCursorDefaults();
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Strip /api/live/session/:id prefix to get the sub-path
    const sub = (url.pathname.match(/^\/api\/live\/session\/[^/]+(\/[^?]*)?/) ?? [])[1] ?? '';

    try {
      // CORS preflight (belt-and-suspenders; worker handles it too)
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

      // Internal init (worker → DO only, not exposed publicly)
      if (request.method === 'POST' && sub === '/init') return this.handleInit(request);

      if (!this.id) return err('Session not found', 'NOT_FOUND', 404);

      if (request.method === 'GET' && (sub === '' || sub === '/')) return this.handleGetSession();
      if (request.method === 'GET' && sub === '/history') return this.handleGetHistory(url);
      if (request.method === 'GET' && sub === '/event-log') return this.handleGetEventLog(url);
      if (request.method === 'GET' && sub === '/api-improvements') return this.handleGetApiImprovements(url);
      if (request.method === 'GET' && sub === '/revisions') return this.handleGetRevisions(url);
      const revisionMatch = sub.match(/^\/revisions\/(\d+)$/);
      if (request.method === 'GET' && revisionMatch) return this.handleGetRevision(Number(revisionMatch[1]));
      if (request.method === 'GET' && sub === '/branches') return this.handleGetBranches();
      if (request.method === 'POST' && sub === '/branches') return this.handleCreateBranch(request);
      const branchCheckoutMatch = sub.match(/^\/branches\/([^/]+)\/checkout$/);
      if (request.method === 'POST' && branchCheckoutMatch) return this.handleCheckoutBranch(request, branchCheckoutMatch[1]);
      if (request.method === 'GET' && sub === '/compare-branches') return this.handleCompareBranches(url);
      if (request.method === 'GET' && sub === '/events') return this.handleSSE(request);
      if (request.method === 'GET' && sub === '/run-result') return this.handleGetRunResult();
      if (request.method === 'POST' && sub === '/patch') return this.handlePatch(request);
      if (request.method === 'POST' && sub === '/revert') return this.handleRevert(request);
      if (request.method === 'POST' && sub === '/run-result') return this.handlePostRunResult(request);
      if (request.method === 'POST' && sub === '/capability-gap') return this.handleCapabilityGap(request);
      if (request.method === 'POST' && sub === '/workaround') return this.handleWorkaroundRecorded(request);
      // Studio calls this to generate a link code for OAuth authorization
      if (request.method === 'POST' && sub === '/link') return this.handleCreateLink(request);

      return err('Not found', 'NOT_FOUND', 404);
    } catch (e) {
      console.error('[LiveSession] unhandled error', e);
      return err('Internal error', 'INTERNAL_ERROR', 500);
    }
  }

  // ── Route handlers ──────────────────────────────────────────────────────────

  private async handleInit(request: Request): Promise<Response> {
    const body = await request.json() as InitPayload;

    this.id = body.sessionId;
    this.source = body.source ?? '';
    this.params = body.params ?? {};
    this.revision = 1;
    this.branch = {
      id: `${this.id}:main`,
      name: 'main',
      headRevision: this.revision,
      createdFromRevision: null,
      createdAt: Date.now(),
    };
    this.cursor = {
      branchId: this.branch.id,
      baseRevision: this.revision,
      headRevision: this.revision,
      checkpointRevision: this.revision,
    };
    this.lastSuccessfulRevision = 0;
    this.writeToken = body.writeToken;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    const mainBranch: Branch = {
      id: crypto.randomUUID(),
      name: 'main',
      headRevision: 1,
      baseRevision: null,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      actor: { kind: 'human' },
    };
    this.branches = [mainBranch];
    this.activeBranchId = mainBranch.id;

    const initial: Patch = {
      id: crypto.randomUUID(),
      revision: 1,
      type: 'create',
      summary: 'Session created',
      sourceBefore: '',
      sourceAfter: this.source,
      paramsBefore: {},
      paramsAfter: { ...this.params },
      createdAt: this.createdAt,
    };
    this.patches = [initial];

    const initEvents = [
      this.makeEvent('source.replaced', {
        source: this.source,
        params: { ...this.params },
        revision: this.revision,
      }, this.resolveActor(request)),
    ];
    await this.appendEvents(initEvents);
    await this.checkpointRevision({
      revision: this.revision,
      eventIds: initEvents.map((event) => event.id),
      actor: initEvents[0].actor,
    });

    await this.persist();
    return ok(this.fullState());
  }

  private handleGetSession(): Response {
    return ok(this.fullState());
  }

  private handleGetHistory(url: URL): Response {
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const slice = this.patches.slice(offset, offset + limit);
    return ok({ patches: slice, total: this.patches.length, offset, limit });
  }

  private async handleGetEventLog(url: URL): Promise<Response> {
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '100', 10), 500);
    const type = url.searchParams.get('type');
    const afterTimestamp = parseInt(url.searchParams.get('after') ?? '', 10);
    const beforeTimestamp = parseInt(url.searchParams.get('before') ?? '', 10);
    const events = await this.eventStore.readStream({
      projectId: this.id,
      branchId: this.branch.id,
      limit,
      types: type ? [type as EventType] : undefined,
      afterTimestamp: Number.isFinite(afterTimestamp) ? afterTimestamp : undefined,
      beforeTimestamp: Number.isFinite(beforeTimestamp) ? beforeTimestamp : undefined,
    });
    return ok({ events, total: events.length, limit });
  }


  private async handleGetApiImprovements(url: URL): Promise<Response> {
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '500', 10), 2000);
    const threshold = Math.max(parseInt(url.searchParams.get('threshold') ?? '2', 10), 1);
    const events = await this.eventStore.readStream({
      projectId: this.id,
      branchId: this.branch.id,
      limit,
      types: ['agent.capability_gap', 'agent.workaround_recorded'],
    });
    const report = buildApiImprovementReport(events, { promotionThreshold: threshold });
    return ok({
      branchId: this.branch.id,
      threshold,
      eventSampleSize: events.length,
      report,
    });
  }

  private handleGetRevisions(url: URL): Response {
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);
    const slice = this.revisions.slice(offset, offset + limit);
    return ok({ revisions: slice, total: this.revisions.length, offset, limit });
  }

  private handleGetRevision(revision: number): Response {
    const snapshot = this.revisions.find((entry) => entry.revision === revision);
    if (!snapshot) return err('Revision not found', 'REVISION_NOT_FOUND', 404);
    const patch = this.patches.find((entry) => entry.revision === revision);
    return ok({
      revision: snapshot,
      runResult: patch?.runResult ?? null,
      source: snapshot.source,
      params: snapshot.params,
      stats: patch?.runResult?.stats ?? null,
      validation: patch?.runResult?.evaluation ?? null,
    });
  }

  private handleGetBranches(): Response {
    return ok({
      activeBranchId: this.activeBranchId || null,
      branches: this.branches,
    });
  }

  private async handleCreateBranch(request: Request): Promise<Response> {
    const authErr = this.checkAuth(request);
    if (authErr) return authErr;

    const body = await request.json() as { name?: string; fromRevision?: number };
    const fromRevision = typeof body.fromRevision === 'number' ? body.fromRevision : this.revision;
    const actor = this.resolveActor(request);

    try {
      const result = createBranch({
        branches: this.branches,
        revisions: this.revisions,
        name: body.name ?? '',
        fromRevision,
        actor,
      });
      this.branches = result.branches as Branch[];
      await this.persist();
      return ok({ branch: result.branch }, 201);
    } catch (error) {
      if (error instanceof RevisionBranchError) {
        return err(error.message, error.code, error.status);
      }
      throw error;
    }
  }

  private async handleCheckoutBranch(request: Request, branchId: string): Promise<Response> {
    const authErr = this.checkAuth(request);
    if (authErr) return authErr;

    try {
      const { branch, revision } = checkoutBranch(this.branches, this.revisions, branchId);
      this.activeBranchId = branch.id;
      this.source = revision.source;
      this.params = { ...revision.params };
      this.revision = revision.revision;
      this.updatedAt = Date.now();
      await this.persist();
      return ok({
        branch,
        session: this.fullState(),
        message: `Checked out branch "${branch.name}" at revision ${branch.headRevision}.`,
      });
    } catch (error) {
      if (error instanceof RevisionBranchError) {
        return err(error.message, error.code, error.status);
      }
      throw error;
    }
  }

  private handleCompareBranches(url: URL): Response {
    const branchAId = url.searchParams.get('a');
    const branchBId = url.searchParams.get('b');
    if (!branchAId || !branchBId) {
      return err('Query params "a" and "b" are required', 'INVALID_REQUEST', 400);
    }
    const statsByRevision: Record<number, { triangles: number; bodies: number; volume?: number; surfaceArea?: number; componentCount?: number } | undefined> = {};
    const validationByRevision: Record<number, { errorCount?: number; warningCount?: number } | undefined> = {};
    for (const patch of this.patches) {
      statsByRevision[patch.revision] = patch.runResult?.stats;
      validationByRevision[patch.revision] = patch.runResult?.evaluation?.summary;
    }
    try {
      const result = compareBranchHeads({
        branches: this.branches,
        revisions: this.revisions,
        branchAId,
        branchBId,
        statsByRevision,
        validationByRevision,
      });
      return ok(result);
    } catch (error) {
      if (error instanceof RevisionBranchError) {
        return err(error.message, error.code, error.status);
      }
      throw error;
    }
  }

  private handleSSE(request: Request): Response {
    const connectionId = crypto.randomUUID();
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    const observer = this.resolveObserver(request);
    this.sseClients.set(connectionId, { writer, observer });

    const cleanup = () => {
      this.sseClients.delete(connectionId);
      writer.close().catch(() => {});
    };

    // Detect client disconnect via AbortSignal (best-effort in CF environment)
    request.signal?.addEventListener('abort', cleanup);

    // Send initial snapshot immediately
    const snapshot: SessionEvent = { type: 'session_snapshot', session: this.fullState() };
    writer.write(encoder.encode(sseMsg(snapshot))).catch(cleanup);

    // Heartbeat to keep the connection alive through proxies and CF timeouts
    const heartbeat = setInterval(() => {
      const evt: SessionEvent = { type: 'heartbeat', ts: Date.now() };
      writer.write(encoder.encode(sseMsg(evt))).catch(() => {
        clearInterval(heartbeat);
        cleanup();
      });
    }, HEARTBEAT_INTERVAL_MS);

    // Heartbeat failures (caught above) clear the interval when the stream closes.
    // The abort signal also cleans up synchronously when the client disconnects.

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  private async handlePatch(request: Request): Promise<Response> {
    const authErr = this.checkAuth(request);
    if (authErr) return authErr;

    const body = await request.json() as ApplyPatchRequest;
    if (!body.type || !body.summary) return err('type and summary are required', 'INVALID_REQUEST', 400);

    const newRevision = this.revision + 1;
    const patch: Patch = {
      id: crypto.randomUUID(),
      revision: newRevision,
      type: body.type,
      summary: body.summary,
      sourceBefore: this.source,
      sourceAfter: body.source ?? this.source,
      paramsBefore: { ...this.params },
      paramsAfter: body.params ? { ...this.params, ...body.params } : { ...this.params },
      runResult: body.runResult,
      createdAt: Date.now(),
    };

    this.source = patch.sourceAfter;
    this.params = patch.paramsAfter;
    this.revision = newRevision;
    this.branch.headRevision = newRevision;
    this.cursor.headRevision = newRevision;
    if (body.runResult?.success) this.lastSuccessfulRevision = newRevision;

    this.addPatch(patch);
    this.updatedAt = Date.now();
    const actor = this.resolveActor(request);
    const events: EventEnvelope[] = [];
    if (body.type === 'source_replace') {
      events.push(this.makeEvent('source.replaced', {
        source: this.source,
        params: { ...this.params },
        revision: this.revision,
      }, actor));
    }
    if (body.type === 'param_update') {
      events.push(this.makeEvent('scene.param_set', {
        params: { ...this.params },
        changed: body.params ?? {},
        revision: this.revision,
      }, actor));
    }
    if (typeof body.intent === 'string' && body.intent.trim().length > 0) {
      events.push(this.makeEvent('agent.intent_declared', {
        intent: body.intent.trim(),
        summary: body.summary,
        patchId: patch.id,
        revision: this.revision,
      }, actor.kind === 'agent' ? actor : { kind: 'agent', id: actor.id }));
    }
    await this.appendEvents(events);
    await this.checkpointRevision({
      revision: this.revision,
      eventIds: events.map((event) => event.id),
      actor,
    });
    this.updateActiveBranchHead(this.revision);
    await this.persist();

    const event: SessionEvent = { type: 'patch_applied', patch, session: this.summary() };
    this.broadcast(event);

    return ok({ patch, session: this.fullState() }, 201);
  }

  private async handleRevert(request: Request): Promise<Response> {
    const authErr = this.checkAuth(request);
    if (authErr) return authErr;

    const body = await request.json() as RevertRequest;
    const target = this.patches.find(p => p.id === body.patchId);
    if (!target) return err('Patch not found', 'PATCH_NOT_FOUND', 404);

    const newRevision = this.revision + 1;
    const revertPatch: Patch = {
      id: crypto.randomUUID(),
      revision: newRevision,
      type: 'revert',
      summary: body.summary ?? `Revert "${target.summary}"`,
      sourceBefore: this.source,
      sourceAfter: target.sourceBefore,
      paramsBefore: { ...this.params },
      paramsAfter: { ...target.paramsBefore },
      revertOf: target.id,
      createdAt: Date.now(),
    };

    this.source = revertPatch.sourceAfter;
    this.params = revertPatch.paramsAfter;
    this.revision = newRevision;
    this.branch.headRevision = newRevision;
    this.cursor.headRevision = newRevision;

    this.addPatch(revertPatch);
    this.updatedAt = Date.now();
    const actor = this.resolveActor(request);
    const revertEvents = [
      this.makeEvent('source.replaced', {
        source: this.source,
        params: { ...this.params },
        revision: this.revision,
      }, actor),
    ];
    await this.appendEvents(revertEvents);
    await this.checkpointRevision({
      revision: this.revision,
      eventIds: revertEvents.map((event) => event.id),
      actor,
    });
    this.updateActiveBranchHead(this.revision);
    await this.persist();

    const event: SessionEvent = { type: 'patch_reverted', patch: revertPatch, session: this.summary() };
    this.broadcast(event);

    return ok({ patch: revertPatch, session: this.fullState() }, 201);
  }

  private handleGetRunResult(): Response {
    if (!this.lastRunResult) {
      return ok({
        runResult: null,
        revision: this.lastRunRevision ?? undefined,
        renderStatus: this.computeRenderStatus(),
        message: 'No run result posted yet. Connect CadLad Studio to the session and run the model.',
      });
    }
    return ok({
      runResult: this.lastRunResult,
      revision: this.lastRunRevision ?? this.revision,
      renderStatus: this.computeRenderStatus(),
    });
  }

  private async handlePostRunResult(request: Request): Promise<Response> {
    const authErr = this.checkAuth(request);
    if (authErr) return authErr;

    const body = await request.json() as PostRunResultRequest;
    if (typeof body.revision !== 'number' || !body.result) {
      return err('revision (number) and result (RunResult) are required', 'INVALID_REQUEST', 400);
    }

    this.lastRunResult = body.result;
    this.lastRunRevision = body.revision;
    if (body.result.success) this.lastSuccessfulRevision = body.revision;
    const matchingPatch = this.patches.find((patch) => patch.revision === body.revision);
    if (matchingPatch) {
      matchingPatch.runResult = body.result;
    }

    // Persist screenshot to KV so it survives DO eviction
    if (body.result.screenshot && this.id) {
      void saveScreenshot(this.env.KV, this.id, body.result.screenshot);
    }

    this.updatedAt = Date.now();
    const evaluationEvent = this.makeEvent('evaluation.completed', {
        revision: body.revision,
        success: body.result.success,
        errorCount: body.result.errors.length,
        warningCount: body.result.warnings.length,
        hasEvaluationBundle: Boolean(body.result.evaluation),
      }, this.resolveActor(request));
    await this.appendEvents([evaluationEvent]);
    this.attachEvaluationToRevision(body.revision, {
      eventId: evaluationEvent.id,
      success: body.result.success,
      errorCount: body.result.errors.length,
      warningCount: body.result.warnings.length,
      hasEvaluationBundle: Boolean(body.result.evaluation),
      timestamp: Date.now(),
    });
    await this.persist();

    const event: SessionEvent = { type: 'run_result_posted', result: body.result, revision: body.revision };
    this.broadcast(event);

    return ok({ ok: true });
  }

  private async handleCapabilityGap(request: Request): Promise<Response> {
    const authErr = this.checkAuth(request);
    if (authErr) return authErr;
    const body = await request.json() as CapabilityGapRequest;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length === 0) {
      return err('message is required', 'INVALID_REQUEST', 400);
    }
    const actor = this.resolveActor(request, { kind: 'agent' });
    const context = typeof body.context === 'string' ? body.context : undefined;
    await this.appendEvents([
      this.makeEvent('agent.capability_gap', {
        message: body.message.trim(),
        context: typeof body.context === 'string' ? body.context : undefined,
        category: normalizeGapCategory(body.category),
        blockedTask: cleanOptional(body.blockedTask),
        attemptedApproach: cleanOptional(body.attemptedApproach),
        workaroundSummary: cleanOptional(body.workaroundSummary),
        revision: this.revision,
      }, this.resolveActor(request, { kind: 'agent' })),
    ]);
    return ok({ ok: true }, 201);
  }

  private async handleWorkaroundRecorded(request: Request): Promise<Response> {
    const authErr = this.checkAuth(request);
    if (authErr) return authErr;
    const body = await request.json() as WorkaroundRecordedRequest;
    if (!isNonEmptyString(body.summary) || !isNonEmptyString(body.limitation) || !isNonEmptyString(body.workaround)) {
      return err('summary, limitation, and workaround are required', 'INVALID_REQUEST', 400);
    }
    const actor = this.resolveActor(request, { kind: 'agent' });
    const message = body.limitation.trim();
    const context = `summary=${body.summary.trim()}; workaround=${body.workaround.trim()}`;

    await this.appendEvents([
      this.makeEvent('agent.workaround_recorded', {
        summary: body.summary.trim(),
        limitation: body.limitation.trim(),
        workaround: body.workaround.trim(),
        impact: normalizeImpact(body.impact),
        patchId: cleanOptional(body.patchId),
        revision: this.revision,
      }, actor),
    ]);
    await recordCapabilityGapEvent(this.env.KV, {
      projectId: this.id,
      sessionId: this.id,
      branchId: this.branch.id,
      revision: this.revision,
      actorId: actor.id,
      message,
      context,
      timestamp: Date.now(),
    });
    return ok({ ok: true }, 201);
  }

  /**
   * POST /api/live/session/:id/link — generate a short-lived link code.
   * Requires write token auth. The code is shown to the user in the studio
   * and entered into the OAuth consent form to authorize a client like ChatGPT.
   */
  private async handleCreateLink(request: Request): Promise<Response> {
    const authErr = this.checkAuth(request);
    if (authErr) return authErr;

    const code = await createLinkCode(this.env.KV, this.id, this.writeToken);
    const expiresAt = Date.now() + 600_000; // 10 min, matching LINK_CODE_TTL_S in oauth-store
    return ok({ linkCode: code, expiresAt, expiresIn: 600 });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private checkAuth(request: Request): Response | null {
    const header = request.headers.get('Authorization');
    if (header?.startsWith('Bearer ') && header.slice(7) === this.writeToken) return null;
    const url = new URL(request.url);
    if (url.searchParams.get('token') === this.writeToken) return null;
    return err('Invalid or missing write token', 'UNAUTHORIZED', 401);
  }

  private addPatch(patch: Patch): void {
    this.patches.push(patch);
    if (this.patches.length > MAX_PATCHES) this.patches = this.patches.slice(-MAX_PATCHES);
  }

  private resolveActor(request: Request, fallback: EventActor = { kind: 'human' }): EventActor {
    const rawKind = request.headers.get('X-CadLad-Actor-Kind');
    const rawId = request.headers.get('X-CadLad-Actor-Id');
    const kind = rawKind === 'agent' || rawKind === 'human' ? rawKind : fallback.kind;
    const id = rawId && rawId.trim().length > 0 ? rawId.trim() : fallback.id;
    return id ? { kind, id } : { kind };
  }

  private ensureCursorDefaults(): void {
    if (!this.id) return;
    if (!this.branch.id) {
      this.branch = {
        id: `${this.id}:main`,
        name: this.branch.name || 'main',
        headRevision: this.revision,
        createdFromRevision: this.branch.createdFromRevision ?? null,
        createdAt: this.branch.createdAt || this.createdAt || Date.now(),
      };
    }
    this.branch.headRevision = this.revision;
    this.cursor = {
      branchId: this.branch.id,
      baseRevision: this.cursor.baseRevision || 1,
      headRevision: this.revision,
      checkpointRevision: this.cursor.checkpointRevision || this.revision,
    };
  }

  private resolveObserver(request: Request): SessionObserverSummary {
    const actor = this.resolveActor(request);
    return {
      kind: actor.kind,
      ...(actor.id ? { id: actor.id } : {}),
      connectedAt: Date.now(),
    };
  }

  private makeEvent<T>(
    type: EventType,
    payload: T,
    actor: EventActor,
  ): EventEnvelope<T> {
    return {
      id: crypto.randomUUID(),
      projectId: this.id,
      branchId: this.branch.id,
      sessionId: this.id,
      actor,
      type,
      payload,
      timestamp: Date.now(),
    };
  }

  private async appendEvents(events: EventEnvelope[]): Promise<void> {
    if (events.length === 0) return;
    await this.eventStore.append(events);
  }

  private async persist(): Promise<void> {
    const stored: StoredSession = {
      id: this.id,
      source: this.source,
      params: this.params,
      branch: this.branch,
      cursor: this.cursor,
      revision: this.revision,
      lastSuccessfulRevision: this.lastSuccessfulRevision,
      patches: this.patches,
      writeToken: this.writeToken,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      // Persist without screenshot to keep storage bounded
      lastRunResult: this.lastRunResult
        ? { ...this.lastRunResult, screenshot: undefined }
        : null,
      lastRunRevision: this.lastRunRevision,
      revisions: this.revisions,
      branches: this.branches,
      activeBranchId: this.activeBranchId,
    };
    await this.state.storage.put('session', stored);
  }

  private broadcast(event: SessionEvent): void {
    const encoded = new TextEncoder().encode(sseMsg(event));
    const dead: string[] = [];
    for (const [id, client] of this.sseClients) {
      client.writer.write(encoded).catch(() => dead.push(id));
    }
    for (const id of dead) this.sseClients.delete(id);
  }

  private fullState(): SessionState {
    return {
      id: this.id,
      source: this.source,
      params: { ...this.params },
      branch: { ...this.branch },
      cursor: { ...this.cursor },
      revision: this.revision,
      lastSuccessfulRevision: this.lastSuccessfulRevision,
      latestRender: this.computeRenderStatus(),
      patches: [...this.patches],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      observers: Array.from(this.sseClients.values()).map((client) => ({ ...client.observer })),
    };
  }

  private summary(): SessionSummary {
    const { patches: _p, ...rest } = this.fullState();
    return rest;
  }

  private computeRenderStatus(): RenderStatus {
    if (!this.lastRunResult || this.lastRunRevision === null) {
      return {
        state: 'no_render',
        message: 'No render exists yet for this session.',
      };
    }

    const base: RenderStatus = {
      state: 'ready',
      revision: this.lastRunRevision,
      timestamp: this.lastRunResult.timestamp,
      screenshotRef: this.lastRunResult.screenshot ? `session:${this.id}:rev:${this.lastRunRevision}` : undefined,
      message: 'Latest render is available.',
    };

    if (this.lastRunRevision < this.revision) {
      return {
        ...base,
        state: 'render_pending',
        message: `Render pending for revision ${this.revision}. Latest completed render is revision ${this.lastRunRevision}.`,
      };
    }

    if (!this.lastRunResult.success) {
      return {
        ...base,
        state: 'render_failed',
        message: this.lastRunResult.errors[0]
          ? `Latest render failed: ${this.lastRunResult.errors[0]}`
          : 'Latest render failed.',
      };
    }

    if (!this.lastRunResult.screenshot && this.lastRunResult.screenshotStatus === 'blocked') {
      return {
        ...base,
        state: 'screenshot_blocked',
        message: this.lastRunResult.screenshotStatusReason ?? 'Render succeeded, but screenshot retrieval was blocked by policy/tooling.',
      };
    }

    if (!this.lastRunResult.screenshot) {
      return {
        ...base,
        state: 'screenshot_blocked',
        message: this.lastRunResult.screenshotStatusReason ?? 'Render succeeded, but no screenshot was attached.',
      };
    }

    return base;
  }

  private async checkpointRevision(input: {
    revision: number;
    eventIds: string[];
    actor: EventActor;
  }): Promise<void> {
    const result = await checkpointRevisionSnapshot({
      revisions: this.revisions,
      revision: input.revision,
      branchId: this.branch.id,
      source: this.source,
      params: this.params,
      eventIds: input.eventIds,
      actor: input.actor,
      hashSource: hashText,
    });
    this.revisions = result.revisions as RevisionSnapshot[];
    this.cursor.checkpointRevision = input.revision;
  }

  private attachEvaluationToRevision(revision: number, evaluation: RevisionEvaluationRef): void {
    const target = this.revisions.find((entry) => entry.revision === revision);
    if (!target) return;
    target.evaluation = evaluation;
  }

  private updateActiveBranchHead(revision: number): void {
    this.branches = updateBranchHead(this.branches, this.activeBranchId, revision) as Branch[];
  }
}

// ── SSE / response utilities ──────────────────────────────────────────────────

function sseMsg(event: SessionEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function ok(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function err(message: string, code: string, status: number): Response {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

async function hashText(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function cleanOptional(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value.trim() : undefined;
}

function normalizeGapCategory(
  value: unknown,
): 'missing-primitive' | 'api-limitation' | 'validation-gap' | 'other' | undefined {
  if (value === 'missing-primitive' || value === 'api-limitation' || value === 'validation-gap' || value === 'other') {
    return value;
  }
  return undefined;
}

function normalizeImpact(value: unknown): 'low' | 'medium' | 'high' | undefined {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return undefined;
}
