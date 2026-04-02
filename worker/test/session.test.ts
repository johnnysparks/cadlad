import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import type { CreateSessionResponse, SessionState } from '../src/types.js';

const BASE = 'http://localhost';
const SOURCE = 'const b = box(40, 40, 20); return b;';

async function getAccessToken(): Promise<string> {
  const verifier = 'test-verifier-123456789';
  const challenge = await sha256Base64Url(verifier);
  const auth = new URL(`${BASE}/oauth/authorize`);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('client_id', 'test-client');
  auth.searchParams.set('redirect_uri', 'https://example.com/cb');
  auth.searchParams.set('scope', 'cadlad.sessions.read cadlad.sessions.write cadlad.renders.read');
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('code_challenge_method', 'S256');

  const authResp = await SELF.fetch(auth, { redirect: 'manual' });
  expect(authResp.status).toBe(302);
  const location = authResp.headers.get('Location')!;
  const code = new URL(location).searchParams.get('code');
  expect(code).toBeTruthy();

  const tokenResp = await SELF.fetch(`${BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code!,
      client_id: 'test-client',
      redirect_uri: 'https://example.com/cb',
      code_verifier: verifier,
    }),
  });
  expect(tokenResp.status).toBe(200);
  const tokenBody = await tokenResp.json() as { access_token: string };
  return tokenBody.access_token;
}

async function createSession(token: string): Promise<CreateSessionResponse> {
  const res = await SELF.fetch(`${BASE}/api/live/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ source: SOURCE, params: { width: 40 } }),
  });
  expect(res.status).toBe(201);
  return res.json() as Promise<CreateSessionResponse>;
}

describe('oauth metadata', () => {
  it('exposes protected resource metadata', async () => {
    const res = await SELF.fetch(`${BASE}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);
    const body = await res.json() as { scopes_supported: string[] };
    expect(body.scopes_supported).toContain('cadlad.sessions.read');
  });
});

describe('oauth-protected sessions', () => {
  it('requires bearer token', async () => {
    const res = await SELF.fetch(`${BASE}/api/live/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: SOURCE }),
    });
    expect(res.status).toBe(401);
  });

  it('creates and reads a session with oauth token', async () => {
    const token = await getAccessToken();
    const created = await createSession(token);

    const res = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const session = await res.json() as SessionState;
    expect(session.source).toBe(SOURCE);
    expect(session.ownerSub).toBeTruthy();
  });

  it('stores latest render artifact and serves latest render', async () => {
    const token = await getAccessToken();
    const created = await createSession(token);

    const screenshot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    const post = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/run-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        revision: 1,
        result: { success: true, errors: [], warnings: [], timestamp: Date.now(), screenshot },
      }),
    });
    expect(post.status).toBe(200);

    const latest = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/render/latest`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(latest.status).toBe(200);
    const body = await latest.json() as { hasImage: boolean; artifactRef: string | null };
    expect(body.hasImage).toBe(true);
    expect(body.artifactRef).toBeTruthy();
  });
});

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
