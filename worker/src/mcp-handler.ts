/**
 * mcp-handler.ts — Remote MCP endpoint for CadLad live sessions.
 *
 * Implements the MCP Streamable HTTP transport (2024-11-05 protocol version)
 * directly in the Cloudflare Worker — no SDK required, no Node.js dependencies.
 *
 * Endpoint: POST /mcp?session=<id>&token=<writeToken>
 *
 * Supports:
 *   initialize         — capabilities handshake
 *   ping               — keepalive
 *   tools/list         — enumerate available tools
 *   tools/call         — invoke a tool
 *   notifications/*    — client notifications (acknowledged, no response)
 *
 * Tools exposed:
 *   get_session_state, list_patch_history, replace_source, apply_patch,
 *   update_params, revert_patch, get_latest_screenshot, get_model_stats
 */

import type { Env, SessionState, Patch, RunResult, ModelStats } from './types.js';

// ── MCP tool definitions ──────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_session_state',
    description:
      'Read the current CadLad session: source code, parameter values, revision number, and last-successful revision. Always call this first to understand what you\'re working with.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_patch_history',
    description:
      'List the patch history for this session. Each entry shows what changed, the intent, and whether the run succeeded.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max patches to return (default 20, max 50)' },
        offset: { type: 'number', description: 'Skip first N patches for pagination' },
      },
      required: [],
    },
  },
  {
    name: 'replace_source',
    description:
      'Replace the entire model source with new .forge.js code. The studio rerenders automatically after this call.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Complete new .forge.js model source code' },
        summary: { type: 'string', description: 'One-line description of what changed' },
        intent: { type: 'string', description: 'Why this change was made' },
        approach: { type: 'string', description: 'Technical approach used' },
      },
      required: ['source', 'summary'],
    },
  },
  {
    name: 'apply_patch',
    description:
      'Apply a patch atomically. type=source_replace for full code update, type=param_update for slider changes.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['source_replace', 'param_update'] },
        source: { type: 'string', description: 'Required for source_replace' },
        params: { type: 'object', additionalProperties: { type: 'number' }, description: 'Required for param_update' },
        summary: { type: 'string' },
        intent: { type: 'string' },
        approach: { type: 'string' },
      },
      required: ['type', 'summary'],
    },
  },
  {
    name: 'update_params',
    description:
      'Change one or more param() values without touching the source code. Good for exploring parameter space.',
    inputSchema: {
      type: 'object',
      properties: {
        params: { type: 'object', additionalProperties: { type: 'number' } },
        summary: { type: 'string' },
        intent: { type: 'string' },
      },
      required: ['params', 'summary'],
    },
  },
  {
    name: 'revert_patch',
    description:
      'Undo a specific patch by its ID. Creates a new patch that restores prior state — history is never rewritten.',
    inputSchema: {
      type: 'object',
      properties: {
        patchId: { type: 'string', description: 'ID of the patch to revert (from list_patch_history)' },
        summary: { type: 'string' },
      },
      required: ['patchId'],
    },
  },
  {
    name: 'get_latest_screenshot',
    description:
      'Get the most recent render screenshot posted by the connected CadLad Studio. Returns a PNG image, or model stats text if no screenshot is available.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_model_stats',
    description:
      'Get geometry statistics from the last run: triangle count, body count, bounding box, volume, surface area.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
] as const;

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handleMcp(request: Request, env: Env, origin: string): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session');
  const token = url.searchParams.get('token');

  const cors = corsHeaders(origin);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  // GET — Claude.ai probes the endpoint before connecting.
  // Return a minimal SSE stream with a 200 so the client sees the server as alive.
  // Per MCP Streamable HTTP spec, GET is used for server→client SSE notifications
  // (optional). We don't push notifications, so we open the stream and keep it
  // alive briefly then close.
  if (request.method === 'GET') {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    // Send one comment to confirm the stream is open, then close
    writer.write(enc.encode(': cadlad-mcp-ready\n\n')).then(() => writer.close()).catch(() => {});
    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...cors,
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: cors });
  }

  if (!sessionId || !token) {
    return rpcError(null, -32600, 'Missing required query params: session, token', cors);
  }

  let msg: { id?: unknown; method?: string; params?: unknown };
  try {
    msg = await request.json() as typeof msg;
  } catch {
    return rpcError(null, -32700, 'Parse error: body must be JSON-RPC 2.0', cors);
  }

  const { id = null, method = '', params } = msg;

  // Client notifications — acknowledge with 202, no JSON body
  if (typeof method === 'string' && method.startsWith('notifications/')) {
    return new Response(null, { status: 202, headers: cors });
  }

  try {
    switch (method) {
      case 'initialize':
        return rpcResult(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'cadlad-live-session', version: '0.1.0' },
        }, cors);

      case 'ping':
        return rpcResult(id, {}, cors);

      case 'tools/list':
        return rpcResult(id, { tools: TOOLS }, cors);

      case 'tools/call': {
        const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
        const toolName = p?.name ?? '';
        const args = p?.arguments ?? {};
        const result = await callTool(toolName, args, sessionId, token, env);
        return rpcResult(id, result, cors);
      }

      default:
        return rpcError(id, -32601, `Method not found: ${method}`, cors);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return rpcError(id, -32603, `Internal error: ${msg}`, cors);
  }
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function callTool(
  name: string,
  args: Record<string, unknown>,
  sessionId: string,
  token: string,
  env: Env,
): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }> {
  const stub = env.LIVE_SESSION.get(env.LIVE_SESSION.idFromName(sessionId));
  const base = `http://do/api/live/session/${sessionId}`;

  switch (name) {
    case 'get_session_state': {
      const resp = await stub.fetch(new Request(base));
      if (!resp.ok) throw new Error(`Session read failed: ${resp.status}`);
      const session = await resp.json() as SessionState;
      return { content: [{ type: 'text', text: formatSession(session) }] };
    }

    case 'list_patch_history': {
      const limit = Math.min(Number(args.limit ?? 20), 50);
      const offset = Number(args.offset ?? 0);
      const resp = await stub.fetch(new Request(`${base}/history?limit=${limit}&offset=${offset}`));
      if (!resp.ok) throw new Error(`History read failed: ${resp.status}`);
      const history = await resp.json() as { patches: Patch[]; total: number };
      return { content: [{ type: 'text', text: formatHistory(history) }] };
    }

    case 'replace_source': {
      const { source, summary, intent, approach } = args as {
        source?: string; summary?: string; intent?: string; approach?: string;
      };
      if (!source || !summary) throw new Error('source and summary are required');
      const resp = await doPost(stub, `${base}/patch`, token, {
        type: 'source_replace', source, summary, intent, approach,
      });
      const result = await resp.json() as { patch: Patch };
      return { content: [{ type: 'text', text: patchAppliedMsg(result.patch) }] };
    }

    case 'apply_patch': {
      const { type, source, params, summary, intent, approach } = args as {
        type?: string; source?: string; params?: Record<string, number>;
        summary?: string; intent?: string; approach?: string;
      };
      if (!type || !summary) throw new Error('type and summary are required');
      if (type === 'source_replace' && !source) throw new Error('source is required for source_replace');
      if (type === 'param_update' && (!params || Object.keys(params).length === 0))
        throw new Error('params is required for param_update');
      const resp = await doPost(stub, `${base}/patch`, token, {
        type, source, params, summary, intent, approach,
      });
      const result = await resp.json() as { patch: Patch };
      return { content: [{ type: 'text', text: patchAppliedMsg(result.patch) }] };
    }

    case 'update_params': {
      const { params, summary, intent } = args as {
        params?: Record<string, number>; summary?: string; intent?: string;
      };
      if (!params || !summary) throw new Error('params and summary are required');
      const resp = await doPost(stub, `${base}/patch`, token, {
        type: 'param_update', params, summary, intent,
      });
      const result = await resp.json() as { patch: Patch };
      const changed = Object.entries(params).map(([k, v]) => `  ${k} → ${v}`).join('\n');
      return {
        content: [{
          type: 'text',
          text: `Param update applied: revision ${result.patch.revision}\n\nChanged:\n${changed}\n\nThe studio will rerender automatically.`,
        }],
      };
    }

    case 'revert_patch': {
      const { patchId, summary } = args as { patchId?: string; summary?: string };
      if (!patchId) throw new Error('patchId is required');
      const resp = await doPost(stub, `${base}/revert`, token, { patchId, summary });
      const result = await resp.json() as { patch: Patch };
      return {
        content: [{
          type: 'text',
          text: `Revert applied: revision ${result.patch.revision}\nReverted: ${patchId}\nSummary: ${result.patch.summary}`,
        }],
      };
    }

    case 'get_latest_screenshot': {
      const resp = await stub.fetch(new Request(`${base}/run-result`));
      if (resp.status === 404) {
        return { content: [{ type: 'text', text: 'No run result yet. Open CadLad Studio with the session URL and run the model.' }] };
      }
      if (!resp.ok) throw new Error(`Run-result fetch failed: ${resp.status}`);
      const data = await resp.json() as { runResult: RunResult | null; revision?: number };
      if (!data.runResult) {
        return { content: [{ type: 'text', text: 'No run result posted yet.' }] };
      }
      const rr = data.runResult;
      if (rr.screenshot) {
        const match = rr.screenshot.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const [, mimeType, base64Data] = match;
          return {
            content: [
              { type: 'image', data: base64Data, mimeType },
              {
                type: 'text',
                text: `Revision ${data.revision} render. Success: ${rr.success}.${rr.errors.length ? `\nErrors: ${rr.errors.join('; ')}` : ''}`,
              },
            ],
          };
        }
      }
      if (rr.stats) {
        return { content: [{ type: 'text', text: `No screenshot available. Stats:\n${formatStats(rr.stats)}` }] };
      }
      return { content: [{ type: 'text', text: `Run result exists (revision ${data.revision}), success: ${rr.success}. No screenshot or stats yet.` }] };
    }

    case 'get_model_stats': {
      const resp = await stub.fetch(new Request(`${base}/run-result`));
      if (resp.status === 404) {
        return { content: [{ type: 'text', text: 'No run result yet. Open CadLad Studio and run the model.' }] };
      }
      if (!resp.ok) throw new Error(`Run-result fetch failed: ${resp.status}`);
      const data = await resp.json() as { runResult: RunResult | null; revision?: number };
      if (!data.runResult?.stats) {
        return { content: [{ type: 'text', text: 'No geometry stats available yet.' }] };
      }
      return { content: [{ type: 'text', text: formatStats(data.runResult.stats) }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── DO helper ─────────────────────────────────────────────────────────────────

async function doPost(
  stub: DurableObjectStub,
  url: string,
  token: string,
  body: unknown,
): Promise<Response> {
  const resp = await stub.fetch(new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }));
  if (!resp.ok) {
    const text = await resp.text().catch(() => String(resp.status));
    throw new Error(`DO request failed (${resp.status}): ${text}`);
  }
  return resp;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatSession(s: SessionState): string {
  return [
    `Session: ${s.id}`,
    `Revision: ${s.revision} (last successful: ${s.lastSuccessfulRevision})`,
    `Params: ${Object.keys(s.params).length > 0 ? JSON.stringify(s.params) : 'none'}`,
    `Patches: ${s.patches.length}`,
    `Updated: ${new Date(s.updatedAt).toISOString()}`,
    '',
    '=== Source ===',
    s.source,
  ].join('\n');
}

function formatHistory(h: { patches: Patch[]; total: number }): string {
  if (h.patches.length === 0) return 'No patches yet.';
  const lines = [`Showing ${h.patches.length} of ${h.total} patches`, ''];
  for (const p of h.patches) {
    const status = p.runResult
      ? p.runResult.success ? '✓' : `✗ (${p.runResult.errors.slice(0, 1).join('; ')})`
      : '?';
    lines.push(`[${p.revision}] ${status} ${p.type} — ${p.summary}`);
    lines.push(`  id: ${p.id}  at: ${new Date(p.createdAt).toISOString()}`);
    if (p.intent) lines.push(`  intent: ${p.intent}`);
    if (p.approach) lines.push(`  approach: ${p.approach}`);
    if (p.revertOf) lines.push(`  reverts: ${p.revertOf}`);
  }
  return lines.join('\n');
}

function formatStats(stats: ModelStats): string {
  const bb = stats.boundingBox;
  const size = [
    (bb.max[0] - bb.min[0]).toFixed(1),
    (bb.max[1] - bb.min[1]).toFixed(1),
    (bb.max[2] - bb.min[2]).toFixed(1),
  ];
  return [
    `Bodies: ${stats.bodies}`,
    `Triangles: ${stats.triangles.toLocaleString()}`,
    `Bounding box: ${size[0]} × ${size[1]} × ${size[2]} (W × H × D, model units)`,
    `  min: [${bb.min.map(v => v.toFixed(2)).join(', ')}]`,
    `  max: [${bb.max.map(v => v.toFixed(2)).join(', ')}]`,
    stats.volume !== undefined ? `Volume: ${stats.volume.toFixed(2)} units³` : '',
    stats.surfaceArea !== undefined ? `Surface area: ${stats.surfaceArea.toFixed(2)} units²` : '',
  ].filter(Boolean).join('\n');
}

function patchAppliedMsg(patch: Patch): string {
  return [
    `Patch applied: revision ${patch.revision}`,
    `Summary: ${patch.summary}`,
    patch.intent ? `Intent: ${patch.intent}` : '',
    patch.approach ? `Approach: ${patch.approach}` : '',
    '',
    'The studio will rerender automatically. Call get_latest_screenshot after a moment to see the result.',
  ].filter(line => line !== undefined).join('\n').replace(/\n\n\n+/g, '\n\n');
}

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

function rpcResult(id: unknown, result: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function rpcError(
  id: unknown,
  code: number,
  message: string,
  cors: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
    status: 200, // MCP errors are still HTTP 200 with error in body
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
