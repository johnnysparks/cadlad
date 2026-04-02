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
  writeToken: string;
  liveUrl: string;
  session?: LiveSessionState;
}

export interface PatchEventPayload {
  type: string;
  ts?: number;
  message?: string;
  revision?: number;
  result?: {
    success: boolean;
    timestamp: number;
    errors?: string[];
  };
  session?: Partial<LiveSessionState>;
  patch?: {
    id: string;
    revision: number;
    summary: string;
    createdAt?: number;
    runResult?: {
      success: boolean;
      timestamp: number;
      errors?: string[];
    };
    sourceAfter?: string;
    paramsAfter?: Record<string, number>;
  };
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

  constructor(options: LiveSessionClientOptions = {}) {
    const envBase = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_LIVE_SESSION_API_BASE;
    this.apiBase = resolveLiveSessionApiBase({
      optionBase: options.apiBase,
      envBase,
      location: window.location,
    });
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
      headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${this.apiBase}/api/live/session/${encodeURIComponent(sessionId)}`);
    if (!res.ok) {
      throw new Error(`Live session load failed (${res.status})\nGET ${this.apiBase}/api/live/session/${encodeURIComponent(sessionId)}`);
    }
    return res.json() as Promise<LiveSessionState>;
  }

  async postRunResult(sessionId: string, token: string, revision: number, result: RunResultPayload): Promise<void> {
    const url = `${this.apiBase}/api/live/session/${encodeURIComponent(sessionId)}/run-result`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
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

  subscribe(sessionId: string, onEvent: (event: PatchEventPayload) => void, onError: (err: Event) => void): EventSource {
    // SSE is read-only — no token needed. The write token is never sent in URLs.
    const url = `${this.apiBase}/api/live/session/${encodeURIComponent(sessionId)}/events`;
    const source = new EventSource(url);
    source.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data) as PatchEventPayload;
        onEvent(payload);
      } catch {
        // Ignore malformed SSE payloads.
      }
    };
    source.onerror = onError;
    return source;
  }
}
