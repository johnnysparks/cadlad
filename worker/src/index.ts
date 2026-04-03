// index.ts — Cloudflare Worker entry point for CadLad live-session service

import { LiveSession } from './live-session.js';
import { handleMcp } from './mcp-handler.js';
import {
  handleProtectedResourceMetadata,
  handleAuthServerMetadata,
  handleRegister,
  handleAuthorize,
  handleToken,
} from './oauth-handler.js';
import type { Env, CreateSessionResponse, InitPayload, SessionState } from './types.js';

// Re-export DO class so wrangler can find it
export { LiveSession };

// ── Worker fetch handler ──────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = resolveStudioOrigin(request, env);

    // For /mcp, always reflect the actual request Origin for CORS.
    // The MCP endpoint must accept requests from Claude.ai (and other MCP clients),
    // not just the configured STUDIO_ORIGIN.
    const mcpOrigin = resolveMcpOrigin(request);
    if (url.pathname === '/mcp') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(mcpOrigin) });
      }
      return handleMcp(request, env, mcpOrigin);
    }

    // ── OAuth 2.1 discovery and authorization endpoints ───────────────────────

    // RFC 8707: Protected Resource Metadata (tells clients which AS to use)
    if (url.pathname === '/.well-known/oauth-protected-resource') {
      const resourceOrigin = `${url.protocol}//${url.host}`;
      return handleProtectedResourceMetadata(resourceOrigin);
    }

    // RFC 8414: Authorization Server Metadata
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      const resourceOrigin = `${url.protocol}//${url.host}`;
      return handleAuthServerMetadata(resourceOrigin);
    }

    if (url.pathname === '/oauth/register') return handleRegister(request, env);
    if (url.pathname === '/oauth/authorize') return handleAuthorize(request, env);
    if (url.pathname === '/oauth/token') return handleToken(request, env);

    // CORS preflight for non-MCP routes
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // POST /api/live/session — create a new live session
    if (url.pathname === '/api/live/session') {
      if (request.method !== 'POST') {
        return json(
          { error: `Method ${request.method} not allowed. Use POST.`, code: 'METHOD_NOT_ALLOWED', hint: 'POST /api/live/session with JSON body {source: string, params?: object}' },
          405,
          { ...corsHeaders(origin), Allow: 'POST, OPTIONS' },
        );
      }
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
      return json({
        status: 'ok',
        service: 'cadlad-live-sessions',
        timestamp: new Date().toISOString(),
        studioOrigin: env.STUDIO_ORIGIN || '(dynamic — reflects request Origin)',
        auth: 'OAuth 2.1 — see /.well-known/oauth-protected-resource',
        routes: [
          'POST /mcp (OAuth Bearer required for tools/call)',
          'GET  /.well-known/oauth-protected-resource',
          'GET  /.well-known/oauth-authorization-server',
          'POST /oauth/register',
          'GET  /oauth/authorize',
          'POST /oauth/token',
          'POST /api/live/session',
          'GET  /api/live/session/:id',
          'POST /api/live/session/:id/patch',
          'POST /api/live/session/:id/link',
          'GET  /health',
        ],
      }, 200, corsHeaders(origin));
    }

    return json({ error: 'Not found', code: 'NOT_FOUND' }, 404, corsHeaders(origin));
  },
};

// ── Session creation ──────────────────────────────────────────────────────────

async function handleCreateSession(request: Request, env: Env, origin: string): Promise<Response> {
  let body: { source?: string; params?: Record<string, number> };
  try {
    body = await request.json() as { source?: string; params?: Record<string, number> };
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
    ownerSub: env.DEFAULT_USER_SUB ?? 'local-dev-user',
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

function resolveMcpOrigin(request: Request): string {
  const requestOrigin = request.headers.get('Origin')?.trim();
  if (requestOrigin && isHttpOrigin(requestOrigin)) return requestOrigin;
  return '*';
}

function resolveStudioOrigin(request: Request, env: Env): string {
  const configured = env.STUDIO_ORIGIN?.trim();
  if (configured) return configured;

  const requestOrigin = request.headers.get('Origin')?.trim();
  if (requestOrigin && isHttpOrigin(requestOrigin)) {
    return requestOrigin;
  }

  return '*';
}

function isHttpOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function json(data: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
