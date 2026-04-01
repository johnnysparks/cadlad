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

export interface LiveSessionClientOptions {
  apiBase?: string;
}

export class LiveSessionClient {
  private readonly apiBase: string;

  constructor(options: LiveSessionClientOptions = {}) {
    const envBase = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_LIVE_SESSION_API_BASE;
    const configuredBase = options.apiBase ?? envBase;
    this.apiBase = configuredBase
      ? configuredBase.replace(/\/$/, "")
      : `${window.location.protocol}//${window.location.hostname}:8787`;
  }

  async createSession(payload: { source: string; params: Record<string, number> }): Promise<CreateLiveSessionResponse> {
    const res = await fetch(`${this.apiBase}/api/live/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Live session create failed (${res.status})`);
    }

    return res.json() as Promise<CreateLiveSessionResponse>;
  }

  async fetchSession(sessionId: string): Promise<LiveSessionState> {
    const res = await fetch(`${this.apiBase}/api/live/session/${encodeURIComponent(sessionId)}`);
    if (!res.ok) {
      throw new Error(`Live session load failed (${res.status})`);
    }
    return res.json() as Promise<LiveSessionState>;
  }

  subscribe(sessionId: string, token: string | null, onEvent: (event: PatchEventPayload) => void, onError: (err: Event) => void): EventSource {
    const url = new URL(`${this.apiBase}/api/live/session/${encodeURIComponent(sessionId)}/events`);
    if (token) {
      url.searchParams.set("token", token);
    }

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
