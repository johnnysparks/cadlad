/**
 * session-client.ts
 *
 * Typed HTTP client for the CadLad live-session Cloudflare Worker.
 */

export interface ModelStats {
  triangles: number;
  bodies: number;
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };
  volume?: number;
  surfaceArea?: number;
  componentCount?: number;
  checks?: {
    zeroVolume: boolean;
    degenerateBoundingBox: boolean;
    disconnectedComponents: boolean;
  };
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
  pairwise?: Array<{
    partA: string;
    partB: string;
    intersects: boolean;
    minDistance: number;
  }>;
}

export interface ValidationDiagnostic {
  stage: "types/schema" | "semantic" | "geometry" | "stats/relations" | "render/snapshots/tests";
  severity: "error" | "warning";
  message: string;
  featureId?: string;
}

export interface EvaluationBundle {
  haltedAt?: ValidationDiagnostic["stage"];
  summary: {
    errorCount: number;
    warningCount: number;
  };
  typecheck: {
    status: "pass" | "fail" | "skipped";
    errorCount: number;
    warningCount: number;
    diagnostics: ValidationDiagnostic[];
  };
  semanticValidation: {
    status: "pass" | "fail" | "skipped";
    errorCount: number;
    warningCount: number;
    diagnostics: ValidationDiagnostic[];
  };
  geometryValidation: {
    status: "pass" | "fail" | "skipped";
    errorCount: number;
    warningCount: number;
    diagnostics: ValidationDiagnostic[];
  };
  relationValidation: {
    status: "pass" | "fail" | "skipped";
    errorCount: number;
    warningCount: number;
    diagnostics: ValidationDiagnostic[];
  };
  stats: {
    available: boolean;
    data?: ModelStats;
  };
  tests: {
    status: "pass" | "fail" | "skipped";
    total: number;
    failures: number;
    results: Array<{
      id: string;
      name?: string;
      pass: boolean;
      message?: string;
      details?: Record<string, unknown>;
    }>;
  };
  render: {
    requested: boolean;
  };
}

export interface RunResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  timestamp: number;
  stats?: ModelStats;
  screenshot?: string;
  screenshotStatus?: "ok" | "blocked" | "unavailable";
  screenshotStatusReason?: string;
  evaluation?: EvaluationBundle;
  diagnostics?: ValidationDiagnostic[];
  params?: Record<string, number>;
}

export type RenderState = 'ready' | 'no_render' | 'pending' | 'failed' | 'blocked' | 'unknown';

export interface RenderStatus {
  state: RenderState;
  revision?: number;
  timestamp?: number;
  screenshotRef?: string;
  message: string;
}

export interface RunResultEnvelope {
  runResult: RunResult | null;
  revision?: number;
  message?: string;
  status?: string;
  artifactRef?: string;
  hasImage?: boolean;
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

export interface SessionState {
  id: string;
  projectRef: string;
  source: string;
  params: Record<string, number>;
  revision: number;
  lastSuccessfulRevision: number;
  latestRender: RenderStatus;
  patches: Patch[];
  createdAt: number;
  updatedAt: number;
}

export interface PatchHistory {
  patches: Patch[];
  total: number;
  offset: number;
  limit: number;
}

export interface ApplyPatchRequest {
  type: 'source_replace' | 'param_update';
  source?: string;
  params?: Record<string, number>;
  summary: string;
  intent?: string;
  approach?: string;
}

export interface RevertRequest {
  patchId: string;
  summary?: string;
}

export class SessionClient {
  private baseUrl: string;
  private sessionId: string;
  private accessToken: string;

  constructor(opts: { apiBase: string; sessionId: string; accessToken: string }) {
    this.baseUrl = opts.apiBase.replace(/\/$/, '');
    this.sessionId = opts.sessionId;
    this.accessToken = opts.accessToken;
  }

  private sessionUrl(path = ''): string {
    return `${this.baseUrl}/api/live/session/${this.sessionId}${path}`;
  }

  private headers(withAuth = false): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(withAuth ? { Authorization: `Bearer ${this.accessToken}` } : {}),
    };
  }

  async getSession(): Promise<SessionState> {
    const res = await fetch(this.sessionUrl(), { headers: this.headers(true) });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<SessionState>;
  }

  async getHistory(opts: { limit?: number; offset?: number } = {}): Promise<PatchHistory> {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.offset !== undefined) params.set('offset', String(opts.offset));
    const qs = params.size ? `?${params}` : '';
    const res = await fetch(this.sessionUrl(`/history${qs}`), { headers: this.headers(true) });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<PatchHistory>;
  }

  async getRunResult(): Promise<RunResultEnvelope> {
    const res = await fetch(this.sessionUrl('/run-result'), { headers: this.headers(true) });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<RunResultEnvelope>;
  }

  async applyPatch(req: ApplyPatchRequest): Promise<{ patch: Patch; session: SessionState }> {
    const res = await fetch(this.sessionUrl('/patch'), {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<{ patch: Patch; session: SessionState }>;
  }

  async revertPatch(req: RevertRequest): Promise<{ patch: Patch; session: SessionState }> {
    const res = await fetch(this.sessionUrl('/revert'), {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<{ patch: Patch; session: SessionState }>;
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`API error ${status}: ${body}`);
    this.name = 'ApiError';
  }
}

export function clientFromUrl(capabilityUrl: string, apiBase?: string, accessToken?: string): SessionClient {
  const url = new URL(capabilityUrl);
  const sessionId = url.searchParams.get('session');
  const resolvedApi = apiBase ?? process.env.CADLAD_API_BASE ?? 'https://sessions.cadlad.workers.dev';
  const token = accessToken ?? process.env.CADLAD_ACCESS_TOKEN;

  if (!sessionId) throw new Error("Missing 'session' param in URL");
  if (!token) throw new Error('Missing OAuth access token (set CADLAD_ACCESS_TOKEN)');

  return new SessionClient({ apiBase: resolvedApi, sessionId, accessToken: token });
}
