// live-session.ts — Durable Object: one instance per live session

import type {
  Env,
  InitPayload,
  Patch,
  SessionEvent,
  SessionState,
  SessionSummary,
  ApplyPatchRequest,
  RevertRequest,
  PostRunResultRequest,
  RunResult,
} from './types.js';
import { createLinkCode, saveScreenshot } from './oauth-store.js';

const MAX_PATCHES = 100;
const HEARTBEAT_INTERVAL_MS = 25_000; // keep SSE connections alive

// ── Stored payload (everything we persist to DO storage) ─────────────────────

interface StoredSession {
  id: string;
  source: string;
  params: Record<string, number>;
  revision: number;
  lastSuccessfulRevision: number;
  patches: Patch[];
  writeToken: string;
  createdAt: number;
  updatedAt: number;
  lastRunResult?: RunResult | null;
}

// ── Durable Object ────────────────────────────────────────────────────────────

export class LiveSession implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly env: Env;

  // In-memory SSE connections: connectionId → writer
  private readonly sseClients: Map<string, WritableStreamDefaultWriter<Uint8Array>> = new Map();

  // Session state (loaded from storage in blockConcurrencyWhile)
  private id = '';
  private source = '';
  private params: Record<string, number> = {};
  private revision = 0;
  private lastSuccessfulRevision = 0;
  private patches: Patch[] = [];
  private writeToken = '';
  private createdAt = 0;
  private updatedAt = 0;
  /** Latest run result posted by a connected studio */
  private lastRunResult: RunResult | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<StoredSession>('session');
      if (stored) {
        this.id = stored.id;
        this.source = stored.source;
        this.params = stored.params;
        this.revision = stored.revision;
        this.lastSuccessfulRevision = stored.lastSuccessfulRevision;
        this.patches = stored.patches ?? [];
        this.writeToken = stored.writeToken;
        this.createdAt = stored.createdAt;
        this.updatedAt = stored.updatedAt;
        this.lastRunResult = stored.lastRunResult ?? null;
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
      if (request.method === 'GET' && sub === '/events') return this.handleSSE(request);
      if (request.method === 'GET' && sub === '/run-result') return this.handleGetRunResult();
      if (request.method === 'POST' && sub === '/patch') return this.handlePatch(request);
      if (request.method === 'POST' && sub === '/revert') return this.handleRevert(request);
      if (request.method === 'POST' && sub === '/run-result') return this.handlePostRunResult(request);
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
    this.lastSuccessfulRevision = 0;
    this.writeToken = body.writeToken;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();

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

  private handleSSE(request: Request): Response {
    const connectionId = crypto.randomUUID();
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    this.sseClients.set(connectionId, writer);

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
    if (body.runResult?.success) this.lastSuccessfulRevision = newRevision;

    this.addPatch(patch);
    this.updatedAt = Date.now();
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

    this.addPatch(revertPatch);
    this.updatedAt = Date.now();
    await this.persist();

    const event: SessionEvent = { type: 'patch_reverted', patch: revertPatch, session: this.summary() };
    this.broadcast(event);

    return ok({ patch: revertPatch, session: this.fullState() }, 201);
  }

  private handleGetRunResult(): Response {
    if (!this.lastRunResult) {
      return ok({ runResult: null, message: 'No run result posted yet. Connect CadLad Studio to the session and run the model.' });
    }
    return ok({ runResult: this.lastRunResult, revision: this.revision });
  }

  private async handlePostRunResult(request: Request): Promise<Response> {
    const authErr = this.checkAuth(request);
    if (authErr) return authErr;

    const body = await request.json() as PostRunResultRequest;
    if (typeof body.revision !== 'number' || !body.result) {
      return err('revision (number) and result (RunResult) are required', 'INVALID_REQUEST', 400);
    }

    this.lastRunResult = body.result;
    if (body.result.success) this.lastSuccessfulRevision = body.revision;

    // Persist screenshot to KV so it survives DO eviction
    if (body.result.screenshot && this.id) {
      void saveScreenshot(this.env.KV, this.id, body.result.screenshot);
    }

    this.updatedAt = Date.now();
    await this.persist();

    const event: SessionEvent = { type: 'run_result_posted', result: body.result, revision: body.revision };
    this.broadcast(event);

    return ok({ ok: true });
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

  private async persist(): Promise<void> {
    const stored: StoredSession = {
      id: this.id,
      source: this.source,
      params: this.params,
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
    };
    await this.state.storage.put('session', stored);
  }

  private broadcast(event: SessionEvent): void {
    const encoded = new TextEncoder().encode(sseMsg(event));
    const dead: string[] = [];
    for (const [id, writer] of this.sseClients) {
      writer.write(encoded).catch(() => dead.push(id));
    }
    for (const id of dead) this.sseClients.delete(id);
  }

  private fullState(): SessionState {
    return {
      id: this.id,
      source: this.source,
      params: { ...this.params },
      revision: this.revision,
      lastSuccessfulRevision: this.lastSuccessfulRevision,
      patches: [...this.patches],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  private summary(): SessionSummary {
    const { patches: _p, ...rest } = this.fullState();
    return rest;
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
