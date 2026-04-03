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
    expect(session.id).toBe(created.sessionId);
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

  it('records phase 2.1 session events and exposes event log', async () => {
    const token = await getAccessToken();
    const created = await createSession(token);

    const patchResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/patch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-CadLad-Actor-Kind': 'agent',
        'X-CadLad-Actor-Id': 'test-agent',
      },
      body: JSON.stringify({
        type: 'param_update',
        params: { width: 45 },
        summary: 'Try wider body',
        intent: 'Improve grip comfort',
      }),
    });
    expect(patchResp.status).toBe(201);

    const runResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/run-result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-CadLad-Actor-Kind': 'agent',
        'X-CadLad-Actor-Id': 'test-agent',
      },
      body: JSON.stringify({
        revision: 2,
        result: {
          success: true,
          errors: [],
          warnings: [],
          timestamp: Date.now(),
          evaluation: {
            summary: { errorCount: 0, warningCount: 0 },
            typecheck: { status: 'pass', errorCount: 0, warningCount: 0, diagnostics: [] },
            semanticValidation: { status: 'pass', errorCount: 0, warningCount: 0, diagnostics: [] },
            geometryValidation: { status: 'pass', errorCount: 0, warningCount: 0, diagnostics: [] },
            relationValidation: { status: 'pass', errorCount: 0, warningCount: 0, diagnostics: [] },
            stats: { available: false },
            tests: { status: 'skipped', total: 0, failures: 0, results: [] },
            render: { requested: false },
          },
        },
      }),
    });
    expect(runResp.status).toBe(200);

    const capGapResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/capability-gap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-CadLad-Actor-Kind': 'agent',
        'X-CadLad-Actor-Id': 'test-agent',
      },
      body: JSON.stringify({ message: 'Need semantic hole-adding helper', context: 'Had to hand-write subtract() chain' }),
    });
    expect(capGapResp.status).toBe(201);

    const eventLogResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/event-log?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(eventLogResp.status).toBe(200);
    const body = await eventLogResp.json() as { events: Array<{ type: string }> };
    const eventTypes = body.events.map((event) => event.type);

    expect(eventTypes).toContain('source.replaced');
    expect(eventTypes).toContain('scene.param_set');
    expect(eventTypes).toContain('agent.intent_declared');
    expect(eventTypes).toContain('evaluation.completed');
    expect(eventTypes).toContain('agent.capability_gap');
  });
});

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
