/**
 * oauth-store.ts — KV-backed OAuth 2.1 state helpers.
 *
 * All OAuth state lives in the KV namespace with these key prefixes:
 *   oauth:client:<clientId>   — registered OAuth clients
 *   oauth:link:<code>         — studio-generated link codes (prove session ownership)
 *   oauth:code:<code>         — short-lived auth codes (PKCE flow)
 *   oauth:token:<token>       — long-lived access tokens
 */

import type {
  OAuthClient,
  OAuthLinkCode,
  OAuthAuthCode,
  OAuthAccessToken,
} from './types.js';

// ── TTL constants ─────────────────────────────────────────────────────────────

const LINK_CODE_TTL_S = 600;       // 10 min: short-lived, user types this in the consent UI
const AUTH_CODE_TTL_S = 300;       // 5 min: standard PKCE auth code window
const ACCESS_TOKEN_TTL_S = 2592000; // 30 days: long-lived convenience token for personal use

// ── Client registration ───────────────────────────────────────────────────────

export async function registerClient(
  kv: KVNamespace,
  opts: { redirectUris: string[]; clientName?: string },
): Promise<OAuthClient> {
  const clientId = crypto.randomUUID();
  const client: OAuthClient = {
    clientId,
    clientName: opts.clientName,
    redirectUris: opts.redirectUris,
    createdAt: Date.now(),
  };
  await kv.put(`oauth:client:${clientId}`, JSON.stringify(client));
  return client;
}

export async function getClient(kv: KVNamespace, clientId: string): Promise<OAuthClient | null> {
  const raw = await kv.get(`oauth:client:${clientId}`);
  return raw ? (JSON.parse(raw) as OAuthClient) : null;
}

// ── Link codes ────────────────────────────────────────────────────────────────

/**
 * Create a short-lived link code that proves the caller owns a session.
 * The studio POSTs to /api/live/session/:id/link (requires write token auth)
 * and the returned code is shown to the user. The user enters it in the
 * OAuth consent page to authorize a client like ChatGPT.
 */
export async function createLinkCode(
  kv: KVNamespace,
  sessionId: string,
  writeToken: string,
): Promise<string> {
  const code = randomHex(8); // 8 lowercase hex chars, easy to type
  const entry: OAuthLinkCode = {
    sessionId,
    writeToken,
    expiresAt: Date.now() + LINK_CODE_TTL_S * 1000,
  };
  await kv.put(`oauth:link:${code}`, JSON.stringify(entry), { expirationTtl: LINK_CODE_TTL_S });
  return code;
}

/**
 * Validate and consume a link code (one-time use).
 * Returns null if the code is invalid or expired.
 */
export async function consumeLinkCode(kv: KVNamespace, code: string): Promise<OAuthLinkCode | null> {
  const normalized = code.trim().toLowerCase();
  const raw = await kv.get(`oauth:link:${normalized}`);
  if (!raw) return null;
  const entry = JSON.parse(raw) as OAuthLinkCode;
  // Always delete on first use to prevent replay
  await kv.delete(`oauth:link:${normalized}`);
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}

// ── Auth codes ────────────────────────────────────────────────────────────────

export async function createAuthCode(
  kv: KVNamespace,
  data: Omit<OAuthAuthCode, 'expiresAt'>,
): Promise<string> {
  const code = crypto.randomUUID();
  const entry: OAuthAuthCode = { ...data, expiresAt: Date.now() + AUTH_CODE_TTL_S * 1000 };
  await kv.put(`oauth:code:${code}`, JSON.stringify(entry), { expirationTtl: AUTH_CODE_TTL_S });
  return code;
}

/**
 * Validate and consume an auth code (one-time use).
 * Returns null if the code is invalid or expired.
 */
export async function consumeAuthCode(kv: KVNamespace, code: string): Promise<OAuthAuthCode | null> {
  const raw = await kv.get(`oauth:code:${code}`);
  if (!raw) return null;
  const entry = JSON.parse(raw) as OAuthAuthCode;
  await kv.delete(`oauth:code:${code}`);
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}

// ── Access tokens ─────────────────────────────────────────────────────────────

export async function createAccessToken(
  kv: KVNamespace,
  data: Omit<OAuthAccessToken, 'issuedAt'>,
): Promise<string> {
  const token = crypto.randomUUID();
  const entry: OAuthAccessToken = { ...data, issuedAt: Date.now() };
  await kv.put(`oauth:token:${token}`, JSON.stringify(entry), { expirationTtl: ACCESS_TOKEN_TTL_S });
  return token;
}

/** Resolve an access token to its session context. Returns null if invalid/expired. */
export async function resolveAccessToken(
  kv: KVNamespace,
  token: string,
): Promise<OAuthAccessToken | null> {
  const raw = await kv.get(`oauth:token:${token}`);
  return raw ? (JSON.parse(raw) as OAuthAccessToken) : null;
}

// ── PKCE verification ─────────────────────────────────────────────────────────

/** Verify that SHA-256(verifier) base64url-encodes to the stored challenge. */
export async function verifyPKCE(verifier: string, challenge: string): Promise<boolean> {
  const data = new TextEncoder().encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const base64url = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return base64url === challenge;
}

// ── Screenshot persistence ────────────────────────────────────────────────────

/**
 * Persist the latest screenshot for a session in KV.
 * Keyed by session ID so the latest always overwrites the previous.
 * Falls back to KV when the DO is evicted and the in-memory screenshot is gone.
 */
export async function saveScreenshot(
  kv: KVNamespace,
  sessionId: string,
  screenshotDataUrl: string,
): Promise<void> {
  // 7-day TTL — long enough for async retrieval but doesn't bloat KV forever
  await kv.put(`screenshot:${sessionId}`, screenshotDataUrl, { expirationTtl: 7 * 24 * 3600 });
}

/** Read the persisted screenshot for a session. Returns null if not found. */
export async function loadScreenshot(kv: KVNamespace, sessionId: string): Promise<string | null> {
  return kv.get(`screenshot:${sessionId}`);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes / 2);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}
