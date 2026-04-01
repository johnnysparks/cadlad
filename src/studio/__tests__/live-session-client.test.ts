import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveSessionClient, resolveLiveSessionApiBase } from '../live-session-client.js';

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
});
