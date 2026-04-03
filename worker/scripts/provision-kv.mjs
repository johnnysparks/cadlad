#!/usr/bin/env node
/**
 * provision-kv.mjs — Idempotently create the KV namespace and patch wrangler.toml.
 *
 * Run in CI before `wrangler deploy` to ensure the KV namespace exists and
 * wrangler.toml has real IDs instead of placeholders.
 *
 * Required env vars:
 *   CLOUDFLARE_API_TOKEN   — Cloudflare API token with Workers KV:Edit permission
 *   CLOUDFLARE_ACCOUNT_ID  — Cloudflare account ID
 *
 * Usage:
 *   node worker/scripts/provision-kv.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const CF_API = 'https://api.cloudflare.com/client/v4';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!TOKEN || !ACCOUNT_ID) {
  console.error('Error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const __dir = dirname(fileURLToPath(import.meta.url));
const TOML = join(__dir, '..', 'wrangler.toml');
// Title used for the shared KV namespace (personal tool — production + preview share one namespace)
const NAMESPACE_TITLE = 'cadlad-kv';

async function cfFetch(path, opts = {}) {
  const res = await fetch(`${CF_API}${path}`, { headers, ...opts });
  const data = await res.json();
  if (!data.success) throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  return data.result;
}

// List existing KV namespaces
const namespaces = await cfFetch(`/accounts/${ACCOUNT_ID}/storage/kv/namespaces?per_page=100`);
let kvId = namespaces.find(n => n.title === NAMESPACE_TITLE)?.id;

if (!kvId) {
  console.log(`Creating KV namespace: ${NAMESPACE_TITLE}`);
  try {
    const result = await cfFetch(`/accounts/${ACCOUNT_ID}/storage/kv/namespaces`, {
      method: 'POST',
      body: JSON.stringify({ title: NAMESPACE_TITLE }),
    });
    kvId = result.id;
  } catch (err) {
    // Race condition: another deploy created it between list and create
    const refreshed = await cfFetch(`/accounts/${ACCOUNT_ID}/storage/kv/namespaces?per_page=100`);
    kvId = refreshed.find(n => n.title === NAMESPACE_TITLE)?.id;
    if (!kvId) throw err;
  }
} else {
  console.log(`Found existing KV namespace: ${NAMESPACE_TITLE}`);
}

console.log(`KV namespace ID: ${kvId}`);

// Patch wrangler.toml: replace both placeholder strings with the real ID
let toml = readFileSync(TOML, 'utf8');
const before = toml;
toml = toml
  .replace(/REPLACE_WITH_KV_NAMESPACE_ID/g, kvId)
  .replace(/REPLACE_WITH_KV_PREVIEW_NAMESPACE_ID/g, kvId);
if (toml === before) {
  console.log('wrangler.toml already has real KV IDs — nothing to patch');
} else {
  writeFileSync(TOML, toml);
  console.log('Patched wrangler.toml with real KV namespace ID');
}
