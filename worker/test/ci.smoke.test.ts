import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const BASE = 'http://localhost';

describe('worker smoke', () => {
  it('serves health endpoint', async () => {
    const res = await SELF.fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('cadlad-live-sessions');
  });
});
