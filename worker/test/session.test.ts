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
    expect(session.branch.id).toBe(`${created.sessionId}:main`);
    expect(session.cursor.branchId).toBe(session.branch.id);
    expect(session.cursor.baseRevision).toBe(1);
    expect(session.cursor.headRevision).toBe(session.revision);
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
      body: JSON.stringify({
        message: 'Need semantic hole-adding helper',
        context: 'Had to hand-write subtract() chain',
        category: 'api-limitation',
        blockedTask: 'Add three through-holes with consistent offsets',
        attemptedApproach: 'Tried to use add_feature but no hole semantic operation exists',
        workaroundSummary: 'Manual cylinder subtract chain',
      }),
    });
    expect(capGapResp.status).toBe(201);

    const workaroundResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/workaround`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-CadLad-Actor-Kind': 'agent',
        'X-CadLad-Actor-Id': 'test-agent',
      },
      body: JSON.stringify({
        summary: 'Manual slot via subtract chain',
        limitation: 'No dedicated slot primitive for this context',
        workaround: 'Created two cylinders + bridge box and subtracted from body',
        impact: 'medium',
      }),
    });
    expect(workaroundResp.status).toBe(201);

    const eventLogResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/event-log?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(eventLogResp.status).toBe(200);
    const body = await eventLogResp.json() as {
      events: Array<{ type: string; payload?: { category?: string; summary?: string } }>;
    };
    const eventTypes = body.events.map((event) => event.type);

    expect(eventTypes).toContain('source.replaced');
    expect(eventTypes).toContain('scene.param_set');
    expect(eventTypes).toContain('agent.intent_declared');
    expect(eventTypes).toContain('evaluation.completed');
    expect(eventTypes).toContain('agent.capability_gap');
    expect(eventTypes).toContain('agent.workaround_recorded');
    const capGapEvent = body.events.find((event) => event.type === 'agent.capability_gap');
    expect(capGapEvent?.payload?.category).toBe('api-limitation');
    const workaroundEvent = body.events.find((event) => event.type === 'agent.workaround_recorded');
    expect(workaroundEvent?.payload?.summary).toBe('Manual slot via subtract chain');

    const branchAware = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/event-log?limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const branchBody = await branchAware.json() as { events: Array<{ branchId?: string }> };
    expect(branchBody.events.every((event) => event.branchId === `${created.sessionId}:main`)).toBe(true);
  });



  it('generates API improvement candidates from recurring workaround telemetry', async () => {
    const token = await getAccessToken();
    const created = await createSession(token);

    for (let i = 0; i < 2; i += 1) {
      const workaroundResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/workaround`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-CadLad-Actor-Kind': 'agent',
          'X-CadLad-Actor-Id': 'test-agent',
        },
        body: JSON.stringify({
          summary: 'Manual slot via subtract chain',
          limitation: 'No slot helper available',
          workaround: 'Built slot using cylinders + bridge box subtraction',
          impact: 'medium',
        }),
      });
      expect(workaroundResp.status).toBe(201);
    }

    const capGapResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/capability-gap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-CadLad-Actor-Kind': 'agent',
        'X-CadLad-Actor-Id': 'test-agent',
      },
      body: JSON.stringify({
        message: 'Need semantic slot API',
        category: 'missing-primitive',
        workaroundSummary: 'Manual slot via subtract chain',
      }),
    });
    expect(capGapResp.status).toBe(201);

    const reportResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/api-improvements?threshold=2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(reportResp.status).toBe(200);
    const body = await reportResp.json() as {
      report: {
        promotedCount: number;
        candidates: Array<{ proposedKind: string; promotion: { ready: boolean } }>;
      };
    };

    expect(body.report.promotedCount).toBeGreaterThanOrEqual(1);
    expect(body.report.candidates[0]?.proposedKind).toBe('primitive');
    expect(body.report.candidates[0]?.promotion.ready).toBe(true);
  });

  it('creates addressable revisions with source hash and evaluation reference', async () => {
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
        type: 'source_replace',
        source: 'const b = box(45, 40, 20); return b;',
        summary: 'Increase width',
        intent: 'Check alternate proportions',
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
          stats: {
            triangles: 12,
            bodies: 1,
            boundingBox: { min: [0, 0, 0], max: [45, 40, 20] },
          },
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

    const revisionsResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/revisions?limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(revisionsResp.status).toBe(200);
    const revisionsBody = await revisionsResp.json() as { revisions: Array<{ revision: number; sourceHash: string; evaluation?: { eventId: string } }> };
    expect(revisionsBody.revisions.length).toBeGreaterThanOrEqual(2);
    const revision2 = revisionsBody.revisions.find((entry) => entry.revision === 2);
    expect(revision2).toBeTruthy();
    expect(revision2?.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(revision2?.evaluation?.eventId).toBeTruthy();

    const revisionResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/revisions/2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(revisionResp.status).toBe(200);
    const revisionBody = await revisionResp.json() as {
      source: string;
      stats: { triangles: number } | null;
      validation: { summary: { errorCount: number } } | null;
    };
    expect(revisionBody.source).toContain('box(45, 40, 20)');
    expect(revisionBody.stats?.triangles).toBe(12);
    expect(revisionBody.validation?.summary.errorCount).toBe(0);
  });

  it('supports branch creation, checkout, and branch-head comparison', async () => {
    const token = await getAccessToken();
    const created = await createSession(token);

    const branchesResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/branches`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(branchesResp.status).toBe(200);
    const branchesBody = await branchesResp.json() as {
      activeBranchId: string;
      branches: Array<{ id: string; name: string; headRevision: number }>;
    };
    const mainBranch = branchesBody.branches.find((branch) => branch.name === 'main');
    expect(mainBranch).toBeTruthy();
    expect(mainBranch?.headRevision).toBe(1);

    const createBranchResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/branches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'thicker-wall', fromRevision: 1 }),
    });
    expect(createBranchResp.status).toBe(201);
    const createBody = await createBranchResp.json() as { branch: { id: string; name: string; headRevision: number } };
    expect(createBody.branch.name).toBe('thicker-wall');
    expect(createBody.branch.headRevision).toBe(1);

    const checkoutResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/branches/${createBody.branch.id}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    expect(checkoutResp.status).toBe(200);

    const patchResp = await SELF.fetch(`${BASE}/api/live/session/${created.sessionId}/patch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: 'source_replace',
        source: 'const b = box(55, 40, 20); return b;',
        summary: 'Widen body on alternate branch',
      }),
    });
    expect(patchResp.status).toBe(201);

    const compareResp = await SELF.fetch(
      `${BASE}/api/live/session/${created.sessionId}/compare-branches?a=${mainBranch?.id}&b=${createBody.branch.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(compareResp.status).toBe(200);
    const compareBody = await compareResp.json() as {
      branches: { a: { name: string; headRevision: number }; b: { name: string; headRevision: number } };
      revisions: { a: { revision: number }; b: { revision: number } };
    };
    expect(compareBody.branches.a.name).toBe('main');
    expect(compareBody.branches.b.name).toBe('thicker-wall');
    expect(compareBody.revisions.a.revision).toBe(1);
    expect(compareBody.revisions.b.revision).toBe(2);
  });
});

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
