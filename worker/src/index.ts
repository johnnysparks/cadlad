// index.ts — Cloudflare Worker entry point for CadLad live-session service

import { LiveSession } from './live-session.js';
import { handleMcp } from './mcp-handler.js';
import {
  handleAuthorize,
  handleRegister,
  handleToken,
  oauthAuthorizationServerMetadata,
  oauthProtectedResourceMetadata,
  requireScope,
  verifyAccessToken,
} from './oauth.js';
import type { Env, CreateSessionResponse, InitPayload, SessionState } from './types.js';

export { LiveSession };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = resolveStudioOrigin(request, env);

    if (url.pathname === '/.well-known/oauth-protected-resource') {
      return json(oauthProtectedResourceMetadata(request), 200, corsHeaders('*'));
    }
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return json(oauthAuthorizationServerMetadata(request), 200, corsHeaders('*'));
    }
    if (url.pathname === '/oauth/authorize') return handleAuthorize(request, env);
    if (url.pathname === '/oauth/token') return handleToken(request, env);
    if (url.pathname === '/oauth/register') return handleRegister();

    const mcpOrigin = resolveMcpOrigin(request);
    if (url.pathname === '/mcp') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(mcpOrigin) });
      }
      const principal = await verifyAccessToken(request, env);
      const authErr = requireScope(principal, 'cadlad.sessions.read');
      if (authErr) return authErr;
      return handleMcp(request, env, mcpOrigin, principal!);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/api/live/session') {
      if (request.method !== 'POST') {
        return json(
          { error: `Method ${request.method} not allowed. Use POST.`, code: 'METHOD_NOT_ALLOWED' },
          405,
          { ...corsHeaders(origin), Allow: 'POST, OPTIONS' },
        );
      }
      const principal = await verifyAccessToken(request, env);
      const authErr = requireScope(principal, 'cadlad.sessions.write');
      if (authErr) return authErr;
      return handleCreateSession(request, env, origin, principal!.sub);
    }

    const sessionMatch = url.pathname.match(/^\/api\/live\/session\/([^/]+)(\/.*)?$/);
    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      const principal = await verifyAccessToken(request, env);
      const neededScope = request.method === 'GET' ? 'cadlad.sessions.read' : 'cadlad.sessions.write';
      const authErr = requireScope(principal, neededScope);
      if (authErr) return authErr;
      return proxyToDO(request, env, sessionId, origin, principal!.sub);
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return json({
        status: 'ok',
        service: 'cadlad-live-sessions',
        timestamp: new Date().toISOString(),
        oauthProtectedResource: '/.well-known/oauth-protected-resource',
        studioOrigin: env.STUDIO_ORIGIN || '(dynamic — reflects request Origin)',
      }, 200, corsHeaders(origin));
    }

    return json({ error: 'Not found', code: 'NOT_FOUND' }, 404, corsHeaders(origin));
  },
};

async function handleCreateSession(request: Request, env: Env, origin: string, ownerSub: string): Promise<Response> {
  let body: { source?: string; params?: Record<string, number>; projectRef?: string };
  try {
    body = await request.json() as { source?: string; params?: Record<string, number>; projectRef?: string };
  } catch {
    return json({ error: 'Invalid JSON body', code: 'INVALID_REQUEST' }, 400, corsHeaders(origin));
  }

  if (typeof body.source !== 'string') {
    return json({ error: '"source" (string) is required', code: 'INVALID_REQUEST' }, 400, corsHeaders(origin));
  }

  const sessionId = crypto.randomUUID();
  const projectRef = body.projectRef || `project_${sessionId.slice(0, 8)}`;

  const initPayload: InitPayload = {
    sessionId,
    ownerSub,
    projectRef,
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

  const studioBase = origin !== '*' ? origin : `https://${new URL(request.url).hostname}`;
  const liveUrl = `${studioBase}?session=${sessionId}`;

  const response: CreateSessionResponse = { sessionId, projectRef, liveUrl, session };
  return json(response, 201, corsHeaders(origin));
}

async function proxyToDO(request: Request, env: Env, sessionId: string, origin: string, userSub: string): Promise<Response> {
  const stub = env.LIVE_SESSION.get(env.LIVE_SESSION.idFromName(sessionId));
  const headers = new Headers(request.headers);
  headers.set('X-Cadlad-Sub', userSub);
  const forward = new Request(request, { headers });
  const doResp = await stub.fetch(forward);

  const contentType = doResp.headers.get('Content-Type') ?? '';
  if (!contentType.startsWith('text/event-stream')) {
    const body = await doResp.arrayBuffer();
    const respHeaders = new Headers(doResp.headers);
    for (const [k, v] of Object.entries(corsHeaders(origin))) respHeaders.set(k, v);
    return new Response(body, { status: doResp.status, headers: respHeaders });
  }

  return doResp;
}

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
  if (requestOrigin && isHttpOrigin(requestOrigin)) return requestOrigin;

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
