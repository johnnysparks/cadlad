import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import type { CreateSessionResponse, SessionState, Patch } from '../src/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = 'http://localhost';
const SOURCE = 'const b = box(40, 40, 20); return b;';
const PARAMS = { width: 40, height: 20 };

async function createSession(source = SOURCE, params = PARAMS): Promise<CreateSessionResponse> {
  const res = await SELF.fetch(`${BASE}/api/live/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, params }),
  });
  expect(res.status).toBe(201);
  return res.json() as Promise<CreateSessionResponse>;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ── Health check ──────────────────────────────────────────────────────────────

describe('health check', () => {
  it('GET / returns 200 ok', async () => {
    const res = await SELF.fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  });

  it('unknown path returns 404', async () => {
    const res = await SELF.fetch(`${BASE}/not-a-real-path`);
    expect(res.status).toBe(404);
  });
});

// ── CORS ──────────────────────────────────────────────────────────────────────

describe('CORS', () => {
  it('OPTIONS preflight returns 204 with CORS headers', async () => {
    const res = await SELF.fetch(`${BASE}/api/live/session`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('POST response includes CORS header', async () => {
    const res = await SELF.fetch(`${BASE}/api/live/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: SOURCE }),
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });
});

// ── Session creation ──────────────────────────────────────────────────────────

describe('POST /api/live/session', () => {
  it('creates a session and returns required fields', async () => {
    const data = await createSession();
    expect(data.sessionId).toBeTruthy();
    expect(data.writeToken).toBeTruthy();
    expect(data.liveUrl).toContain(data.sessionId);
    expect(data.liveUrl).toContain(data.writeToken);
    expect(data.session).toBeTruthy();
  });

  it('session has correct initial state', async () => {
    const data = await createSession(SOURCE, PARAMS);
    const s = data.session;
    expect(s.source).toBe(SOURCE);
    expect(s.params).toEqual(PARAMS);
    expect(s.revision).toBe(1);
    expect(s.lastSuccessfulRevision).toBe(0);
    expect(s.patches).toHaveLength(1);
    expect(s.patches[0].type).toBe('create');
  });

  it('accepts empty params', async () => {
    const res = await SELF.fetch(`${BASE}/api/live/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: SOURCE }),
    });
    expect(res.status).toBe(201);
    const data = await res.json() as CreateSessionResponse;
    expect(data.session.params).toEqual({});
  });

  it('returns 400 when source is missing', async () => {
    const res = await SELF.fetch(`${BASE}/api/live/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params: {} }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await SELF.fetch(`${BASE}/api/live/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });
});

// ── Get session ───────────────────────────────────────────────────────────────

describe('GET /api/live/session/:id', () => {
  it('returns full session state', async () => {
    const { sessionId } = await createSession();
    const res = await SELF.fetch(`${BASE}/api/live/session/${sessionId}`);
    expect(res.status).toBe(200);
    const s = await res.json() as SessionState;
    expect(s.id).toBe(sessionId);
    expect(s.source).toBe(SOURCE);
    expect(s.revision).toBe(1);
  });

  it('returns 404 for unknown session', async () => {
    const res = await SELF.fetch(`${BASE}/api/live/session/does-not-exist`);
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('NOT_FOUND');
  });
});

// ── Patch ─────────────────────────────────────────────────────────────────────

describe('POST /api/live/session/:id/patch', () => {
  it('returns 401 without write token', async () => {
    const { sessionId } = await createSession();
    const res = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'source_replace', source: 'return sphere(10);', summary: 'test' }),
    });
    expect(res.status).toBe(401);
  });

  it('accepts token in Authorization header', async () => {
    const { sessionId, writeToken } = await createSession();
    const res = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(writeToken) },
      body: JSON.stringify({ type: 'source_replace', source: 'return sphere(10);', summary: 'Switch to sphere' }),
    });
    expect(res.status).toBe(201);
  });

  it('accepts token as query param', async () => {
    const { sessionId, writeToken } = await createSession();
    const res = await SELF.fetch(
      `${BASE}/api/live/session/${sessionId}/patch?token=${writeToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'source_replace', source: 'return sphere(10);', summary: 'Switch to sphere' }),
      },
    );
    expect(res.status).toBe(201);
  });

  it('source_replace updates source and increments revision', async () => {
    const { sessionId, writeToken } = await createSession();
    const newSource = 'const b = box(80, 80, 20); return b;';

    const res = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(writeToken) },
      body: JSON.stringify({ type: 'source_replace', source: newSource, summary: 'Widen box' }),
    });

    const data = await res.json() as { patch: Patch; session: SessionState };
    expect(data.patch.revision).toBe(2);
    expect(data.patch.sourceBefore).toBe(SOURCE);
    expect(data.patch.sourceAfter).toBe(newSource);
    expect(data.session.source).toBe(newSource);
    expect(data.session.revision).toBe(2);
  });

  it('param_update merges params without changing source', async () => {
    const { sessionId, writeToken } = await createSession();

    const res = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(writeToken) },
      body: JSON.stringify({ type: 'param_update', params: { width: 99 }, summary: 'Set width to 99' }),
    });

    const data = await res.json() as { patch: Patch; session: SessionState };
    expect(data.session.source).toBe(SOURCE); // unchanged
    expect(data.session.params.width).toBe(99);
    expect(data.session.params.height).toBe(20); // preserved
  });

  it('updates lastSuccessfulRevision when runResult.success is true', async () => {
    const { sessionId, writeToken } = await createSession();

    await SELF.fetch(`${BASE}/api/live/session/${sessionId}/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(writeToken) },
      body: JSON.stringify({
        type: 'source_replace',
        source: 'return sphere(10);',
        summary: 'Good patch',
        runResult: { success: true, errors: [], warnings: [], timestamp: Date.now() },
      }),
    });

    const s = await (await SELF.fetch(`${BASE}/api/live/session/${sessionId}`)).json() as SessionState;
    expect(s.lastSuccessfulRevision).toBe(2);
  });

  it('does NOT update lastSuccessfulRevision when runResult.success is false', async () => {
    const { sessionId, writeToken } = await createSession();

    await SELF.fetch(`${BASE}/api/live/session/${sessionId}/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(writeToken) },
      body: JSON.stringify({
        type: 'source_replace',
        source: 'syntax error!!!',
        summary: 'Broken patch',
        runResult: { success: false, errors: ['SyntaxError'], warnings: [], timestamp: Date.now() },
      }),
    });

    const s = await (await SELF.fetch(`${BASE}/api/live/session/${sessionId}`)).json() as SessionState;
    expect(s.lastSuccessfulRevision).toBe(0); // unchanged
  });

  it('returns 400 when summary is missing', async () => {
    const { sessionId, writeToken } = await createSession();
    const res = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(writeToken) },
      body: JSON.stringify({ type: 'source_replace', source: 'return sphere(10);' }),
    });
    expect(res.status).toBe(400);
  });
});

// ── Revert ────────────────────────────────────────────────────────────────────

describe('POST /api/live/session/:id/revert', () => {
  it('returns 401 without write token', async () => {
    const { sessionId, session } = await createSession();
    const res = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patchId: session.patches[0].id }),
    });
    expect(res.status).toBe(401);
  });

  it('reverts source to before the target patch', async () => {
    const { sessionId, writeToken } = await createSession();
    const newSource = 'const s = sphere(30); return s;';

    // Apply a patch
    const patchRes = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(writeToken) },
      body: JSON.stringify({ type: 'source_replace', source: newSource, summary: 'Switch to sphere' }),
    });
    const { patch } = await patchRes.json() as { patch: Patch };

    // Revert it
    const revertRes = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(writeToken) },
      body: JSON.stringify({ patchId: patch.id }),
    });
    expect(revertRes.status).toBe(201);
    const { patch: revertPatch, session } = await revertRes.json() as { patch: Patch; session: SessionState };

    expect(revertPatch.type).toBe('revert');
    expect(revertPatch.revertOf).toBe(patch.id);
    expect(revertPatch.sourceAfter).toBe(SOURCE); // back to original
    expect(session.source).toBe(SOURCE);
    expect(session.revision).toBe(3); // create(1) + patch(2) + revert(3)
  });

  it('is append-only: history grows after revert', async () => {
    const { sessionId, writeToken } = await createSession();

    const patchRes = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/patch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(writeToken) },
      body: JSON.stringify({ type: 'source_replace', source: 'return sphere(10);', summary: 'Sphere' }),
    });
    const { patch } = await patchRes.json() as { patch: Patch };

    await SELF.fetch(`${BASE}/api/live/session/${sessionId}/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(writeToken) },
      body: JSON.stringify({ patchId: patch.id }),
    });

    const s = await (await SELF.fetch(`${BASE}/api/live/session/${sessionId}`)).json() as SessionState;
    // create + patch + revert = 3 entries; none deleted
    expect(s.patches).toHaveLength(3);
    expect(s.patches.map(p => p.type)).toEqual(['create', 'source_replace', 'revert']);
  });

  it('returns 404 for unknown patchId', async () => {
    const { sessionId, writeToken } = await createSession();
    const res = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(writeToken) },
      body: JSON.stringify({ patchId: 'no-such-id' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('PATCH_NOT_FOUND');
  });
});

// ── History ───────────────────────────────────────────────────────────────────

describe('GET /api/live/session/:id/history', () => {
  it('returns initial create patch', async () => {
    const { sessionId } = await createSession();
    const res = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/history`);
    expect(res.status).toBe(200);
    const data = await res.json() as { patches: Patch[]; total: number; offset: number; limit: number };
    expect(data.total).toBe(1);
    expect(data.patches[0].type).toBe('create');
    expect(data.offset).toBe(0);
    expect(data.limit).toBe(50);
  });

  it('respects limit and offset', async () => {
    const { sessionId, writeToken } = await createSession();

    // Add 3 more patches
    for (let i = 0; i < 3; i++) {
      await SELF.fetch(`${BASE}/api/live/session/${sessionId}/patch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(writeToken) },
        body: JSON.stringify({
          type: 'source_replace',
          source: `return box(${10 + i}, 10, 10);`,
          summary: `Patch ${i}`,
        }),
      });
    }

    // total = 4 (create + 3 patches)
    const page1 = await (await SELF.fetch(
      `${BASE}/api/live/session/${sessionId}/history?limit=2&offset=0`,
    )).json() as { patches: Patch[]; total: number };
    expect(page1.total).toBe(4);
    expect(page1.patches).toHaveLength(2);

    const page2 = await (await SELF.fetch(
      `${BASE}/api/live/session/${sessionId}/history?limit=2&offset=2`,
    )).json() as { patches: Patch[]; total: number };
    expect(page2.patches).toHaveLength(2);
    expect(page2.patches[0].type).not.toBe(page1.patches[0].type);
  });
});

// ── SSE ───────────────────────────────────────────────────────────────────────

describe('GET /api/live/session/:id/events', () => {
  it('returns text/event-stream content type', async () => {
    const { sessionId } = await createSession();
    const res = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/events`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
  });

  it('first chunk is a session_snapshot event', async () => {
    const { sessionId } = await createSession();
    const res = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/events`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    // Read until we have at least one complete SSE message
    while (!text.includes('\n\n')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    reader.cancel();

    const dataLine = text.split('\n').find(l => l.startsWith('data:'));
    expect(dataLine).toBeTruthy();
    const event = JSON.parse(dataLine!.slice('data:'.length).trim());
    expect(event.type).toBe('session_snapshot');
    expect(event.session.id).toBe(sessionId);
  });

  it('returns 404 for unknown session', async () => {
    const res = await SELF.fetch(`${BASE}/api/live/session/ghost-session/events`);
    expect(res.status).toBe(404);
  });
});


describe('worker + pages integration behavior', () => {
  it('reflects request Origin in CORS and liveUrl when STUDIO_ORIGIN is unset', async () => {
    const origin = 'https://preview-123.cadlad.pages.dev';
    const res = await SELF.fetch(`${BASE}/api/live/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
      },
      body: JSON.stringify({ source: SOURCE, params: PARAMS }),
    });

    expect(res.status).toBe(201);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(origin);

    const data = await res.json() as CreateSessionResponse;
    expect(data.liveUrl.startsWith(`${origin}?session=`)).toBe(true);
  });

  it('supports run-result endpoint for session health telemetry', async () => {
    const { sessionId, writeToken } = await createSession();

    const before = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/run-result`);
    expect(before.status).toBe(200);
    const beforeBody = await before.json() as { runResult: null; message: string };
    expect(beforeBody.runResult).toBeNull();

    const payload = {
      revision: 1,
      result: {
        success: true,
        errors: [],
        warnings: [],
        timestamp: Date.now(),
        stats: {
          triangles: 100,
          bodies: 1,
          boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
        },
      },
    };

    const post = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/run-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(writeToken) },
      body: JSON.stringify(payload),
    });
    expect(post.status).toBe(200);

    const after = await SELF.fetch(`${BASE}/api/live/session/${sessionId}/run-result`);
    expect(after.status).toBe(200);
    const afterBody = await after.json() as { runResult: typeof payload.result; revision: number };
    expect(afterBody.revision).toBe(1);
    expect(afterBody.runResult.success).toBe(true);
    expect(afterBody.runResult.stats?.triangles).toBe(100);
  });
});
