// types.ts — Shared types for CadLad live-session backend

export interface SessionState {
  id: string;
  ownerSub: string;
  projectRef: string;
  source: string;
  params: Record<string, number>;
  revision: number;
  lastSuccessfulRevision: number;
  patches: Patch[];
  latestRender?: RenderArtifact | null;
  createdAt: number;
  updatedAt: number;
}

export interface Patch {
  id: string;
  revision: number;
  type: 'create' | 'source_replace' | 'param_update' | 'revert';
  summary: string;
  intent?: string;
  approach?: string;
  sourceBefore: string;
  sourceAfter: string;
  paramsBefore: Record<string, number>;
  paramsAfter: Record<string, number>;
  revertOf?: string;
  runResult?: RunResult;
  createdAt: number;
}

export interface ModelStats {
  triangles: number;
  bodies: number;
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };
  volume?: number;
  surfaceArea?: number;
  /** Per-body stats keyed by body name (or generated part-N fallback) */
  parts?: Array<{
    index: number;
    name: string;
    triangles: number;
    boundingBox: {
      min: [number, number, number];
      max: [number, number, number];
    };
    extents: { x: number; y: number; z: number };
    volume: number;
    surfaceArea: number;
  }>;
  /** Pairwise part relations based on per-part AABB proximity */
  pairwise?: Array<{
    partA: string;
    partB: string;
    intersects: boolean;
    minDistance: number;
  }>;
}

export interface RenderArtifact {
  artifactRef: string;
  revision: number;
  createdAt: number;
  mimeType: 'image/png';
  imageDataUrl: string;
}

export interface RunResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  timestamp: number;
  stats?: ModelStats;
  screenshot?: string;
}

export type SessionEvent =
  | { type: 'session_snapshot'; session: SessionState }
  | { type: 'patch_applied'; patch: Patch; session: SessionSummary }
  | { type: 'patch_reverted'; patch: Patch; session: SessionSummary }
  | { type: 'run_status'; result: RunResult; revision: number }
  | { type: 'run_result_posted'; result: RunResult; revision: number; artifactRef?: string }
  | { type: 'render_refresh_requested'; requestedAt: number }
  | { type: 'error'; message: string }
  | { type: 'heartbeat'; ts: number };

export type SessionSummary = Omit<SessionState, 'patches'>;

export interface CreateSessionRequest {
  source: string;
  params?: Record<string, number>;
  projectRef?: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  projectRef: string;
  liveUrl: string;
  session: SessionState;
}

export interface ApplyPatchRequest {
  type: 'source_replace' | 'param_update';
  source?: string;
  params?: Record<string, number>;
  summary: string;
  intent?: string;
  approach?: string;
  runResult?: RunResult;
}

export interface PostRunResultRequest {
  revision: number;
  result: RunResult;
}

export interface RevertRequest {
  patchId: string;
  summary?: string;
}

export interface ApiError {
  error: string;
  code: string;
}

export interface InitPayload {
  sessionId: string;
  ownerSub: string;
  projectRef: string;
  source: string;
  params: Record<string, number>;
}

export interface Env {
  LIVE_SESSION: DurableObjectNamespace;
  STUDIO_ORIGIN?: string;
  OAUTH_SIGNING_SECRET?: string;
  DEFAULT_USER_SUB?: string;
}
