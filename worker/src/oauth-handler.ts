/**
 * oauth-handler.ts — OAuth 2.1 Authorization Server endpoints.
 *
 * Implements the minimal AS surface needed for ChatGPT / OpenAI Apps SDK:
 *   GET  /.well-known/oauth-protected-resource   RFC 8707 resource metadata
 *   GET  /.well-known/oauth-authorization-server  RFC 8414 AS metadata
 *   POST /oauth/register                          RFC 7591 dynamic client registration
 *   GET  /oauth/authorize                         Authorization endpoint (HTML form)
 *   POST /oauth/authorize                         Form submit → redirect with auth code
 *   POST /oauth/token                             PKCE auth-code → access token
 *
 * Auth UX for single-user use:
 *   1. User creates a session in the studio and clicks "Connect ChatGPT".
 *   2. Studio calls POST /api/live/session/:id/link → returns a link code.
 *   3. User adds the MCP URL to ChatGPT (no credentials in the URL).
 *   4. ChatGPT discovers OAuth metadata and starts the PKCE flow.
 *   5. The consent page asks the user to enter their link code.
 *   6. Valid link code → auth code issued → access token exchanged.
 *   7. ChatGPT uses the access token for all subsequent MCP calls.
 */

import type { Env } from './types.js';
import {
  registerClient,
  getClient,
  consumeLinkCode,
  createAuthCode,
  consumeAuthCode,
  createAccessToken,
  verifyPKCE,
} from './oauth-store.js';

// ── Metadata endpoints ────────────────────────────────────────────────────────

/** RFC 8707 — tells MCP clients which AS covers this resource. */
export function handleProtectedResourceMetadata(origin: string): Response {
  return json({
    resource: origin,
    authorization_servers: [origin],
    scopes_supported: ['cadlad:read', 'cadlad:write'],
    bearer_methods_supported: ['header'],
  });
}

/** RFC 8414 — full AS descriptor for MCP / OpenAI client discovery. */
export function handleAuthServerMetadata(origin: string): Response {
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['cadlad:read', 'cadlad:write'],
    token_endpoint_auth_methods_supported: ['none'], // public clients only
  });
}

// ── Dynamic client registration (RFC 7591) ────────────────────────────────────

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  let body: { redirect_uris?: string[]; client_name?: string } = {};
  try { body = await request.json() as typeof body; } catch { /* body optional */ }

  const redirectUris = body.redirect_uris ?? [];
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return oauthError('invalid_client_metadata', 'redirect_uris is required', 400);
  }

  // Basic URI validation — reject obviously bad redirect URIs
  for (const uri of redirectUris) {
    try { new URL(uri); } catch {
      return oauthError('invalid_redirect_uri', `Invalid redirect_uri: ${uri}`, 400);
    }
  }

  const client = await registerClient(env.KV, {
    redirectUris,
    clientName: body.client_name,
  });

  return json({
    client_id: client.clientId,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    // Public client — no secret. Clients MUST use PKCE.
    token_endpoint_auth_method: 'none',
  }, 201);
}

// ── Authorization endpoint ────────────────────────────────────────────────────

export async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') return handleAuthorizeGet(request, env);
  if (request.method === 'POST') return handleAuthorizePost(request, env);
  return new Response('Method Not Allowed', { status: 405 });
}

async function handleAuthorizeGet(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const p = url.searchParams;

  const clientId = p.get('client_id') ?? '';
  const redirectUri = p.get('redirect_uri') ?? '';
  const codeChallenge = p.get('code_challenge') ?? '';
  const codeChallengeMethod = p.get('code_challenge_method') ?? '';
  const state = p.get('state') ?? '';
  const scope = p.get('scope') ?? 'cadlad:read cadlad:write';

  // Validate required params
  if (!clientId || !redirectUri || !codeChallenge) {
    return new Response('Missing required OAuth parameters: client_id, redirect_uri, code_challenge', { status: 400 });
  }
  if (codeChallengeMethod !== 'S256') {
    return oauthError('invalid_request', 'Only code_challenge_method=S256 is supported', 400);
  }

  const client = await getClient(env.KV, clientId);
  if (!client) return new Response('Unknown client_id', { status: 400 });
  if (!client.redirectUris.includes(redirectUri)) {
    return new Response('redirect_uri not registered for this client', { status: 400 });
  }

  const clientName = client.clientName ?? 'An external app';
  return new Response(consentHtml({ clientName, clientId, redirectUri, codeChallenge, codeChallengeMethod, state, scope }), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function handleAuthorizePost(request: Request, env: Env): Promise<Response> {
  let body: Record<string, string> = {};
  try {
    const text = await request.text();
    for (const [k, v] of new URLSearchParams(text)) body[k] = v;
  } catch {
    return new Response('Invalid form body', { status: 400 });
  }

  const { client_id, redirect_uri, code_challenge, code_challenge_method, state, scope, link_code } = body;

  if (!client_id || !redirect_uri || !code_challenge) {
    return new Response('Missing required fields', { status: 400 });
  }

  const client = await getClient(env.KV, client_id);
  if (!client || !client.redirectUris.includes(redirect_uri)) {
    return new Response('Invalid client or redirect_uri', { status: 400 });
  }

  // Validate the link code (proves the user owns the session)
  if (!link_code) {
    return renderConsentWithError({
      error: 'Enter your link code from the CadLad studio.',
      clientName: client.clientName ?? 'An external app',
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method ?? 'S256',
      state: state ?? '',
      scope: scope ?? 'cadlad:read cadlad:write',
    });
  }

  const linkEntry = await consumeLinkCode(env.KV, link_code);
  if (!linkEntry) {
    return renderConsentWithError({
      error: 'Link code is invalid or expired. Generate a new one from the CadLad studio.',
      clientName: client.clientName ?? 'An external app',
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method ?? 'S256',
      state: state ?? '',
      scope: scope ?? 'cadlad:read cadlad:write',
    });
  }

  // Issue the auth code
  const authCode = await createAuthCode(env.KV, {
    sessionId: linkEntry.sessionId,
    writeToken: linkEntry.writeToken,
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method ?? 'S256',
    scope: scope ?? 'cadlad:read cadlad:write',
  });

  // Redirect back to the client with the auth code
  const redirect = new URL(redirect_uri);
  redirect.searchParams.set('code', authCode);
  if (state) redirect.searchParams.set('state', state);

  return Response.redirect(redirect.toString(), 302);
}

// ── Token endpoint ────────────────────────────────────────────────────────────

export async function handleToken(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let body: Record<string, string> = {};
  try {
    const text = await request.text();
    const ct = request.headers.get('Content-Type') ?? '';
    if (ct.includes('application/json')) {
      body = await new Response(text).json() as Record<string, string>;
    } else {
      for (const [k, v] of new URLSearchParams(text)) body[k] = v;
    }
  } catch {
    return oauthError('invalid_request', 'Invalid body', 400);
  }

  const { grant_type, code, redirect_uri, client_id, code_verifier } = body;

  if (grant_type !== 'authorization_code') {
    return oauthError('unsupported_grant_type', 'Only authorization_code is supported', 400);
  }
  if (!code || !redirect_uri || !client_id || !code_verifier) {
    return oauthError('invalid_request', 'Missing: code, redirect_uri, client_id, code_verifier', 400);
  }

  const authCode = await consumeAuthCode(env.KV, code);
  if (!authCode) return oauthError('invalid_grant', 'Invalid or expired authorization code', 400);

  if (authCode.clientId !== client_id) return oauthError('invalid_client', 'client_id mismatch', 400);
  if (authCode.redirectUri !== redirect_uri) return oauthError('invalid_grant', 'redirect_uri mismatch', 400);

  // PKCE verification
  const pkceOk = await verifyPKCE(code_verifier, authCode.codeChallenge);
  if (!pkceOk) return oauthError('invalid_grant', 'PKCE verification failed', 400);

  const accessToken = await createAccessToken(env.KV, {
    sessionId: authCode.sessionId,
    writeToken: authCode.writeToken,
    clientId: client_id,
    scope: authCode.scope,
  });

  return json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 2592000, // 30 days
    scope: authCode.scope,
  });
}

// ── HTML consent page ─────────────────────────────────────────────────────────

interface ConsentParams {
  clientName: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  scope: string;
  error?: string;
}

function consentHtml(p: ConsentParams): string {
  const scopeList = p.scope.split(' ').map(s => {
    if (s === 'cadlad:read') return '• Read model source, parameters, and patch history';
    if (s === 'cadlad:write') return '• Edit model source and parameter values';
    return `• ${s}`;
  }).join('\n');

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize — CadLad</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0e0e10;
      color: #e8e8e8;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 1.5rem;
    }
    .card {
      background: #1a1a1f;
      border: 1px solid #2e2e38;
      border-radius: 12px;
      padding: 2rem;
      max-width: 440px;
      width: 100%;
    }
    h1 { font-size: 1.25rem; margin: 0 0 0.25rem; color: #fff; }
    .subtitle { font-size: 0.85rem; color: #888; margin: 0 0 1.5rem; }
    .client-name { color: #a78bfa; font-weight: 600; }
    .scope-list {
      background: #111116;
      border: 1px solid #2e2e38;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      font-size: 0.85rem;
      color: #aaa;
      white-space: pre-line;
      margin: 0 0 1.5rem;
      line-height: 1.6;
    }
    label { display: block; font-size: 0.85rem; color: #bbb; margin-bottom: 0.5rem; }
    input[type="text"] {
      width: 100%;
      padding: 0.6rem 0.75rem;
      background: #111116;
      border: 1px solid #3e3e4e;
      border-radius: 6px;
      color: #fff;
      font-size: 1rem;
      font-family: monospace;
      letter-spacing: 0.1em;
      outline: none;
      transition: border-color 0.15s;
    }
    input[type="text"]:focus { border-color: #7c3aed; }
    .hint {
      font-size: 0.78rem;
      color: #666;
      margin: 0.4rem 0 1.25rem;
    }
    .error {
      background: #2d1515;
      border: 1px solid #7f1d1d;
      border-radius: 6px;
      padding: 0.5rem 0.75rem;
      color: #fca5a5;
      font-size: 0.82rem;
      margin-bottom: 1rem;
    }
    button[type="submit"] {
      width: 100%;
      padding: 0.7rem;
      background: #7c3aed;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    button[type="submit"]:hover { background: #6d28d9; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorize CadLad Access</h1>
    <p class="subtitle"><span class="client-name">${esc(p.clientName)}</span> wants to connect to your CadLad modeling session.</p>
    <div class="scope-list">${esc(scopeList)}</div>
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${esc(p.clientId)}">
      <input type="hidden" name="redirect_uri" value="${esc(p.redirectUri)}">
      <input type="hidden" name="code_challenge" value="${esc(p.codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${esc(p.codeChallengeMethod)}">
      <input type="hidden" name="state" value="${esc(p.state)}">
      <input type="hidden" name="scope" value="${esc(p.scope)}">
      ${p.error ? `<div class="error">${esc(p.error)}</div>` : ''}
      <label for="link_code">Studio link code</label>
      <input type="text" id="link_code" name="link_code" placeholder="e.g. a1b2c3d4" autocomplete="off" autofocus>
      <p class="hint">Get this from the CadLad studio — click "Connect ChatGPT" to generate a 10-minute code.</p>
      <button type="submit">Authorize</button>
    </form>
  </div>
</body>
</html>`;
}

function renderConsentWithError(p: ConsentParams & { error: string }): Response {
  return new Response(consentHtml(p), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function oauthError(error: string, description: string, status: number): Response {
  return json({ error, error_description: description }, status);
}
