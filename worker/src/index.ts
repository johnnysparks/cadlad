// index.ts — Cloudflare Worker entry point for CadLad live-session service

import { LiveSession } from './live-session.js';
import type { Env, CreateSessionResponse, InitPayload, SessionState } from './types.js';

// Re-export DO class so wrangler can find it
export { LiveSession };

// ── Worker fetch handler ──────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = env.STUDIO_ORIGIN ?? '*';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // POST /api/live/session — create a new live session
    if (request.method === 'POST' && url.pathname === '/api/live/session') {
      return handleCreateSession(request, env, origin);
    }

    // /api/live/session/:id[/*] — delegate to Durable Object
    const sessionMatch = url.pathname.match(/^\/api\/live\/session\/([^/]+)(\/.*)?$/);
    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      return proxyToDO(request, env, sessionId, origin);
    }

    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return json({ status: 'ok', service: 'cadlad-live-sessions' }, 200, corsHeaders(origin));
    }

    return json({ error: 'Not found', code: 'NOT_FOUND' }, 404, corsHeaders(origin));
  },
};

// ── Session creation ──────────────────────────────────────────────────────────

async function handleCreateSession(request: Request, env: Env, origin: string): Promise<Response> {
  let body: { source?: string; params?: Record<string, number> };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body', code: 'INVALID_REQUEST' }, 400, corsHeaders(origin));
  }

  if (typeof body.source !== 'string') {
    return json({ error: '"source" (string) is required', code: 'INVALID_REQUEST' }, 400, corsHeaders(origin));
  }

  const sessionId = crypto.randomUUID();
  const writeToken = crypto.randomUUID();

  // Construct the internal /init request forwarded to the DO
  const initPayload: InitPayload = {
    sessionId,
    writeToken,
    source: body.source,
    params: body.params ?? {},
  };

  const doUrl = new URL(`/api/live/session/${sessionId}/init`, request.url);
  const initReq = new Request(doUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(initPayload),
  });

  const stub = env.LIVE_SESSION.get(env.LIVE_SESSION.idFromName(sessionId));
  const initResp = await stub.fetch(initReq);

  if (!initResp.ok) {
    const errBody = await initResp.text().catch(() => '');
    console.error('[createSession] DO init failed', initResp.status, errBody);
    return json({ error: 'Failed to initialize session', code: 'INIT_FAILED' }, 500, corsHeaders(origin));
  }

  const session = await initResp.json() as SessionState;

  // Build the studio liveUrl
  const studioBase = origin !== '*' ? origin : `https://${new URL(request.url).hostname}`;
  const liveUrl = `${studioBase}?session=${sessionId}&token=${writeToken}`;

  const response: CreateSessionResponse = { sessionId, writeToken, liveUrl, session };
  return json(response, 201, corsHeaders(origin));
}

// ── Proxy to Durable Object ───────────────────────────────────────────────────

async function proxyToDO(request: Request, env: Env, sessionId: string, origin: string): Promise<Response> {
  const stub = env.LIVE_SESSION.get(env.LIVE_SESSION.idFromName(sessionId));
  const doResp = await stub.fetch(request);

  // For non-streaming responses, copy and inject CORS headers
  const contentType = doResp.headers.get('Content-Type') ?? '';
  if (!contentType.startsWith('text/event-stream')) {
    const body = await doResp.arrayBuffer();
    const headers = new Headers(doResp.headers);
    for (const [k, v] of Object.entries(corsHeaders(origin))) {
      headers.set(k, v);
    }
    return new Response(body, { status: doResp.status, headers });
  }

  // For SSE (streaming), pass through directly — the DO already sets CORS headers
  return doResp;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function corsHeaders(origin = '*'): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function json(data: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
