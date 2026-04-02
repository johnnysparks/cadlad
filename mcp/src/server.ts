#!/usr/bin/env node
/**
 * CadLad MCP Server — assistant bridge for live vibe-modeling sessions.
 *
 * Exposes live-session read/write as MCP tools so any MCP-capable assistant
 * (Claude, GPT-4o, etc.) can directly inspect and edit a shared CadLad model.
 *
 * Usage (stdio transport — standard for Claude Desktop / Claude Code MCP):
 *   CADLAD_SESSION_URL="https://cadlad.studio?session=<id>&token=<tok>" \
 *   CADLAD_API_BASE="https://sessions.cadlad.workers.dev" \
 *   node dist/server.js
 *
 * Or via the capability URL inline:
 *   cadlad-mcp --session "https://cadlad.studio?session=<id>&token=<tok>"
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SessionClient, clientFromUrl, ApiError, type RunResultEnvelope } from "./session-client.js";

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const sessionUrl =
  process.argv.find((a) => a.startsWith("--session="))?.slice("--session=".length) ??
  process.env.CADLAD_SESSION_URL;

if (!sessionUrl) {
  console.error(
    "CadLad MCP: provide session URL via --session=<url> or CADLAD_SESSION_URL env var",
  );
  process.exit(1);
}

const apiBase = process.env.CADLAD_API_BASE;
let client: SessionClient;
try {
  client = clientFromUrl(sessionUrl, apiBase);
} catch (e) {
  console.error("CadLad MCP: failed to parse session URL:", (e as Error).message);
  process.exit(1);
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "get_session_state",
    description:
      "Read the current CadLad session: source code, parameter values, revision number, last-successful revision, and latest render/screenshot status (including artifact reference when available). Always call this first to understand what you're working with.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "list_patch_history",
    description:
      "List the patch history for this session. Each entry shows what changed, who changed it, the intent, and whether the run succeeded. Useful for understanding prior work before making changes.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "Max patches to return (default 20, max 50)",
        },
        offset: {
          type: "number",
          description: "Skip first N patches for pagination",
        },
      },
      required: [],
    },
  },
  {
    name: "replace_source",
    description:
      "Replace the entire model source with new .forge.js code. This is the primary way to make geometry changes. Always include a clear summary, intent (why), and approach (how). The studio will rerender automatically after this call.",
    inputSchema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          description: "Complete new .forge.js model source code",
        },
        summary: {
          type: "string",
          description: "One-line description of what changed (shown in patch history)",
        },
        intent: {
          type: "string",
          description: "Why this change was made — the goal or problem being solved",
        },
        approach: {
          type: "string",
          description: "Technical approach — what modeling strategy was used",
        },
      },
      required: ["source", "summary"],
    },
  },
  {
    name: "apply_patch",
    description:
      "Apply a direct patch in one call. Use this when you need to change source, params, or both atomically. Supports patch.type = 'source_replace' or 'param_update'.",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["source_replace", "param_update"],
          description: "Patch type: source_replace for full code update, param_update for param changes",
        },
        source: {
          type: "string",
          description: "Required when type=source_replace: complete new .forge.js source",
        },
        params: {
          type: "object",
          description: "Required when type=param_update: map of param name → new numeric value",
          additionalProperties: { type: "number" },
        },
        summary: {
          type: "string",
          description: "One-line description shown in patch history",
        },
        intent: {
          type: "string",
          description: "Why this patch is being applied",
        },
        approach: {
          type: "string",
          description: "How the patch was implemented",
        },
      },
      required: ["type", "summary"],
    },
  },
  {
    name: "update_params",
    description:
      "Change one or more param() values without touching the source code. Use this to explore the parameter space (e.g., try different wall thicknesses) without rewriting the model.",
    inputSchema: {
      type: "object" as const,
      properties: {
        params: {
          type: "object",
          description: "Map of param name → new numeric value",
          additionalProperties: { type: "number" },
        },
        summary: {
          type: "string",
          description: "One-line description (e.g., 'Increase wall thickness to 3mm')",
        },
        intent: {
          type: "string",
          description: "Why this param change was made",
        },
      },
      required: ["params", "summary"],
    },
  },
  {
    name: "revert_patch",
    description:
      "Undo a specific patch by its ID. Creates a new patch that restores state to just before the target patch — history is never rewritten. Use this when a change caused errors or an undesired result.",
    inputSchema: {
      type: "object" as const,
      properties: {
        patchId: {
          type: "string",
          description: "ID of the patch to revert (from list_patch_history)",
        },
        summary: {
          type: "string",
          description: "Optional description for the revert patch",
        },
      },
      required: ["patchId"],
    },
  },
  {
    name: "get_latest_screenshot",
    description:
      "Get the most recent render screenshot posted by the connected CadLad Studio. Distinguishes between no render yet, pending render, failed render, and policy/tooling blocked screenshot. Returns a PNG image when available.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_model_stats",
    description:
      "Get geometry statistics from the last run: triangle count, body count, and bounding box. Useful for validation without needing a screenshot (e.g., check if a part is within size constraints).",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_part_stats",
    description:
      "Get named-part stats from the last run. Optionally pass partName for a single part.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object" as const,
      properties: {
        partName: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "query_part_relationship",
    description:
      "Query pairwise relationship between two part names: intersects and minimum distance.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object" as const,
      properties: {
        partA: { type: "string" },
        partB: { type: "string" },
      },
      required: ["partA", "partB"],
    },
  },
] as const;

// ── Server setup ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: "cadlad-live-session", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case "get_session_state": {
        const [session, run] = await Promise.all([client.getSession(), client.getRunResult()]);
        return {
          content: [
            {
              type: "text" as const,
              text: formatSession(session, run),
            },
          ],
        };
      }

      case "list_patch_history": {
        const limit = Math.min(Number((args as any).limit ?? 20), 50);
        const offset = Number((args as any).offset ?? 0);
        const history = await client.getHistory({ limit, offset });
        return {
          content: [
            {
              type: "text" as const,
              text: formatHistory(history),
            },
          ],
        };
      }

      case "replace_source": {
        const { source, summary, intent, approach } = args as {
          source: string;
          summary: string;
          intent?: string;
          approach?: string;
        };
        if (!source || !summary) {
          return errorContent("source and summary are required");
        }
        const result = await client.applyPatch({
          type: "source_replace",
          source,
          summary,
          intent,
          approach,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Patch applied: revision ${result.patch.revision}\n\nSummary: ${result.patch.summary}${result.patch.intent ? `\nIntent: ${result.patch.intent}` : ""}${result.patch.approach ? `\nApproach: ${result.patch.approach}` : ""}\n\nThe studio will rerender automatically. Call get_latest_screenshot after a moment to see the result.`,
            },
          ],
        };
      }

      case "apply_patch": {
        const { type, source, params, summary, intent, approach } = args as {
          type: "source_replace" | "param_update";
          source?: string;
          params?: Record<string, number>;
          summary: string;
          intent?: string;
          approach?: string;
        };
        if (!type || !summary) {
          return errorContent("type and summary are required");
        }
        if (type === "source_replace" && !source) {
          return errorContent("source is required when type=source_replace");
        }
        if (type === "param_update" && (!params || Object.keys(params).length === 0)) {
          return errorContent("params is required when type=param_update");
        }
        const result = await client.applyPatch({
          type,
          source,
          params,
          summary,
          intent,
          approach,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Patch applied: revision ${result.patch.revision}\nType: ${type}\nSummary: ${result.patch.summary}`,
            },
          ],
        };
      }

      case "update_params": {
        const { params, summary, intent } = args as {
          params: Record<string, number>;
          summary: string;
          intent?: string;
        };
        if (!params || !summary) {
          return errorContent("params and summary are required");
        }
        const result = await client.applyPatch({
          type: "param_update",
          params,
          summary,
          intent,
        });
        const changedList = Object.entries(params)
          .map(([k, v]) => `  ${k} → ${v}`)
          .join("\n");
        return {
          content: [
            {
              type: "text" as const,
              text: `Param update applied: revision ${result.patch.revision}\n\nChanged:\n${changedList}\n\nThe studio will rerender automatically.`,
            },
          ],
        };
      }

      case "revert_patch": {
        const { patchId, summary } = args as { patchId: string; summary?: string };
        if (!patchId) return errorContent("patchId is required");
        const result = await client.revertPatch({ patchId, summary });
        return {
          content: [
            {
              type: "text" as const,
              text: `Revert applied: revision ${result.patch.revision}\nReverted patch: ${patchId}\nSummary: ${result.patch.summary}`,
            },
          ],
        };
      }

      case "get_latest_screenshot": {
        const data = await client.getRunResult();
        const renderState = deriveRenderState(data);
        if (!data.runResult) {
          return {
            content: [
              {
                type: "text" as const,
                text: formatRenderStateSummary(renderState, data),
              },
            ],
          };
        }

        if (data.runResult.screenshot) {
          // Extract base64 from data URL: "data:image/png;base64,<data>"
          const match = data.runResult.screenshot.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            const [, mimeType, base64Data] = match;
            return {
              content: [
                {
                  type: "image" as const,
                  data: base64Data,
                  mimeType,
                },
                {
                  type: "text" as const,
                  text: `${formatRenderStateSummary(renderState, data)}\nRun succeeded: ${data.runResult.success}.${data.runResult.errors.length ? `\nErrors: ${data.runResult.errors.join("; ")}` : ""}`,
                },
              ],
            };
          }
        }

        // No screenshot but we have stats
        if (data.runResult.stats) {
          return {
            content: [
              {
                type: "text" as const,
                text: `${formatRenderStateSummary(renderState, data)}\nNo screenshot payload in latest run result. Stats:\n${formatStats(data.runResult.stats)}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `${formatRenderStateSummary(renderState, data)}\nRun result exists but no screenshot or stats. Run succeeded: ${data.runResult.success}.`,
            },
          ],
        };
      }

      case "get_model_stats": {
        const data = await client.getRunResult();
        if (!data.runResult) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No run result yet. Open CadLad Studio and run the model.",
              },
            ],
          };
        }
        if (!data.runResult.stats) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Run result available (revision ${data.revision}) but no geometry stats. Studio may not be posting stats yet.`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: formatStats(data.runResult.stats),
            },
          ],
        };
      }

      case "get_part_stats": {
        const data = await client.getRunResult();
        const stats = data.runResult?.stats;
        if (!stats?.parts || stats.parts.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No named part stats available yet.",
              },
            ],
          };
        }

        const partName = (args as { partName?: string }).partName;
        if (partName) {
          const part = stats.parts.find((p) => p.name === partName);
          if (!part) {
            return {
              content: [{ type: "text" as const, text: `Part not found: ${partName}. Available parts: ${stats.parts.map((p) => p.name).join(", ")}` }],
            };
          }
          return { content: [{ type: "text" as const, text: formatPartStats(part) }] };
        }

        return {
          content: [{ type: "text" as const, text: stats.parts.map(formatPartStats).join("\n\n") }],
        };
      }

      case "query_part_relationship": {
        const { partA, partB } = args as { partA?: string; partB?: string };
        if (!partA || !partB) {
          return errorContent("partA and partB are required");
        }

        const data = await client.getRunResult();
        const stats = data.runResult?.stats;
        if (!stats?.parts || stats.parts.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No named part stats available yet.",
              },
            ],
          };
        }

        const pair = stats.pairwise?.find((r) =>
          (r.partA === partA && r.partB === partB) || (r.partA === partB && r.partB === partA),
        );
        if (!pair) {
          return {
            content: [{ type: "text" as const, text: `No relationship data available for ${partA} ↔ ${partB}.` }],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `Part A: ${partA}`,
                `Part B: ${partB}`,
                `Intersects: ${pair.intersects ? "yes" : "no"}`,
                `Minimum distance: ${pair.minDistance.toFixed(3)} units`,
              ].join("\n"),
            },
          ],
        };
      }

      default:
        return errorContent(`Unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof ApiError) {
      return errorContent(`Session API error (HTTP ${err.status}): ${err.body}`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return errorContent(`Error: ${msg}`);
  }
});

// ── Formatters ────────────────────────────────────────────────────────────────

function formatSession(
  session: Awaited<ReturnType<SessionClient["getSession"]>>,
  run: RunResultEnvelope,
): string {
  const renderState = deriveRenderState(run);
  const lines = [
    `Session: ${session.id}`,
    `Revision: ${session.revision} (last successful: ${session.lastSuccessfulRevision})`,
    `Params: ${Object.keys(session.params).length > 0 ? JSON.stringify(session.params) : "none"}`,
    `Patches: ${session.patches.length}`,
    `Updated: ${new Date(session.updatedAt).toISOString()}`,
    `Latest render: ${renderState}`,
    `Latest screenshot ref: ${run.artifactRef ?? "none"}`,
    run.runResult?.timestamp ? `Latest render timestamp: ${new Date(run.runResult.timestamp).toISOString()}` : "",
    "",
    "=== Source ===",
    session.source,
  ];
  return lines.join("\n");
}

function deriveRenderState(run: RunResultEnvelope): "ready" | "no_render" | "pending" | "failed" | "blocked" | "unknown" {
  const rawStatus = String(run.status ?? "").toLowerCase();
  const message = (run.message ?? "").toLowerCase();

  if (run.runResult?.screenshot || run.hasImage === true || rawStatus === "ready") return "ready";
  if (!run.runResult && (rawStatus === "no_render" || message.includes("no run result posted yet"))) return "no_render";
  if (rawStatus === "pending" || message.includes("pending")) return "pending";
  if (rawStatus === "failed" || (!run.runResult?.success && !!run.runResult)) return "failed";
  if (
    rawStatus === "blocked" ||
    message.includes("blocked") ||
    message.includes("policy") ||
    message.includes("safety")
  ) {
    return "blocked";
  }

  return run.runResult ? "unknown" : "no_render";
}

function formatRenderStateSummary(state: ReturnType<typeof deriveRenderState>, run: RunResultEnvelope): string {
  const revision = run.revision !== undefined ? `revision ${run.revision}` : "unknown revision";
  const artifact = run.artifactRef ? `artifactRef: ${run.artifactRef}` : "artifactRef: none";
  const base = `Render status: ${state} (${revision}; ${artifact})`;
  if (!run.message) return base;
  return `${base}\nDetail: ${run.message}`;
}

function formatHistory(history: Awaited<ReturnType<SessionClient["getHistory"]>>): string {
  if (history.patches.length === 0) return "No patches yet.";

  const lines = [`Showing ${history.patches.length} of ${history.total} patches`, ""];
  for (const p of history.patches) {
    const status = p.runResult
      ? p.runResult.success
        ? "✓"
        : `✗ (${p.runResult.errors.slice(0, 1).join("; ")})`
      : "?";
    lines.push(`[${p.revision}] ${status} ${p.type} — ${p.summary}`);
    lines.push(`  id: ${p.id}  at: ${new Date(p.createdAt).toISOString()}`);
    if (p.intent) lines.push(`  intent: ${p.intent}`);
    if (p.approach) lines.push(`  approach: ${p.approach}`);
    if (p.revertOf) lines.push(`  reverts: ${p.revertOf}`);
  }
  return lines.join("\n");
}

function formatStats(stats: NonNullable<import("./session-client.js").RunResult["stats"]>): string {
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
    `  min: [${bb.min.map((v) => v.toFixed(2)).join(", ")}]`,
    `  max: [${bb.max.map((v) => v.toFixed(2)).join(", ")}]`,
    stats.volume !== undefined ? `Volume: ${stats.volume.toFixed(2)} units³` : "",
    stats.surfaceArea !== undefined ? `Surface area: ${stats.surfaceArea.toFixed(2)} units²` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatPartStats(part: NonNullable<import("./session-client.js").ModelStats["parts"]>[number]): string {
  const bb = part.boundingBox;
  return [
    `Part: ${part.name} (#${part.index})`,
    `Triangles: ${part.triangles.toLocaleString()}`,
    `Extents: X=${part.extents.x.toFixed(2)}  Y=${part.extents.y.toFixed(2)}  Z=${part.extents.z.toFixed(2)}`,
    `Bounding box min: [${bb.min.map((v) => v.toFixed(2)).join(", ")}]`,
    `Bounding box max: [${bb.max.map((v) => v.toFixed(2)).join(", ")}]`,
    `Volume: ${part.volume.toFixed(2)} units³`,
    `Surface area: ${part.surfaceArea.toFixed(2)} units²`,
  ].join("\n");
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("CadLad MCP server running (stdio)");
