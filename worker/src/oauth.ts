import type { Env } from './types.js';

const ACCESS_TOKEN_TTL_SEC = 60 * 60;
const AUTH_CODE_TTL_SEC = 5 * 60;

export interface OAuthPrincipal {
  sub: string;
  scope: string[];
}

interface SignedPayload {
  typ: 'access_token' | 'auth_code';
  iss: string;
  aud: string;
  sub: string;
  scope: string;
  exp: number;
  iat: number;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: 'S256';
}

export function oauthIssuer(request: Request): string {
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

function oauthSecret(env: Env): string {
  return env.OAUTH_SIGNING_SECRET || 'dev-insecure-signing-secret-change-me';
}

function defaultSub(env: Env): string {
  return env.DEFAULT_USER_SUB || 'local-dev-user';
}

export async function verifyAccessToken(request: Request, env: Env): Promise<OAuthPrincipal | null> {
  const auth = request.headers.get('Authorization');
  const fromHeader = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  const fromQuery = new URL(request.url).searchParams.get('access_token');
  const token = fromHeader || fromQuery;
  if (!token) return null;
  const payload = await verifySigned(token, oauthSecret(env));
  if (!payload || payload.typ !== 'access_token') return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  const issuer = oauthIssuer(request);
  if (payload.iss !== issuer) return null;
  return { sub: payload.sub, scope: splitScope(payload.scope) };
}

export async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const responseType = url.searchParams.get('response_type');
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state') || undefined;
  const scope = url.searchParams.get('scope') || 'cadlad.sessions.read cadlad.sessions.write cadlad.renders.read';
  const codeChallenge = url.searchParams.get('code_challenge');
  const codeChallengeMethod = url.searchParams.get('code_challenge_method');

  if (responseType !== 'code' || !clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== 'S256') {
    return new Response('Invalid OAuth authorize request', { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  const codePayload: SignedPayload = {
    typ: 'auth_code',
    iss: oauthIssuer(request),
    aud: clientId,
    sub: defaultSub(env),
    scope,
    iat: now,
    exp: now + AUTH_CODE_TTL_SEC,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  };
  const code = await signPayload(codePayload, oauthSecret(env));

  const redirect = new URL(redirectUri);
  redirect.searchParams.set('code', code);
  if (state) redirect.searchParams.set('state', state);
  return Response.redirect(redirect.toString(), 302);
}

export async function handleToken(request: Request, env: Env): Promise<Response> {
  const body = await request.text();
  const params = new URLSearchParams(body);
  const grantType = params.get('grant_type');

  if (grantType !== 'authorization_code') {
    return json({ error: 'unsupported_grant_type' }, 400);
  }

  const code = params.get('code');
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const verifier = params.get('code_verifier');

  if (!code || !clientId || !redirectUri || !verifier) {
    return json({ error: 'invalid_request' }, 400);
  }

  const codePayload = await verifySigned(code, oauthSecret(env));
  if (!codePayload || codePayload.typ !== 'auth_code') return json({ error: 'invalid_grant' }, 400);
  if (codePayload.exp <= Math.floor(Date.now() / 1000)) return json({ error: 'invalid_grant' }, 400);
  if (codePayload.client_id !== clientId || codePayload.redirect_uri !== redirectUri) return json({ error: 'invalid_grant' }, 400);

  const challenge = await sha256Base64Url(verifier);
  if (challenge !== codePayload.code_challenge) return json({ error: 'invalid_grant' }, 400);

  const now = Math.floor(Date.now() / 1000);
  const accessPayload: SignedPayload = {
    typ: 'access_token',
    iss: oauthIssuer(request),
    aud: oauthIssuer(request),
    sub: codePayload.sub,
    scope: codePayload.scope,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SEC,
  };
  const accessToken = await signPayload(accessPayload, oauthSecret(env));

  return json({
    token_type: 'Bearer',
    access_token: accessToken,
    expires_in: ACCESS_TOKEN_TTL_SEC,
    scope: codePayload.scope,
  }, 200);
}

export function oauthProtectedResourceMetadata(request: Request): Record<string, unknown> {
  const issuer = oauthIssuer(request);
  return {
    resource: issuer,
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
    scopes_supported: ['cadlad.sessions.read', 'cadlad.sessions.write', 'cadlad.renders.read', 'cadlad.renders.write'],
  };
}

export function oauthAuthorizationServerMetadata(request: Request): Record<string, unknown> {
  const issuer = oauthIssuer(request);
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['cadlad.sessions.read', 'cadlad.sessions.write', 'cadlad.renders.read', 'cadlad.renders.write'],
  };
}

export function requireScope(principal: OAuthPrincipal | null, scope: string): Response | null {
  if (!principal) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer realm="cadlad", resource_metadata="/.well-known/oauth-protected-resource"`,
      },
    });
  }
  if (!principal.scope.includes(scope)) {
    return new Response(JSON.stringify({ error: 'insufficient_scope' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${scope}", resource_metadata="/.well-known/oauth-protected-resource"`,
      },
    });
  }
  return null;
}

export async function handleRegister(): Promise<Response> {
  return json({
    client_id: `cadlad-${crypto.randomUUID()}`,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
  }, 201);
}

function splitScope(scope: string): string[] {
  return scope.split(/\s+/).filter(Boolean);
}

async function signPayload(payload: SignedPayload, secret: string): Promise<string> {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = await hmacSha256(encoded, secret);
  return `${encoded}.${sig}`;
}

async function verifySigned(token: string, secret: string): Promise<SignedPayload | null> {
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expected = await hmacSha256(encoded, secret);
  if (!timingSafeEqual(sig, expected)) return null;
  try {
    return JSON.parse(base64UrlDecode(encoded)) as SignedPayload;
  } catch {
    return null;
  }
}

async function hmacSha256(input: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return base64UrlFromBytes(new Uint8Array(sig));
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return base64UrlFromBytes(new Uint8Array(digest));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function base64UrlEncode(input: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(input));
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const raw = atob(padded);
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
