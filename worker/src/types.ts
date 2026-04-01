// types.ts — Shared types for CadLad live-session backend

export interface SessionState {
  id: string;
  source: string;
  params: Record<string, number>;
  revision: number;
  lastSuccessfulRevision: number;
  patches: Patch[];
  createdAt: number;
  updatedAt: number;
}

export interface Patch {
  id: string;
  revision: number;
  type: 'create' | 'source_replace' | 'param_update' | 'revert';
  summary: string;
  sourceBefore: string;
  sourceAfter: string;
  paramsBefore: Record<string, number>;
  paramsAfter: Record<string, number>;
  /** Set when this patch undoes another patch */
  revertOf?: string;
  /** Populated by the client after running the model */
  runResult?: RunResult;
  createdAt: number;
}

export interface RunResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  timestamp: number;
}

// ── SSE event types ───────────────────────────────────────────────────────────

export type SessionEvent =
  | { type: 'session_snapshot'; session: SessionState }
  | { type: 'patch_applied'; patch: Patch; session: SessionSummary }
  | { type: 'patch_reverted'; patch: Patch; session: SessionSummary }
  | { type: 'run_status'; result: RunResult; revision: number }
  | { type: 'error'; message: string }
  | { type: 'heartbeat'; ts: number };

/** Session state without the full patch array (for event payloads) */
export type SessionSummary = Omit<SessionState, 'patches'>;

// ── HTTP request / response bodies ────────────────────────────────────────────

export interface CreateSessionRequest {
  source: string;
  params?: Record<string, number>;
}

export interface CreateSessionResponse {
  sessionId: string;
  writeToken: string;
  /** Studio URL with ?session=&token= pre-filled — paste into an assistant */
  liveUrl: string;
  session: SessionState;
}

export interface ApplyPatchRequest {
  type: 'source_replace' | 'param_update';
  /** New source text (required for source_replace) */
  source?: string;
  /** Param overrides to merge into current params */
  params?: Record<string, number>;
  /** Human-readable description of what changed */
  summary: string;
  /** Optional: pre-populated run result if caller already evaluated the model */
  runResult?: RunResult;
}

export interface RevertRequest {
  /** ID of the patch to revert (restores state to just before that patch) */
  patchId: string;
  summary?: string;
}

export interface ApiError {
  error: string;
  code: string;
}

// ── Internal init payload (worker → DO) ──────────────────────────────────────

export interface InitPayload {
  sessionId: string;
  writeToken: string;
  source: string;
  params: Record<string, number>;
}

// ── Worker env bindings ───────────────────────────────────────────────────────

export interface Env {
  LIVE_SESSION: DurableObjectNamespace;
  /**
   * The origin of the CadLad studio (e.g. https://cadlad.studio or
   * http://localhost:5173). Used to construct liveUrl and CORS headers.
   * Defaults to '*' when unset.
   */
  STUDIO_ORIGIN?: string;
}
