import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveSessionClient, parseLiveSessionEvent, resolveLiveSessionApiBase } from '../live-session-client.js';

describe('resolveLiveSessionApiBase', () => {
  it('prefers explicit option base', () => {
    expect(resolveLiveSessionApiBase({
      optionBase: 'https://api.example.com/',
      envBase: 'https://env.example.com',
      location: new URL('https://studio.example.com'),
    })).toBe('https://api.example.com');
  });

  it('uses env base when option is absent', () => {
    expect(resolveLiveSessionApiBase({
      envBase: 'https://env.example.com/',
      location: new URL('https://studio.example.com'),
    })).toBe('https://env.example.com');
  });

  it('falls back to localhost worker in local development', () => {
    expect(resolveLiveSessionApiBase({
      location: new URL('http://localhost:5173'),
    })).toBe('http://localhost:8787');
  });

  it('falls back to same-origin in non-local environments', () => {
    expect(resolveLiveSessionApiBase({
      location: new URL('https://preview.cadlad.pages.dev'),
    })).toBe('https://preview.cadlad.pages.dev');
  });
});

describe('LiveSessionClient', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalWindow) {
      globalThis.window = originalWindow;
    } else {
      delete (globalThis as Record<string, unknown>).window;
    }
  });

  it('builds API base from the current window location by default', () => {
    const fakeWindow = {
      location: {
        protocol: 'https:',
        hostname: 'preview.cadlad.pages.dev',
        origin: 'https://preview.cadlad.pages.dev',
      },
    };
    Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });

    const client = new LiveSessionClient();
    expect(client.apiBase).toBe('https://preview.cadlad.pages.dev');
  });

  it('ping returns a transport failure when fetch throws', async () => {
    const fakeWindow = {
      location: {
        protocol: 'http:',
        hostname: 'localhost',
        origin: 'http://localhost:5173',
      },
    };
    Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const client = new LiveSessionClient();
    await expect(client.ping()).resolves.toEqual({
      ok: false,
      status: 0,
      body: null,
      url: 'http://localhost:8787/health',
    });
  });

  it('uses oauth access_token from query, stores it, and scrubs the URL', async () => {
    const setItem = vi.fn();
    const getItem = vi.fn().mockReturnValue(null);
    const replaceState = vi.fn();
    const fakeWindow = {
      location: new URL('https://studio.example.com/?access_token=queryToken&foo=1'),
      localStorage: { setItem, getItem },
      history: { replaceState, state: { ok: true } },
    };
    Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: 's1', liveUrl: 'https://studio.example.com/live' }),
    }));

    const client = new LiveSessionClient();
    await client.createSession({ source: 'return box(1,1,1);', params: {} });

    expect(setItem).toHaveBeenCalledWith('cadlad_access_token', 'queryToken');
    expect(replaceState).toHaveBeenCalledWith(
      { ok: true },
      '',
      'https://studio.example.com/?foo=1',
    );
  });

  it('uses oauth access_token from hash and removes only that hash field', async () => {
    const setItem = vi.fn();
    const getItem = vi.fn().mockReturnValue(null);
    const replaceState = vi.fn();
    const fakeWindow = {
      location: new URL('https://studio.example.com/#access_token=hashToken&token_type=bearer'),
      localStorage: { setItem, getItem },
      history: { replaceState, state: null },
    };
    Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: 's1', liveUrl: 'https://studio.example.com/live' }),
    }));

    const client = new LiveSessionClient();
    await client.createSession({ source: 'return box(1,1,1);', params: {} });

    expect(setItem).toHaveBeenCalledWith('cadlad_access_token', 'hashToken');
    expect(replaceState).toHaveBeenCalledWith(
      null,
      '',
      'https://studio.example.com/#token_type=bearer',
    );
  });
});

describe('parseLiveSessionEvent', () => {
  it('parses patch events with required patch shape', () => {
    const event = parseLiveSessionEvent({
      type: 'patch_applied',
      patch: {
        id: 'p1',
        revision: 2,
        summary: 'adjust shell width',
      },
    });

    expect(event).toEqual({
      type: 'patch_applied',
      ts: undefined,
      patch: {
        id: 'p1',
        revision: 2,
        summary: 'adjust shell width',
      },
      session: undefined,
    });
  });

  it('rejects run status events missing a valid result payload', () => {
    expect(parseLiveSessionEvent({
      type: 'run_status',
      revision: 3,
      result: { success: true },
    })).toBeNull();
  });
});
