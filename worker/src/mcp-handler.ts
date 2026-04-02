/**
 * mcp-handler.ts — Remote MCP endpoint for CadLad live sessions.
 */

import type { Env, SessionState, Patch, ModelStats } from './types.js';
import type { OAuthPrincipal } from './oauth.js';

const TOOLS = [
  {
    name: 'get_session_state',
    title: 'Get Session',
    description: 'Use this when you need the active session source, params, and revision.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string', description: 'Optional project reference. Defaults to your latest session.' },
      },
      required: [],
    },
  },
  {
    name: 'replace_source',
    title: 'Replace Source',
    description: 'Use this when you want to replace the full model source.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string' },
        source: { type: 'string' },
        summary: { type: 'string' },
        intent: { type: 'string' },
        approach: { type: 'string' },
      },
      required: ['source', 'summary'],
    },
  },
  {
    name: 'update_params',
    title: 'Update Params',
    description: 'Use this when you need to adjust param values without changing source code.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string' },
        params: { type: 'object', additionalProperties: { type: 'number' } },
        summary: { type: 'string' },
        intent: { type: 'string' },
      },
      required: ['params', 'summary'],
    },
  },
  {
    name: 'get_latest_screenshot',
    title: 'Get Latest Screenshot',
    description: 'Use this when you need the most recent rendered screenshot artifact.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'request_render_refresh',
    title: 'Request Render Refresh',
    description: 'Use this when you need the studio to generate a fresh screenshot.',
    inputSchema: {
      type: 'object',
      properties: {
        projectRef: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'get_part_stats',
    description:
      'Get named-part stats from the latest run. Optionally filter by partName.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        ...SESSION_PROPS,
        partName: { type: 'string', description: 'Optional exact part name to return' },
      },
      required: ['session', 'token'],
    },
  },
  {
    name: 'query_part_relationship',
    description:
      'Query pairwise relationship between two named parts: intersection flag and minimum distance.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        ...SESSION_PROPS,
        partA: { type: 'string', description: 'First part name' },
        partB: { type: 'string', description: 'Second part name' },
      },
      required: ['session', 'token', 'partA', 'partB'],
    },
  },
];

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handleMcp(request: Request, env: Env, origin: string): Promise<Response> {
  const url = new URL(request.url);
  // URL params are kept for backward compatibility but tool args take precedence.
  const sessionIdFromUrl = url.searchParams.get('session');
  const tokenFromUrl = url.searchParams.get('token');
] as const;

export async function handleMcp(request: Request, env: Env, origin: string, principal: OAuthPrincipal): Promise<Response> {
  const cors = corsHeaders(origin);

  if (request.method === 'GET') {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
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

  let msg: { id?: unknown; method?: string; params?: unknown };
  try {
    msg = await request.json() as typeof msg;
  } catch {
    return rpcError(null, -32700, 'Parse error: body must be JSON-RPC 2.0', cors);
  }

  const { id = null, method = '', params } = msg;

  if (typeof method === 'string' && method.startsWith('notifications/')) {
    return new Response(null, { status: 202, headers: cors });
  }

  try {
    switch (method) {
      case 'initialize':
        return rpcResult(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'cadlad-live-session', version: '0.2.0' },
        }, cors);
      case 'ping':
        return rpcResult(id, {}, cors);
      case 'tools/list':
        return rpcResult(id, { tools: TOOLS }, cors);
      case 'tools/call': {
        const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
        const toolName = p?.name ?? '';
        const args = p?.arguments ?? {};
        const result = await callTool(toolName, args, env, principal, request);
        return rpcResult(id, result, cors);
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method}`, cors);
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    return rpcError(id, -32603, `Internal error: ${m}`, cors);
  }
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  env: Env,
  principal: OAuthPrincipal,
  request: Request,
): Promise<Record<string, unknown>> {
  const sessionId = await resolveSessionId(args.projectRef as string | undefined, env, principal.sub, request);
  if (!sessionId) {
    return {
      content: [{ type: 'text', text: 'No live session found for this account. Create one from the studio first.' }],
      structuredContent: { status: 'missing_session' },
    };
  }

  const stub = env.LIVE_SESSION.get(env.LIVE_SESSION.idFromName(sessionId));
  const base = `http://do/api/live/session/${sessionId}`;

  switch (name) {
    case 'get_session_state': {
      const session = await doGet<SessionState>(stub, base, principal.sub);
      return {
        content: [{ type: 'text', text: `Loaded session ${session.projectRef} at revision ${session.revision}.` }],
        structuredContent: {
          projectRef: session.projectRef,
          revision: session.revision,
          lastSuccessfulRevision: session.lastSuccessfulRevision,
        },
        _meta: {
          source: session.source,
          params: session.params,
          patchCount: session.patches.length,
        },
      };
    }

    case 'replace_source': {
      const { source, summary, intent, approach } = args as { source?: string; summary?: string; intent?: string; approach?: string };
      if (!source || !summary) throw new Error('source and summary are required');
      const result = await doPost<{ patch: Patch }>(stub, `${base}/patch`, principal.sub, {
        type: 'source_replace', source, summary, intent, approach,
      });
      return {
        content: [{ type: 'text', text: `Source updated to revision ${result.patch.revision}.` }],
        structuredContent: { status: 'ok', revision: result.patch.revision },
      };
    }

    case 'update_params': {
      const { params, summary, intent } = args as { params?: Record<string, number>; summary?: string; intent?: string };
      if (!params || !summary) throw new Error('params and summary are required');
      const result = await doPost<{ patch: Patch }>(stub, `${base}/patch`, principal.sub, {
        type: 'param_update', params, summary, intent,
      });
      return {
        content: [{ type: 'text', text: `Params updated in revision ${result.patch.revision}.` }],
        structuredContent: { status: 'ok', revision: result.patch.revision },
      };
    }

    case 'request_render_refresh': {
      const data = await doPost<{ requestedAt: number }>(stub, `${base}/render/refresh`, principal.sub, {});
      return {
        content: [{ type: 'text', text: 'Render refresh requested.' }],
        structuredContent: { status: 'queued', requestedAt: data.requestedAt },
      };
    }

    case 'get_latest_screenshot': {
      const data = await doGet<{ status: string; artifactRef: string | null; hasImage: boolean; imageDataUrl?: string; revision?: number }>(stub, `${base}/render/latest`, principal.sub);
      if (!data.hasImage || !data.imageDataUrl) {
        const run = await doGet<{ runResult: { stats?: ModelStats } | null }>(stub, `${base}/run-result`, principal.sub);
        return {
          content: [{ type: 'text', text: 'No screenshot artifact is available yet.' }],
          structuredContent: { status: 'missing', artifactRef: null, hasImage: false },
          _meta: { stats: run.runResult?.stats ?? null },
        };
      }

      return {
        content: [{ type: 'text', text: `Latest screenshot ready (artifact ${data.artifactRef}).` }],
        structuredContent: {
          status: 'ready',
          artifactRef: data.artifactRef,
          hasImage: true,
          revision: data.revision,
        },
        _meta: {
          widgetDescription: 'Latest CadLad render screenshot',
          image: {
            dataUrl: data.imageDataUrl,
            mimeType: 'image/png',
            artifactRef: data.artifactRef,
          },
        },
      };
    }

    case 'get_part_stats': {
      const resp = await stub.fetch(new Request(`${base}/run-result`));
      if (resp.status === 404) {
        return { content: [{ type: 'text', text: 'No run result yet. Open CadLad Studio and run the model.' }] };
      }
      if (!resp.ok) throw new Error(`Run-result fetch failed: ${resp.status}`);
      const data = await resp.json() as { runResult: RunResult | null; revision?: number };
      const stats = data.runResult?.stats;
      if (!stats?.parts || stats.parts.length === 0) {
        return { content: [{ type: 'text', text: 'No named part stats available yet.' }] };
      }

      const partName = typeof args.partName === 'string' ? args.partName : undefined;
      if (partName) {
        const part = stats.parts.find((p) => p.name === partName);
        if (!part) {
          return { content: [{ type: 'text', text: `Part not found: ${partName}. Available parts: ${stats.parts.map((p) => p.name).join(', ')}` }] };
        }
        return { content: [{ type: 'text', text: formatPartStats(part) }] };
      }

      return { content: [{ type: 'text', text: stats.parts.map(formatPartStats).join('\n\n') }] };
    }

    case 'query_part_relationship': {
      const partA = typeof args.partA === 'string' ? args.partA : '';
      const partB = typeof args.partB === 'string' ? args.partB : '';
      if (!partA || !partB) throw new Error('partA and partB are required');

      const resp = await stub.fetch(new Request(`${base}/run-result`));
      if (resp.status === 404) {
        return { content: [{ type: 'text', text: 'No run result yet. Open CadLad Studio and run the model.' }] };
      }
      if (!resp.ok) throw new Error(`Run-result fetch failed: ${resp.status}`);
      const data = await resp.json() as { runResult: RunResult | null; revision?: number };
      const stats = data.runResult?.stats;
      if (!stats?.parts || stats.parts.length === 0) {
        return { content: [{ type: 'text', text: 'No named part stats available yet.' }] };
      }

      const a = stats.parts.find((p) => p.name === partA);
      const b = stats.parts.find((p) => p.name === partB);
      if (!a || !b) {
        return { content: [{ type: 'text', text: `Unknown part(s). Available parts: ${stats.parts.map((p) => p.name).join(', ')}` }] };
      }

      const pair = stats.pairwise?.find((r) =>
        (r.partA === partA && r.partB === partB) || (r.partA === partB && r.partB === partA),
      );

      if (!pair) {
        return { content: [{ type: 'text', text: `No relationship data available for ${partA} ↔ ${partB}.` }] };
      }

      return {
        content: [{
          type: 'text',
          text: [
            `Part A: ${partA}`,
            `Part B: ${partB}`,
            `Intersects: ${pair.intersects ? 'yes' : 'no'}`,
            `Minimum distance: ${pair.minDistance.toFixed(3)} units`,
          ].join('\n'),
        }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function resolveSessionId(projectRef: string | undefined, env: Env, sub: string, request: Request): Promise<string | null> {
  if (projectRef) {
    // projectRef lookup is not indexed yet; fallback to explicit session id usage for now.
    if (projectRef.startsWith('session_')) return projectRef.slice('session_'.length);
  }

  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('session');
  if (fromQuery) return fromQuery;

  return null;
}

async function doGet<T>(stub: DurableObjectStub, url: string, sub: string): Promise<T> {
  const resp = await stub.fetch(new Request(url, { headers: { 'X-Cadlad-Sub': sub } }));
  if (!resp.ok) throw new Error(`DO read failed (${resp.status})`);
  return resp.json() as Promise<T>;
}

function formatPartStats(part: NonNullable<ModelStats['parts']>[number]): string {
  const bb = part.boundingBox;
  return [
    `Part: ${part.name} (#${part.index})`,
    `Triangles: ${part.triangles.toLocaleString()}`,
    `Extents: X=${part.extents.x.toFixed(2)}  Y=${part.extents.y.toFixed(2)}  Z=${part.extents.z.toFixed(2)}`,
    `Bounding box min: [${bb.min.map((v) => v.toFixed(2)).join(', ')}]`,
    `Bounding box max: [${bb.max.map((v) => v.toFixed(2)).join(', ')}]`,
    `Volume: ${part.volume.toFixed(2)} units³`,
    `Surface area: ${part.surfaceArea.toFixed(2)} units²`,
  ].join('\n');
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
async function doPost<T>(stub: DurableObjectStub, url: string, sub: string, body: unknown): Promise<T> {
  const resp = await stub.fetch(new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cadlad-Sub': sub },
    body: JSON.stringify(body),
  }));
  if (!resp.ok) throw new Error(`DO write failed (${resp.status})`);
  return resp.json() as Promise<T>;
}

function rpcResult(id: unknown, result: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

function rpcError(id: unknown, code: number, message: string, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
    status: 200,
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
