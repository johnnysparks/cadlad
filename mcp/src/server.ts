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
import { SessionClient, clientFromUrl, ApiError } from "./session-client.js";

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
      "Read the current CadLad session: source code, parameter values, revision number, and last-successful revision. Always call this first to understand what you're working with.",
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
      "Get the most recent render screenshot posted by the connected CadLad Studio. Returns a PNG image if the studio is open and has rendered the model. Falls back to model stats text if no screenshot is available.",
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
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
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
        const session = await client.getSession();
        return {
          content: [
            {
              type: "text" as const,
              text: formatSession(session),
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
        if (!data.runResult) {
          return {
            content: [
              {
                type: "text" as const,
                text: data.message ?? "No screenshot available. Open CadLad Studio with the session URL and run the model to generate one.",
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
                  text: `Revision ${data.revision} render. Run succeeded: ${data.runResult.success}.${data.runResult.errors.length ? `\nErrors: ${data.runResult.errors.join("; ")}` : ""}`,
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
                text: `No screenshot in latest run result (studio may be headless). Stats:\n${formatStats(data.runResult.stats)}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Run result exists (revision ${data.revision}) but no screenshot or stats. Run succeeded: ${data.runResult.success}.`,
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

function formatSession(session: Awaited<ReturnType<SessionClient["getSession"]>>): string {
  const lines = [
    `Session: ${session.id}`,
    `Revision: ${session.revision} (last successful: ${session.lastSuccessfulRevision})`,
    `Params: ${Object.keys(session.params).length > 0 ? JSON.stringify(session.params) : "none"}`,
    `Patches: ${session.patches.length}`,
    `Updated: ${new Date(session.updatedAt).toISOString()}`,
    "",
    "=== Source ===",
    session.source,
  ];
  return lines.join("\n");
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

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("CadLad MCP server running (stdio)");
