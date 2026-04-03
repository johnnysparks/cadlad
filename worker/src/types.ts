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
  /** Why this change was made — agent's stated reason */
  intent?: string;
  /** Technical approach taken — brief description of the strategy */
  approach?: string;
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

export interface ModelStats {
  /** Total triangle count across all bodies */
  triangles: number;
  /** Number of distinct bodies / assembly parts */
  bodies: number;
  /** Axis-aligned bounding box in model-space (Z-up) */
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };
  /** Approximate volume in model units³ (sum of all bodies) */
  volume?: number;
  /** Approximate surface area in model units² (sum of all bodies) */
  surfaceArea?: number;
}

export interface RunResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  timestamp: number;
  /** Geometry statistics from the last successful evaluation */
  stats?: ModelStats;
  /**
   * Base64-encoded PNG data URL of the latest viewport render.
   * Populated by the connected studio after each rerender.
   * Small thumbnail recommended (≤512px) to keep storage light.
   */
  screenshot?: string;
}

// ── SSE event types ───────────────────────────────────────────────────────────

export type SessionEvent =
  | { type: 'session_snapshot'; session: SessionState }
  | { type: 'patch_applied'; patch: Patch; session: SessionSummary }
  | { type: 'patch_reverted'; patch: Patch; session: SessionSummary }
  | { type: 'run_status'; result: RunResult; revision: number }
  /** Broadcast when the studio posts a run result (screenshot + stats) */
  | { type: 'run_result_posted'; result: RunResult; revision: number }
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
  /** Why this change was made — agent's stated reason */
  intent?: string;
  /** Technical approach taken — brief description of the strategy */
  approach?: string;
  /** Optional: pre-populated run result if caller already evaluated the model */
  runResult?: RunResult;
}

/** POST /api/live/session/:id/run-result — studio posts result after each rerender */
export interface PostRunResultRequest {
  revision: number;
  result: RunResult;
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
   * KV namespace for OAuth state (clients, link codes, auth codes, tokens)
   * and screenshot persistence. Key prefixes: oauth:* and screenshot:*
   */
  KV: KVNamespace;
  /**
   * The origin of the CadLad studio (e.g. https://cadlad.studio or
   * http://localhost:5173). Used to construct liveUrl and CORS headers.
   * When unset, the worker reflects the incoming request Origin.
   */
  STUDIO_ORIGIN?: string;
  /** Optional HMAC signing secret for OAuth JWT-style tokens. */
  OAUTH_SIGNING_SECRET?: string;
  /** Optional default user subject used in local/dev OAuth flows. */
  DEFAULT_USER_SUB?: string;
}

// ── OAuth types ───────────────────────────────────────────────────────────────

/** A dynamically registered OAuth client (e.g. ChatGPT). */
export interface OAuthClient {
  clientId: string;
  clientName?: string;
  redirectUris: string[];
  createdAt: number;
}

/** Short-lived code generated by the studio to prove session ownership. */
export interface OAuthLinkCode {
  sessionId: string;
  writeToken: string;
  expiresAt: number;
}

/** Short-lived auth code exchanged for an access token (PKCE). */
export interface OAuthAuthCode {
  sessionId: string;
  writeToken: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string; // "S256"
  scope: string;
  expiresAt: number;
}

/** Long-lived access token issued after successful PKCE exchange. */
export interface OAuthAccessToken {
  sessionId: string;
  writeToken: string;
  clientId: string;
  scope: string;
  issuedAt: number;
}
