/**
 * session-client.ts
 *
 * Typed HTTP client for the CadLad live-session Cloudflare Worker.
 * Every method maps 1:1 to a backend endpoint so the MCP bridge stays thin.
 */

// ── Shared types (duplicated here to avoid cross-package imports at runtime) ──

export interface ModelStats {
  triangles: number;
  bodies: number;
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };
  volume?: number;
  surfaceArea?: number;
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

export interface RunResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  timestamp: number;
  stats?: ModelStats;
  screenshot?: string; // base64 data URL, in-memory only (not persisted)
}

export interface Patch {
  id: string;
  revision: number;
  type: "create" | "source_replace" | "param_update" | "revert";
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
  source: string;
  params: Record<string, number>;
  revision: number;
  lastSuccessfulRevision: number;
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
  type: "source_replace" | "param_update";
  source?: string;
  params?: Record<string, number>;
  summary: string;
  intent?: string;
  approach?: string;
  runResult?: RunResult;
}

export interface RevertRequest {
  patchId: string;
  summary?: string;
}

// ── Client ────────────────────────────────────────────────────────────────────

export class SessionClient {
  private baseUrl: string;
  private sessionId: string;
  private writeToken: string;

  constructor(opts: { apiBase: string; sessionId: string; writeToken: string }) {
    // Strip trailing slash
    this.baseUrl = opts.apiBase.replace(/\/$/, "");
    this.sessionId = opts.sessionId;
    this.writeToken = opts.writeToken;
  }

  private sessionUrl(path = ""): string {
    return `${this.baseUrl}/api/live/session/${this.sessionId}${path}`;
  }

  private authHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.writeToken}`,
    };
  }

  private readHeaders(): Record<string, string> {
    return { "Content-Type": "application/json" };
  }

  // ── Read endpoints (no auth required) ────────────────────────────────────

  async getSession(): Promise<SessionState> {
    const res = await fetch(this.sessionUrl());
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<SessionState>;
  }

  async getHistory(opts: { limit?: number; offset?: number } = {}): Promise<PatchHistory> {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts.offset !== undefined) params.set("offset", String(opts.offset));
    const qs = params.size ? `?${params}` : "";
    const res = await fetch(this.sessionUrl(`/history${qs}`), { headers: this.readHeaders() });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<PatchHistory>;
  }

  async getRunResult(): Promise<{ runResult: RunResult | null; revision?: number; message?: string }> {
    const res = await fetch(this.sessionUrl("/run-result"), { headers: this.readHeaders() });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<{ runResult: RunResult | null; revision?: number; message?: string }>;
  }

  // ── Write endpoints (require write token) ─────────────────────────────────

  async applyPatch(req: ApplyPatchRequest): Promise<{ patch: Patch; session: SessionState }> {
    const res = await fetch(this.sessionUrl("/patch"), {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<{ patch: Patch; session: SessionState }>;
  }

  async revertPatch(req: RevertRequest): Promise<{ patch: Patch; session: SessionState }> {
    const res = await fetch(this.sessionUrl("/revert"), {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<{ patch: Patch; session: SessionState }>;
  }
}

// ── Error helper ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`API error ${status}: ${body}`);
    this.name = "ApiError";
  }
}

// ── Factory: build a SessionClient from a capability URL ─────────────────────

/**
 * Parse a CadLad capability URL and return a configured SessionClient.
 *
 * Accepts:
 *   https://cadlad.studio?session=<id>&token=<token>
 *   cadlad://session/<id>?token=<token>&api=<apiBase>
 *
 * The `apiBase` query param is required when the session URL points to the
 * studio rather than the API directly. Default: https://sessions.cadlad.workers.dev
 */
export function clientFromUrl(
  capabilityUrl: string,
  apiBase?: string,
): SessionClient {
  const url = new URL(capabilityUrl);
  const sessionId = url.searchParams.get("session");
  const writeToken = url.searchParams.get("token");
  const resolvedApi =
    apiBase ??
    url.searchParams.get("api") ??
    process.env.CADLAD_API_BASE ??
    "https://sessions.cadlad.workers.dev";

  if (!sessionId) throw new Error("Missing 'session' param in capability URL");
  if (!writeToken) throw new Error("Missing 'token' param in capability URL");

  return new SessionClient({ apiBase: resolvedApi, sessionId, writeToken });
}
