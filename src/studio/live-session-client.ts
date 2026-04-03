export interface LiveSessionState {
  id: string;
  source: string;
  params: Record<string, number>;
  revision: number;
  lastSuccessfulRevision: number;
  patches?: Array<{
    id: string;
    revision: number;
    summary: string;
    createdAt: number;
    runResult?: {
      success: boolean;
      timestamp: number;
      errors?: string[];
    };
  }>;
  createdAt: number;
  updatedAt: number;
}

export interface CreateLiveSessionResponse {
  sessionId: string;
  liveUrl: string;
  session?: LiveSessionState;
}

export interface PatchEventPayload {
  type: "session_snapshot" | "patch_applied" | "patch_reverted" | "run_status" | "error";
  ts?: number;
}

export interface PatchRunResult {
  success: boolean;
  timestamp: number;
  errors?: string[];
}

export interface SessionPatchPayload {
  id: string;
  revision: number;
  summary: string;
  createdAt?: number;
  runResult?: PatchRunResult;
  sourceAfter?: string;
  paramsAfter?: Record<string, number>;
}

export interface SessionSnapshotEvent extends PatchEventPayload {
  type: "session_snapshot";
  session: Partial<LiveSessionState>;
}

export interface PatchAppliedEvent extends PatchEventPayload {
  type: "patch_applied" | "patch_reverted";
  patch: SessionPatchPayload;
  session?: Partial<LiveSessionState>;
}

export interface RunStatusEvent extends PatchEventPayload {
  type: "run_status";
  revision: number;
  result: PatchRunResult;
}

export interface ErrorEventPayload extends PatchEventPayload {
  type: "error";
  message: string;
}

export type LiveSessionEvent =
  | SessionSnapshotEvent
  | PatchAppliedEvent
  | RunStatusEvent
  | ErrorEventPayload;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPatchRunResult(value: unknown): value is PatchRunResult {
  return isObject(value)
    && typeof value.success === "boolean"
    && typeof value.timestamp === "number"
    && (value.errors === undefined
      || (Array.isArray(value.errors) && value.errors.every((error) => typeof error === "string")));
}

function isSessionPatchPayload(value: unknown): value is SessionPatchPayload {
  return isObject(value)
    && typeof value.id === "string"
    && typeof value.revision === "number"
    && typeof value.summary === "string"
    && (value.createdAt === undefined || typeof value.createdAt === "number")
    && (value.runResult === undefined || isPatchRunResult(value.runResult))
    && (value.sourceAfter === undefined || typeof value.sourceAfter === "string")
    && (value.paramsAfter === undefined || isObject(value.paramsAfter));
}

export function parseLiveSessionEvent(raw: unknown): LiveSessionEvent | null {
  if (!isObject(raw) || typeof raw.type !== "string") {
    return null;
  }

  const baseTs = raw.ts;
  const ts = typeof baseTs === "number" ? baseTs : undefined;

  switch (raw.type) {
    case "session_snapshot":
      if (raw.session && isObject(raw.session)) {
        return { type: raw.type, ts, session: raw.session as Partial<LiveSessionState> };
      }
      return null;
    case "patch_applied":
    case "patch_reverted":
      if (!isSessionPatchPayload(raw.patch)) {
        return null;
      }
      return {
        type: raw.type,
        ts,
        patch: raw.patch,
        session: isObject(raw.session) ? (raw.session as Partial<LiveSessionState>) : undefined,
      };
    case "run_status":
      if (typeof raw.revision !== "number" || !isPatchRunResult(raw.result)) {
        return null;
      }
      return { type: raw.type, ts, revision: raw.revision, result: raw.result };
    case "error":
      if (typeof raw.message !== "string") {
        return null;
      }
      return { type: raw.type, ts, message: raw.message };
    default:
      return null;
  }
}

export interface RunResultPayload {
  success: boolean;
  errors: string[];
  warnings: string[];
  timestamp: number;
  stats?: {
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
      id: string;
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
      partAId: string;
      partB: string;
      partBId: string;
      intersects: boolean;
      minDistance: number;
    }>;
  };
  /** Base64 PNG data URL of the viewport render */
  screenshot?: string;
}

export interface LiveSessionClientOptions {
  apiBase?: string;
}

export interface PingResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
  url: string;
}

interface ResolveApiBaseInput {
  optionBase?: string;
  envBase?: string;
  location: Pick<Location, 'protocol' | 'hostname' | 'origin'>;
}

export function resolveLiveSessionApiBase({ optionBase, envBase, location }: ResolveApiBaseInput): string {
  const configuredBase = optionBase ?? envBase;
  if (configuredBase) {
    return configuredBase.replace(/\/$/, '');
  }

  const isLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);
  return isLocalhost
    ? `${location.protocol}//${location.hostname}:8787`
    : location.origin;
}

export class LiveSessionClient {
  readonly apiBase: string;
  private static readonly ACCESS_TOKEN_STORAGE_KEY = "cadlad_access_token";

  constructor(options: LiveSessionClientOptions = {}) {
    const envBase = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_LIVE_SESSION_API_BASE;
    this.apiBase = resolveLiveSessionApiBase({
      optionBase: options.apiBase,
      envBase,
      location: window.location,
    });
  }


  private getAccessToken(): string | null {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("access_token");
    const fromHash = new URLSearchParams(url.hash.replace(/^#/, "")).get("access_token");
    const transientToken = (fromQuery ?? fromHash)?.trim();

    if (transientToken) {
      window.localStorage.setItem(LiveSessionClient.ACCESS_TOKEN_STORAGE_KEY, transientToken);
      this.scrubAccessTokenFromUrl(url);
      return transientToken;
    }
    return window.localStorage.getItem(LiveSessionClient.ACCESS_TOKEN_STORAGE_KEY);
  }

  private scrubAccessTokenFromUrl(url: URL): void {
    const hadQueryToken = url.searchParams.has("access_token");
    if (hadQueryToken) {
      url.searchParams.delete("access_token");
    }

    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const hadHashToken = hashParams.has("access_token");
    if (hadHashToken) {
      hashParams.delete("access_token");
      const nextHash = hashParams.toString();
      url.hash = nextHash ? `#${nextHash}` : "";
    }

    if ((hadQueryToken || hadHashToken) && typeof window.history?.replaceState === "function") {
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }

  private authHeaders(): Record<string, string> {
    const token = this.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  async ping(): Promise<PingResult> {
    const url = `${this.apiBase}/health`;
    try {
      const res = await fetch(url);
      let body: Record<string, unknown> | null = null;
      try { body = await res.json() as Record<string, unknown>; } catch { /* ignore */ }
      return { ok: res.ok, status: res.status, body, url };
    } catch {
      return { ok: false, status: 0, body: null, url };
    }
  }

  async createSession(payload: { source: string; params: Record<string, number> }): Promise<CreateLiveSessionResponse> {
    const url = `${this.apiBase}/api/live/session`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeaders() },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json() as Record<string, unknown>;
        const errMsg = body.error ?? body.message ?? body.code;
        if (errMsg) detail = ` — ${String(errMsg)}`;
      } catch { /* ignore */ }
      throw new Error(`Live session create failed (${res.status})${detail}\nPOST ${url}`);
    }

    return res.json() as Promise<CreateLiveSessionResponse>;
  }

  async fetchSession(sessionId: string): Promise<LiveSessionState> {
    const res = await fetch(`${this.apiBase}/api/live/session/${encodeURIComponent(sessionId)}`, { headers: this.authHeaders() });
    if (!res.ok) {
      throw new Error(`Live session load failed (${res.status})\nGET ${this.apiBase}/api/live/session/${encodeURIComponent(sessionId)}`);
    }
    return res.json() as Promise<LiveSessionState>;
  }

  async postRunResult(sessionId: string, revision: number, result: RunResultPayload): Promise<void> {
    const url = `${this.apiBase}/api/live/session/${encodeURIComponent(sessionId)}/run-result`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(),
      },
      body: JSON.stringify({ revision, result }),
    });
    if (!res.ok) {
      console.warn(`[CadLad] postRunResult failed (${res.status})`);
    }
  }

  /**
   * Generate a short-lived link code for a session.
   * The code is entered in the OAuth consent UI to authorize an MCP client.
   * Requires the write token to prove session ownership.
   */
  async createLinkCode(sessionId: string, writeToken: string): Promise<{ linkCode: string; expiresIn: number }> {
    const url = `${this.apiBase}/api/live/session/${encodeURIComponent(sessionId)}/link`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${writeToken}`,
      },
    });
    if (!res.ok) {
      throw new Error(`createLinkCode failed (${res.status})`);
    }
    return res.json() as Promise<{ linkCode: string; expiresIn: number }>;
  }

  subscribe(sessionId: string, onEvent: (event: LiveSessionEvent) => void, onError: (err: Event) => void): EventSource {
    // SSE is read-only — no token needed. The write token is never sent in URLs.
    const url = `${this.apiBase}/api/live/session/${encodeURIComponent(sessionId)}/events`;
    const source = new EventSource(url);
    source.onmessage = (message) => {
      try {
        const payload = parseLiveSessionEvent(JSON.parse(message.data) as unknown);
        if (payload) onEvent(payload);
      } catch {
        // Ignore malformed SSE payloads.
      }
    };
    source.onerror = onError;
    return source;
  }
}
