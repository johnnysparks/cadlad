/**
 * mcp-handler.ts — Remote MCP endpoint (Streamable HTTP transport, 2025-03-26).
 *
 * Auth: OAuth 2.1 Bearer token. Every request (except initialize/ping/tools/list)
 * requires Authorization: Bearer <access_token>. The token is resolved server-side
 * to a session + write token; nothing sensitive appears in tool inputs or outputs.
 *
 * Endpoint: POST /mcp
 *
 * Tools: evaluate · get_stats · get_validation · compare · compare_branches · get_session_state ·
 *        list_patch_history · replace_source · apply_patch · update_params ·
 *        revert_patch · get_latest_screenshot · get_model_stats · list_features ·
 *        check_printability · check_moldability · suggest_improvements ·
 *        report_capability_gap · record_workaround
 */

import type { Env, SessionState, Patch, RunResult, ModelStats, RenderStatus } from './types.js';
import { resolveAccessToken, loadScreenshot } from './oauth-store.js';
import { extractSceneFeatures } from './scene-features.js';

// ── Tool definitions (no session/token in schemas) ────────────────────────────

const TOOLS = [
  {
    name: 'evaluate',
    description: 'Get the latest full evaluation bundle (diagnostics, stage summaries, tests, and geometry stats) for the active model.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Optional source for API compatibility; current session run is returned.' },
        paramOverrides: { type: 'object', additionalProperties: { type: 'number' } },
      },
      required: [],
    },
  },
  {
    name: 'get_stats',
    description: 'Get structured geometry stats from the latest run result for the active model.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_validation',
    description: 'Get all validation diagnostics and stage/test pass-fail summaries from the latest model run.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'compare',
    description: 'Compare two previously evaluated revisions (or code snapshots) by stats and validation summary deltas.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        revisionA: { type: 'number' },
        revisionB: { type: 'number' },
        codeA: { type: 'string' },
        codeB: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'list_branches',
    description: 'List all branches for the current session, including active branch and head revisions.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'create_branch',
    description: 'Create a named branch from a revision (defaults to the current revision).',
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        fromRevision: { type: 'number' },
      },
      required: ['name'],
    },
  },
  {
    name: 'checkout_branch',
    description: 'Switch the live session cursor to a branch head revision.',
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        branchId: { type: 'string' },
      },
      required: ['branchId'],
    },
  },
  {
    name: 'compare_branches',
    description: 'Compare two branch heads with structured geometry, params, and validation deltas.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        branchA: { type: 'string' },
        branchB: { type: 'string' },
      },
      required: ['branchA', 'branchB'],
    },
  },

  {
    name: 'list_features',
    description: 'List defineScene() features with stable ids, kinds, labels, and refs for feature-level agent workflows.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'check_printability',
    description: 'Analyze latest geometry stats for FDM printability risks: thin features, overhang risk proxy, bed adhesion proxy, and disconnected components.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        minWallThickness: { type: 'number' },
        maxOverhangRatio: { type: 'number' },
        minBedAdhesionRatio: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'check_moldability',
    description: 'Analyze latest geometry stats for injection molding risks: low draft proxy, wall-uniformity proxy, and complexity indicators.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        minDraftDeg: { type: 'number' },
        maxThicknessVarianceRatio: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'suggest_improvements',
    description: 'Return actionable suggestions with severity and auto-fixability by combining printability, moldability, and validation diagnostics.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        includeChecks: {
          type: 'array',
          items: { type: 'string', enum: ['printability', 'moldability'] },
        },
      },
      required: [],
    },
  },
  {
    name: 'report_capability_gap',
    description: 'Record an agent capability gap event (missing primitive/API/validation gap) for learning and prioritization.',
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        context: { type: 'string' },
        category: { type: 'string', enum: ['missing-primitive', 'api-limitation', 'validation-gap', 'other'] },
        blockedTask: { type: 'string' },
        attemptedApproach: { type: 'string' },
        workaroundSummary: { type: 'string' },
      },
      required: ['message'],
    },
  },
  {
    name: 'record_workaround',
    description: 'Record a workaround pattern the agent used so repeated hacks can be promoted into first-class APIs.',
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        limitation: { type: 'string' },
        workaround: { type: 'string' },
        impact: { type: 'string', enum: ['low', 'medium', 'high'] },
        patchId: { type: 'string' },
      },
      required: ['summary', 'limitation', 'workaround'],
    },
  },
  {
    name: 'get_session_state',
    description: 'Read the current model: source code, parameter values, revision, and last-successful revision. Call this first to understand what you\'re working with.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_patch_history',
    description: 'Use this when you need to review prior changes or find a patch to revert. Returns each patch with its summary, intent, run status, and ID.',
    annotations: { readOnlyHint: true, openWorldHint: false },
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
    description: 'Use this to replace the entire .forge.js model source. The studio rerenders automatically. Always provide a clear summary and intent.',
    annotations: { readOnlyHint: false, destructiveHint: false },
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
    description: 'Use this to apply a source or parameter change atomically. type=source_replace for full code update, type=param_update for slider changes.',
    annotations: { readOnlyHint: false, destructiveHint: false },
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
    description: 'Use this to change param() slider values without rewriting source. Good for exploring parameter space.',
    annotations: { readOnlyHint: false, destructiveHint: false },
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
    description: 'Use this to undo a specific patch by its ID. Creates a new patch that restores prior state — history is never rewritten.',
    annotations: { readOnlyHint: false, destructiveHint: false },
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
    description: 'Use this to see the current render. Returns a PNG image of the most recent model render from the connected CadLad Studio.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_model_stats',
    description: 'Use this to check geometry metrics: triangle count, body count, bounding box, volume, surface area.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

// ── Main handler ──────────────────────────────────────────────────────────────

export async function handleMcp(request: Request, env: Env, origin: string): Promise<Response> {
  const cors = corsHeaders(origin);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  // GET — SSE keepalive probe (MCP Streamable HTTP optional server→client channel)
  if (request.method === 'GET') {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    writer.write(new TextEncoder().encode(': cadlad-mcp-ready\n\n')).then(() => writer.close()).catch(() => {});
    return new Response(readable, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', ...cors },
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
      // initialize and ping do not require auth — they are protocol-level handshakes.
      case 'initialize':
        return rpcResult(id, {
          protocolVersion: '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'cadlad', version: '1.0.0' },
        }, cors);

      case 'ping':
        return rpcResult(id, {}, cors);

      // tools/list is intentionally public — no secrets in the schema.
      case 'tools/list':
        return rpcResult(id, { tools: TOOLS }, cors);

      case 'tools/call': {
        // All tool calls require a valid OAuth Bearer token.
        const authContext = await resolveAuth(request, env);
        if (!authContext) {
          // Signal the MCP client to initiate OAuth flow.
          const resourceMeta = `${origin}/.well-known/oauth-protected-resource`;
          return new Response(
            JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32001, message: 'Unauthorized: obtain an access token via OAuth' } }),
            {
              status: 401,
              headers: {
                'Content-Type': 'application/json',
                // WWW-Authenticate per MCP 2025-03-26 OAuth spec
                'WWW-Authenticate': `Bearer realm="cadlad", resource_metadata="${resourceMeta}"`,
                ...cors,
              },
            },
          );
        }

        const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
        const toolName = p?.name ?? '';
        const args = p?.arguments ?? {};
        const result = await callTool(toolName, args, authContext.sessionId, authContext.writeToken, env);
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

// ── Auth resolution ───────────────────────────────────────────────────────────

async function resolveAuth(
  request: Request,
  env: Env,
): Promise<{ sessionId: string; writeToken: string } | null> {
  const header = request.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const resolved = await resolveAccessToken(env.KV, token);
  if (!resolved) return null;
  return { sessionId: resolved.sessionId, writeToken: resolved.writeToken };
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function callTool(
  name: string,
  args: Record<string, unknown>,
  sessionId: string,
  writeToken: string,
  env: Env,
): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> }> {
  const stub = env.LIVE_SESSION.get(env.LIVE_SESSION.idFromName(sessionId));
  const base = `http://do/api/live/session/${sessionId}`;

  switch (name) {

    case 'list_features': {
      const sessionResp = await stub.fetch(new Request(base));
      if (!sessionResp.ok) throw new Error(`Session read failed: ${sessionResp.status}`);
      const session = await sessionResp.json() as SessionState;
      const parsed = extractSceneFeatures(session.source);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            revision: session.revision,
            count: parsed.features.length,
            features: parsed.features,
            warnings: parsed.warnings,
          }, null, 2),
        }],
      };
    }

    case 'check_printability': {
      const resp = await stub.fetch(new Request(`${base}/run-result`));
      if (resp.status === 404 || !resp.ok) {
        return { content: [{ type: 'text', text: 'No run result yet. Open CadLad Studio and run the model.' }] };
      }
      const data = await resp.json() as { runResult: RunResult | null; revision?: number };
      if (!data.runResult?.stats) {
        return { content: [{ type: 'text', text: 'No geometry stats available yet.' }] };
      }
      const report = analyzePrintability(data.runResult.stats, args);
      return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
    }

    case 'check_moldability': {
      const resp = await stub.fetch(new Request(`${base}/run-result`));
      if (resp.status === 404 || !resp.ok) {
        return { content: [{ type: 'text', text: 'No run result yet. Open CadLad Studio and run the model.' }] };
      }
      const data = await resp.json() as { runResult: RunResult | null; revision?: number };
      if (!data.runResult?.stats) {
        return { content: [{ type: 'text', text: 'No geometry stats available yet.' }] };
      }
      const report = analyzeMoldability(data.runResult.stats, args);
      return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
    }

    case 'suggest_improvements': {
      const resp = await stub.fetch(new Request(`${base}/run-result`));
      if (resp.status === 404 || !resp.ok) {
        return { content: [{ type: 'text', text: 'No run result yet. Open CadLad Studio and run the model.' }] };
      }
      const data = await resp.json() as { runResult: RunResult | null; revision?: number };
      if (!data.runResult?.stats) {
        return { content: [{ type: 'text', text: 'No geometry stats available yet.' }] };
      }
      const report = buildImprovementSuggestions(data.runResult.stats, data.runResult.diagnostics ?? [], args);
      return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
    }

    case 'get_session_state': {
      const resp = await stub.fetch(new Request(base));
      if (!resp.ok) throw new Error(`Session read failed: ${resp.status}`);
      const session = await resp.json() as SessionState;
      return { content: [{ type: 'text', text: formatSession(session) }] };
    }

    case 'report_capability_gap': {
      const { message, context, category, blockedTask, attemptedApproach, workaroundSummary } = args as {
        message?: string;
        context?: string;
        category?: 'missing-primitive' | 'api-limitation' | 'validation-gap' | 'other';
        blockedTask?: string;
        attemptedApproach?: string;
        workaroundSummary?: string;
      };
      if (!message) throw new Error('message is required');
      await doPost(stub, `${base}/capability-gap`, writeToken, {
        message,
        context,
        category,
        blockedTask,
        attemptedApproach,
        workaroundSummary,
      });
      return { content: [{ type: 'text', text: 'Capability gap recorded.' }] };
    }

    case 'record_workaround': {
      const { summary, limitation, workaround, impact, patchId } = args as {
        summary?: string;
        limitation?: string;
        workaround?: string;
        impact?: 'low' | 'medium' | 'high';
        patchId?: string;
      };
      if (!summary || !limitation || !workaround) {
        throw new Error('summary, limitation, and workaround are required');
      }
      await doPost(stub, `${base}/workaround`, writeToken, {
        summary,
        limitation,
        workaround,
        impact,
        patchId,
      });
      return { content: [{ type: 'text', text: 'Workaround recorded.' }] };
    }

    case 'list_patch_history': {
      const limit = Math.min(Number(args.limit ?? 20), 50);
      const offset = Number(args.offset ?? 0);
      const resp = await stub.fetch(new Request(`${base}/history?limit=${limit}&offset=${offset}`));
      if (!resp.ok) throw new Error(`History read failed: ${resp.status}`);
      const history = await resp.json() as { patches: Patch[]; total: number };
      return { content: [{ type: 'text', text: formatHistory(history) }] };
    }

    case 'list_branches': {
      const resp = await stub.fetch(new Request(`${base}/branches`));
      if (!resp.ok) throw new Error(`Branch list failed: ${resp.status}`);
      const body = await resp.json();
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    case 'create_branch': {
      const { name, fromRevision } = args as { name?: string; fromRevision?: number };
      if (!name) throw new Error('name is required');
      const resp = await doPost(stub, `${base}/branches`, writeToken, { name, fromRevision });
      const body = await resp.json();
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    case 'checkout_branch': {
      const { branchId } = args as { branchId?: string };
      if (!branchId) throw new Error('branchId is required');
      const resp = await doPost(stub, `${base}/branches/${encodeURIComponent(branchId)}/checkout`, writeToken, {});
      const body = await resp.json();
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    case 'replace_source': {
      const { source, summary, intent, approach } = args as {
        source?: string; summary?: string; intent?: string; approach?: string;
      };
      if (!source || !summary) throw new Error('source and summary are required');
      const resp = await doPost(stub, `${base}/patch`, writeToken, {
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
      const resp = await doPost(stub, `${base}/patch`, writeToken, {
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
      const resp = await doPost(stub, `${base}/patch`, writeToken, {
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
      const resp = await doPost(stub, `${base}/revert`, writeToken, { patchId, summary });
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
        return { content: [{ type: 'text', text: 'No run result yet. Open CadLad Studio and run the model.' }] };
      }
      if (!resp.ok) throw new Error(`Run-result fetch failed: ${resp.status}`);
      const data = await resp.json() as { runResult: RunResult | null; revision?: number };

      if (!data.runResult) {
        return { content: [{ type: 'text', text: 'No run result yet. Open CadLad Studio and run the model.' }] };
      }

      // Try DO memory first, then fall back to KV for post-eviction persistence
      const screenshot = data.runResult.screenshot ?? await loadScreenshot(env.KV, sessionId);

      if (screenshot) {
        const match = screenshot.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const [, mimeType, base64Data] = match;
          return {
            content: [
              { type: 'image', data: base64Data, mimeType },
              {
                type: 'text',
                text: `Render at revision ${data.revision ?? '?'}. Success: ${data.runResult.success}.${data.runResult.errors?.length ? `\nErrors: ${data.runResult.errors.join('; ')}` : ''}`,
              },
            ],
          };
        }
      }

      if (data.runResult.stats) {
        return { content: [{ type: 'text', text: `No screenshot yet. Stats:\n${formatStats(data.runResult.stats)}` }] };
      }

      return { content: [{ type: 'text', text: 'No screenshot available. Open CadLad Studio and run the model to generate one.' }] };
    }

    case 'get_model_stats':
    case 'get_stats': {
      const resp = await stub.fetch(new Request(`${base}/run-result`));
      if (resp.status === 404 || !resp.ok) {
        return { content: [{ type: 'text', text: 'No run result yet. Open CadLad Studio and run the model.' }] };
      }
      const data = await resp.json() as { runResult: RunResult | null; revision?: number };
      if (!data.runResult?.stats) {
        return { content: [{ type: 'text', text: 'No geometry stats available yet.' }] };
      }
      return { content: [{ type: 'text', text: formatStats(data.runResult.stats) }] };
    }

    case 'evaluate': {
      const resp = await stub.fetch(new Request(`${base}/run-result`));
      if (resp.status === 404 || !resp.ok) {
        return { content: [{ type: 'text', text: 'No run result yet. Open CadLad Studio and run the model.' }] };
      }
      const data = await resp.json() as { runResult: RunResult | null; revision?: number };
      if (!data.runResult) {
        return { content: [{ type: 'text', text: 'No run result yet. Open CadLad Studio and run the model.' }] };
      }
      const hasCodeArg = typeof args.code === 'string';
      const hasParamOverrides = Boolean(args.paramOverrides && typeof args.paramOverrides === 'object');
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            revision: data.revision,
            success: data.runResult.success,
            evaluation: data.runResult.evaluation ?? null,
            diagnostics: data.runResult.diagnostics ?? [],
            stats: data.runResult.stats ?? null,
            params: data.runResult.params ?? null,
            notes: [
              ...(hasCodeArg ? ['code argument was provided; remote evaluate currently returns the active session run only.'] : []),
              ...(hasParamOverrides ? ['paramOverrides were provided; remote evaluate currently returns the active session run only.'] : []),
            ],
          }, null, 2),
        }],
      };
    }

    case 'get_validation': {
      const resp = await stub.fetch(new Request(`${base}/run-result`));
      if (resp.status === 404 || !resp.ok) {
        return { content: [{ type: 'text', text: 'No run result yet. Open CadLad Studio and run the model.' }] };
      }
      const data = await resp.json() as { runResult: RunResult | null; revision?: number };
      if (!data.runResult) {
        return { content: [{ type: 'text', text: 'No run result yet. Open CadLad Studio and run the model.' }] };
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            revision: data.revision,
            success: data.runResult.success,
            evaluation: data.runResult.evaluation ?? null,
            diagnostics: data.runResult.diagnostics ?? [],
            errors: data.runResult.errors ?? [],
            warnings: data.runResult.warnings ?? [],
          }, null, 2),
        }],
      };
    }

    case 'compare': {
      const historyResp = await stub.fetch(new Request(`${base}/history?limit=200&offset=0`));
      if (!historyResp.ok) throw new Error(`History read failed: ${historyResp.status}`);
      const history = await historyResp.json() as { patches: Patch[] };
      const { revisionA, revisionB, codeA, codeB } = args as {
        revisionA?: number;
        revisionB?: number;
        codeA?: string;
        codeB?: string;
      };
      const patchFor = (revision: number | undefined, code: string | undefined): Patch | undefined => {
        if (typeof revision === 'number') return history.patches.find((patch) => patch.revision === revision);
        if (typeof code === 'string') return history.patches.find((patch) => patch.sourceAfter === code);
        return undefined;
      };
      const patchA = patchFor(revisionA, codeA);
      const patchB = patchFor(revisionB, codeB) ?? history.patches[history.patches.length - 1];
      if (!patchA || !patchB) {
        return { content: [{ type: 'text', text: 'Unable to resolve compare inputs. Provide revisionA/revisionB or previously used code snapshots.' }] };
      }
      const evalA = patchA.runResult?.evaluation;
      const evalB = patchB.runResult?.evaluation;
      const statsA = patchA.runResult?.stats;
      const statsB = patchB.runResult?.stats;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            revisions: { a: patchA.revision, b: patchB.revision },
            summary: {
              successA: patchA.runResult?.success ?? null,
              successB: patchB.runResult?.success ?? null,
              errorCountDelta: (evalB?.summary.errorCount ?? 0) - (evalA?.summary.errorCount ?? 0),
              warningCountDelta: (evalB?.summary.warningCount ?? 0) - (evalA?.summary.warningCount ?? 0),
            },
            statsDelta: compareStats(statsA, statsB),
            params: {
              a: patchA.paramsAfter,
              b: patchB.paramsAfter,
            },
            notes: (!evalA || !evalB) ? ['One or both revisions do not include evaluation bundles yet.'] : [],
          }, null, 2),
        }],
      };
    }

    case 'compare_branches': {
      const { branchA, branchB } = args as { branchA?: string; branchB?: string };
      if (!branchA || !branchB) throw new Error('branchA and branchB are required');
      const resp = await stub.fetch(new Request(`${base}/compare-branches?a=${encodeURIComponent(branchA)}&b=${encodeURIComponent(branchB)}`));
      if (!resp.ok) {
        const text = await resp.text().catch(() => String(resp.status));
        throw new Error(`Compare branches failed (${resp.status}): ${text}`);
      }
      const body = await resp.json();
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── DO helper ─────────────────────────────────────────────────────────────────

async function doPost(
  stub: DurableObjectStub,
  url: string,
  writeToken: string,
  body: unknown,
): Promise<Response> {
  const resp = await stub.fetch(new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${writeToken}` },
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
    `Revision: ${s.revision} (last successful: ${s.lastSuccessfulRevision})`,
    `Latest render: ${formatRenderStatus(s.latestRender)}`,
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

function compareStats(
  a: ModelStats | undefined,
  b: ModelStats | undefined,
): Record<string, number | null> {
  if (!a || !b) {
    return {
      triangles: null,
      bodies: null,
      volume: null,
      surfaceArea: null,
      componentCount: null,
    };
  }
  return {
    triangles: b.triangles - a.triangles,
    bodies: b.bodies - a.bodies,
    volume: (b.volume ?? 0) - (a.volume ?? 0),
    surfaceArea: (b.surfaceArea ?? 0) - (a.surfaceArea ?? 0),
    componentCount: (b.componentCount ?? 0) - (a.componentCount ?? 0),
  };
}

function formatRenderStatus(status: RenderStatus): string {
  const revision = status.revision !== undefined ? `rev ${status.revision}` : 'rev n/a';
  const screenshotRef = status.screenshotRef ? `, screenshotRef=${status.screenshotRef}` : '';
  return `${status.state} (${revision}${screenshotRef}) — ${status.message}`;
}

function patchAppliedMsg(patch: Patch): string {
  return [
    `Patch applied: revision ${patch.revision}`,
    `Summary: ${patch.summary}`,
    patch.intent ? `Intent: ${patch.intent}` : '',
    patch.approach ? `Approach: ${patch.approach}` : '',
    '',
    'The studio will rerender automatically. Call get_latest_screenshot after a moment to see the result.',
  ].filter(l => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
}

interface AnalysisIssue {
  id: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  evidence?: Record<string, unknown>;
}

function analyzePrintability(stats: ModelStats, rawArgs: Record<string, unknown>) {
  const minWallThickness = asNumber(rawArgs.minWallThickness, 1.2);
  const maxOverhangRatio = asNumber(rawArgs.maxOverhangRatio, 1.0);
  const minBedAdhesionRatio = asNumber(rawArgs.minBedAdhesionRatio, 0.15);
  const issues: AnalysisIssue[] = [];
  const bb = stats.boundingBox;
  const extX = bb.max[0] - bb.min[0];
  const extY = bb.max[1] - bb.min[1];
  const extZ = bb.max[2] - bb.min[2];
  const minDim = Math.min(extX, extY, extZ);
  if (minDim < minWallThickness) {
    issues.push({
      id: 'thin-feature',
      severity: 'warning',
      message: `Smallest overall model dimension (${minDim.toFixed(2)}) is below minWallThickness (${minWallThickness.toFixed(2)}).`,
      evidence: { minDim, minWallThickness },
    });
  }
  const overhangRatio = extZ > 0 ? Math.max(extX, extY) / extZ : Number.POSITIVE_INFINITY;
  if (overhangRatio > maxOverhangRatio) {
    issues.push({
      id: 'overhang-risk',
      severity: 'warning',
      message: `Horizontal span to height ratio (${overhangRatio.toFixed(2)}) exceeds threshold (${maxOverhangRatio.toFixed(2)}); supports may be required.`,
      evidence: { overhangRatio, maxOverhangRatio },
    });
  }
  const bedContactArea = extX * extY;
  const totalArea = stats.surfaceArea ?? 0;
  const adhesionRatio = totalArea > 0 ? bedContactArea / totalArea : 0;
  if (adhesionRatio < minBedAdhesionRatio) {
    issues.push({
      id: 'bed-adhesion-risk',
      severity: 'warning',
      message: `Estimated bed-adhesion ratio (${adhesionRatio.toFixed(3)}) is below threshold (${minBedAdhesionRatio.toFixed(3)}).`,
      evidence: { adhesionRatio, minBedAdhesionRatio, bedContactArea, totalArea },
    });
  }
  if ((stats.componentCount ?? 1) > 1 || stats.checks?.disconnectedComponents) {
    issues.push({
      id: 'disconnected-components',
      severity: 'error',
      message: 'Model has disconnected components; print may fail or produce loose bodies without explicit assembly intent.',
      evidence: { componentCount: stats.componentCount ?? null },
    });
  }
  return {
    kind: 'printability',
    pass: issues.every(issue => issue.severity !== 'error'),
    thresholds: { minWallThickness, maxOverhangRatio, minBedAdhesionRatio },
    metrics: { extents: { x: extX, y: extY, z: extZ }, overhangRatio, adhesionRatio },
    issues,
  };
}

function analyzeMoldability(stats: ModelStats, rawArgs: Record<string, unknown>) {
  const minDraftDeg = asNumber(rawArgs.minDraftDeg, 2);
  const maxThicknessVarianceRatio = asNumber(rawArgs.maxThicknessVarianceRatio, 0.35);
  const issues: AnalysisIssue[] = [];
  const bb = stats.boundingBox;
  const extX = bb.max[0] - bb.min[0];
  const extY = bb.max[1] - bb.min[1];
  const extZ = bb.max[2] - bb.min[2];
  const sideArea = 2 * ((extX * extZ) + (extY * extZ));
  const totalArea = stats.surfaceArea ?? 0;
  const sideAreaRatio = totalArea > 0 ? sideArea / totalArea : 0;
  const inferredDraftDeg = Math.max(0, (1 - Math.min(1, sideAreaRatio)) * 6);
  if (inferredDraftDeg < minDraftDeg) {
    issues.push({
      id: 'low-draft-risk',
      severity: 'warning',
      message: `Inferred draft proxy (${inferredDraftDeg.toFixed(2)}°) is below minimum target (${minDraftDeg.toFixed(2)}°).`,
      evidence: { inferredDraftDeg, minDraftDeg, sideAreaRatio },
    });
  }
  const thicknessProxy = stats.volume && totalArea ? (2 * stats.volume) / totalArea : 0;
  const dims = [extX, extY, extZ].filter(n => Number.isFinite(n) && n > 0);
  const thicknessSpread = dims.length > 0 ? (Math.max(...dims) - Math.min(...dims)) / Math.max(...dims) : 0;
  if (thicknessSpread > maxThicknessVarianceRatio) {
    issues.push({
      id: 'wall-uniformity-risk',
      severity: 'warning',
      message: `Wall-thickness variance proxy (${thicknessSpread.toFixed(3)}) exceeds threshold (${maxThicknessVarianceRatio.toFixed(3)}).`,
      evidence: { thicknessSpread, maxThicknessVarianceRatio, thicknessProxy },
    });
  }
  if ((stats.componentCount ?? 1) > 1) {
    issues.push({
      id: 'multi-component-risk',
      severity: 'warning',
      message: 'Model has multiple disconnected components; mold split strategy may be required.',
      evidence: { componentCount: stats.componentCount ?? null },
    });
  }
  if (stats.triangles > 150_000) {
    issues.push({
      id: 'complexity-risk',
      severity: 'info',
      message: 'High triangle count suggests geometric complexity that may introduce tooling and polishing challenges.',
      evidence: { triangles: stats.triangles },
    });
  }
  return {
    kind: 'moldability',
    pass: issues.every(issue => issue.severity !== 'error'),
    thresholds: { minDraftDeg, maxThicknessVarianceRatio },
    metrics: { inferredDraftDeg, thicknessProxy, thicknessSpread },
    issues,
  };
}

function buildImprovementSuggestions(
  stats: ModelStats,
  diagnostics: Array<{ severity?: string; message?: string }>,
  rawArgs: Record<string, unknown>,
) {
  const includeChecks = Array.isArray(rawArgs.includeChecks)
    ? rawArgs.includeChecks.filter((value): value is 'printability' | 'moldability' => value === 'printability' || value === 'moldability')
    : ['printability', 'moldability'];

  const suggestions: Array<{
    id: string;
    source: 'printability' | 'moldability' | 'validation';
    severity: 'info' | 'warning' | 'error';
    message: string;
    autoFixable: boolean;
  }> = [];

  if (includeChecks.includes('printability')) {
    for (const issue of analyzePrintability(stats, rawArgs).issues) {
      suggestions.push({
        id: `printability:${issue.id}`,
        source: 'printability',
        severity: issue.severity,
        message: issue.message,
        autoFixable: issue.id === 'thin-feature' || issue.id === 'bed-adhesion-risk',
      });
    }
  }
  if (includeChecks.includes('moldability')) {
    for (const issue of analyzeMoldability(stats, rawArgs).issues) {
      suggestions.push({
        id: `moldability:${issue.id}`,
        source: 'moldability',
        severity: issue.severity,
        message: issue.message,
        autoFixable: issue.id === 'low-draft-risk' || issue.id === 'wall-uniformity-risk',
      });
    }
  }
  for (const diag of diagnostics) {
    if (diag.severity === 'error' || diag.severity === 'warning') {
      suggestions.push({
        id: `validation:${slugify(diag.message ?? 'diagnostic')}`,
        source: 'validation',
        severity: diag.severity,
        message: diag.message ?? 'Validation diagnostic',
        autoFixable: false,
      });
    }
  }

  const deduped = dedupeSuggestions(suggestions);
  return {
    kind: 'suggest_improvements',
    total: deduped.length,
    bySeverity: {
      error: deduped.filter(item => item.severity === 'error').length,
      warning: deduped.filter(item => item.severity === 'warning').length,
      info: deduped.filter(item => item.severity === 'info').length,
    },
    suggestions: deduped,
  };
}

function dedupeSuggestions<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'item';
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
