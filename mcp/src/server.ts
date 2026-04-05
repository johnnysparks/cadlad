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
import { SessionClient, clientFromUrl, ApiError, type RunResultEnvelope, type RenderStatus } from "./session-client.js";

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
    name: "evaluate",
    description:
      "Return the latest full machine-readable evaluation bundle for the active model (diagnostics, stage summaries, tests, stats). Optional code/paramOverrides are accepted for API compatibility but currently only the active studio run can be evaluated.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object" as const,
      properties: {
        code: { type: "string", description: "Optional model source to evaluate (currently informational)." },
        paramOverrides: { type: "object", additionalProperties: { type: "number" } },
      },
      required: [],
    },
  },
  {
    name: "get_stats",
    description:
      "Get structured geometry stats for the current model: bbox, volume, area, component counts, parts, and pairwise relationships.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_validation",
    description:
      "Get all validation diagnostics and stage pass/fail summaries for the current model evaluation.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "compare",
    description:
      "Compare two model states using latest evaluation data (stats, validation summary, params). If codeA/codeB are provided they must match session source snapshots already evaluated in this session.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object" as const,
      properties: {
        codeA: { type: "string" },
        codeB: { type: "string" },
        revisionA: { type: "number" },
        revisionB: { type: "number" },
      },
      required: [],
    },
  },
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
    name: "check_printability",
    description:
      "Analyze the latest model for FDM printability risks (thin walls, overhangs, disconnected regions, and bed adhesion footprint) using available geometry stats.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object" as const,
      properties: {
        minWallThickness: { type: "number", description: "Minimum acceptable wall/feature thickness in model units (default 1.2)." },
        maxOverhangRatio: { type: "number", description: "Max horizontal/vertical ratio before flagging overhang risk (default 1.0)." },
        minBedAdhesionRatio: { type: "number", description: "Minimum contact area ratio vs XY footprint (default 0.15)." },
      },
      required: [],
    },
  },
  {
    name: "check_moldability",
    description:
      "Analyze the latest model for injection molding risks (draft, undercuts/part complexity proxy, and wall-thickness uniformity proxy).",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object" as const,
      properties: {
        minDraftDeg: { type: "number", description: "Target minimum draft angle (default 2°)." },
        maxThicknessVarianceRatio: { type: "number", description: "Allowed wall-thickness proxy variance ratio (default 0.35)." },
      },
      required: [],
    },
  },
  {
    name: "suggest_improvements",
    description:
      "Return actionable modeling suggestions based on latest stats/validation, including severity and whether each item is auto-fixable by parameter edits.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object" as const,
      properties: {
        includeChecks: {
          type: "array",
          items: { type: "string", enum: ["printability", "moldability"] },
          description: "Optional subset of suggestion analyzers to include (default: both).",
        },
      },
      required: [],
    },
  },
  {
    name: "report_capability_gap",
    description:
      "Record a structured agent capability gap (missing primitive/API/validation gap) so recurring friction can be aggregated and prioritized.",
    inputSchema: {
      type: "object" as const,
      properties: {
        message: { type: "string" },
        context: { type: "string" },
        category: { type: "string", enum: ["missing-primitive", "api-limitation", "validation-gap", "other"] },
        blockedTask: { type: "string" },
        attemptedApproach: { type: "string" },
        workaroundSummary: { type: "string" },
      },
      required: ["message"],
    },
  },
  {
    name: "record_workaround",
    description:
      "Record a workaround hack the agent used (limitation + workaround steps + impact) for self-improvement telemetry.",
    inputSchema: {
      type: "object" as const,
      properties: {
        summary: { type: "string" },
        limitation: { type: "string" },
        workaround: { type: "string" },
        impact: { type: "string", enum: ["low", "medium", "high"] },
        patchId: { type: "string" },
      },
      required: ["summary", "limitation", "workaround"],
    },
  },
  {
    name: "suggest_api_improvements",
    description:
      "Analyze recorded capability gaps/workarounds and propose recurring API additions that are ready for promotion.",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object" as const,
      properties: {
        threshold: { type: "number", description: "Minimum recurrence count to mark promotion-ready (default 2)." },
        limit: { type: "number", description: "Recent telemetry event sample size to analyze (default 500, max 2000)." },
      },
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

      case "evaluate": {
        const data = await client.getRunResult();
        if (!data.runResult) {
          return errorContent("No run result yet. Open CadLad Studio and run the model first.");
        }
        const { code, paramOverrides } = args as { code?: string; paramOverrides?: Record<string, number> };
        const notes: string[] = [];
        if (code !== undefined) notes.push("code argument received; evaluating arbitrary code is not yet supported in remote sessions.");
        if (paramOverrides !== undefined) notes.push("paramOverrides received; remote evaluate currently reports latest active run only.");
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                revision: data.revision,
                success: data.runResult.success,
                evaluation: data.runResult.evaluation ?? null,
                diagnostics: data.runResult.diagnostics ?? [],
                stats: data.runResult.stats ?? null,
                params: data.runResult.params ?? null,
                notes,
              }, null, 2),
            },
          ],
        };
      }

      case "get_stats":
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

      case "get_validation": {
        const data = await client.getRunResult();
        if (!data.runResult) {
          return errorContent("No run result yet. Open CadLad Studio and run the model.");
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                revision: data.revision,
                success: data.runResult.success,
                evaluation: data.runResult.evaluation ?? null,
                diagnostics: data.runResult.diagnostics ?? [],
                errors: data.runResult.errors ?? [],
                warnings: data.runResult.warnings ?? [],
              }, null, 2),
            },
          ],
        };
      }

      case "compare": {
        const { revisionA, revisionB, codeA, codeB } = args as {
          revisionA?: number;
          revisionB?: number;
          codeA?: string;
          codeB?: string;
        };
        const session = await client.getSession();
        const patchFor = (revision: number | undefined, code: string | undefined) => {
          if (typeof revision === "number") {
            return session.patches.find((patch) => patch.revision === revision);
          }
          if (typeof code === "string") {
            return session.patches.find((patch) => patch.sourceAfter === code);
          }
          return undefined;
        };
        const patchA = patchFor(revisionA, codeA);
        const patchB = patchFor(revisionB, codeB) ?? session.patches[session.patches.length - 1];
        if (!patchA || !patchB) {
          return errorContent("Unable to resolve compare inputs. Provide revisionA/revisionB or previously used code snapshots.");
        }
        const evalA = patchA.runResult?.evaluation;
        const evalB = patchB.runResult?.evaluation;
        const statsA = patchA.runResult?.stats;
        const statsB = patchB.runResult?.stats;
        const compareResult = {
          revisions: { a: patchA.revision, b: patchB.revision },
          summary: {
            successA: patchA.runResult?.success ?? null,
            successB: patchB.runResult?.success ?? null,
            errorCountDelta: (evalB?.summary.errorCount ?? 0) - (evalA?.summary.errorCount ?? 0),
            warningCountDelta: (evalB?.summary.warningCount ?? 0) - (evalA?.summary.warningCount ?? 0),
          },
          statsDelta: buildStatsDelta(statsA, statsB),
          params: {
            a: patchA.paramsAfter,
            b: patchB.paramsAfter,
          },
          notes: (!evalA || !evalB)
            ? ["One or both revisions do not have posted evaluation bundles yet."]
            : [],
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(compareResult, null, 2) }] };
      }

      case "check_printability": {
        const data = await client.getRunResult();
        if (!data.runResult?.stats) {
          return errorContent("No geometry stats available yet. Open CadLad Studio and run the model first.");
        }
        const report = analyzePrintability(data.runResult.stats, args as Record<string, unknown>);
        return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }] };
      }

      case "check_moldability": {
        const data = await client.getRunResult();
        if (!data.runResult?.stats) {
          return errorContent("No geometry stats available yet. Open CadLad Studio and run the model first.");
        }
        const report = analyzeMoldability(data.runResult.stats, args as Record<string, unknown>);
        return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }] };
      }

      case "suggest_improvements": {
        const data = await client.getRunResult();
        if (!data.runResult?.stats) {
          return errorContent("No geometry stats available yet. Open CadLad Studio and run the model first.");
        }
        const report = buildImprovementSuggestions(
          data.runResult.stats,
          data.runResult.diagnostics ?? [],
          args as Record<string, unknown>,
        );
        return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }] };
      }

      case "report_capability_gap": {
        const { message, context, category, blockedTask, attemptedApproach, workaroundSummary } = args as {
          message?: string;
          context?: string;
          category?: "missing-primitive" | "api-limitation" | "validation-gap" | "other";
          blockedTask?: string;
          attemptedApproach?: string;
          workaroundSummary?: string;
        };
        if (!message) return errorContent("message is required");
        await client.reportCapabilityGap({
          message,
          context,
          category,
          blockedTask,
          attemptedApproach,
          workaroundSummary,
        });
        return { content: [{ type: "text" as const, text: "Capability gap recorded." }] };
      }

      case "record_workaround": {
        const { summary, limitation, workaround, impact, patchId } = args as {
          summary?: string;
          limitation?: string;
          workaround?: string;
          impact?: "low" | "medium" | "high";
          patchId?: string;
        };
        if (!summary || !limitation || !workaround) {
          return errorContent("summary, limitation, and workaround are required");
        }
        await client.recordWorkaround({
          summary,
          limitation,
          workaround,
          impact,
          patchId,
        });
        return { content: [{ type: "text" as const, text: "Workaround recorded." }] };
      }

      case "suggest_api_improvements": {
        const threshold = Math.max(1, Math.floor(Number((args as { threshold?: number }).threshold ?? 2)));
        const limit = Math.min(2000, Math.max(10, Math.floor(Number((args as { limit?: number }).limit ?? 500))));
        const report = await client.suggestApiImprovements({ threshold, limit });
        return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }] };
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
    `Revision: ${session.revision} (last successful: ${session.lastSuccessfulRevision})`,
    `Latest render: ${formatRenderStatus(session.latestRender)}`,
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

function formatRenderStatus(status: RenderStatus): string {
  const revision = status.revision !== undefined ? `rev ${status.revision}` : "rev n/a";
  const screenshotRef = status.screenshotRef ? `, screenshotRef=${status.screenshotRef}` : "";
  return `${status.state} (${revision}${screenshotRef}) — ${status.message}`;
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

function buildStatsDelta(
  a: NonNullable<import("./session-client.js").RunResult["stats"]> | undefined,
  b: NonNullable<import("./session-client.js").RunResult["stats"]> | undefined,
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

interface AnalysisIssue {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  evidence?: Record<string, unknown>;
}

function analyzePrintability(
  stats: NonNullable<import("./session-client.js").RunResult["stats"]>,
  rawArgs: Record<string, unknown>,
) {
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
      id: "thin-feature",
      severity: "warning",
      message: `Smallest overall model dimension (${minDim.toFixed(2)}) is below minWallThickness (${minWallThickness.toFixed(2)}).`,
      evidence: { minDim, minWallThickness },
    });
  }
  const overhangRatio = extZ > 0 ? Math.max(extX, extY) / extZ : Number.POSITIVE_INFINITY;
  if (overhangRatio > maxOverhangRatio) {
    issues.push({
      id: "overhang-risk",
      severity: "warning",
      message: `Horizontal span to height ratio (${overhangRatio.toFixed(2)}) exceeds threshold (${maxOverhangRatio.toFixed(2)}); supports may be required.`,
      evidence: { overhangRatio, maxOverhangRatio },
    });
  }
  const bedContactArea = extX * extY;
  const totalArea = stats.surfaceArea ?? 0;
  const adhesionRatio = totalArea > 0 ? bedContactArea / totalArea : 0;
  if (adhesionRatio < minBedAdhesionRatio) {
    issues.push({
      id: "bed-adhesion-risk",
      severity: "warning",
      message: `Estimated bed-adhesion ratio (${adhesionRatio.toFixed(3)}) is below threshold (${minBedAdhesionRatio.toFixed(3)}).`,
      evidence: { adhesionRatio, minBedAdhesionRatio, bedContactArea, totalArea },
    });
  }
  if ((stats.componentCount ?? 1) > 1 || stats.checks?.disconnectedComponents) {
    issues.push({
      id: "disconnected-components",
      severity: "error",
      message: "Model has disconnected components; print may fail or produce loose bodies without explicit assembly intent.",
      evidence: { componentCount: stats.componentCount ?? null },
    });
  }
  return {
    kind: "printability",
    pass: issues.every((issue) => issue.severity !== "error"),
    thresholds: { minWallThickness, maxOverhangRatio, minBedAdhesionRatio },
    metrics: { extents: { x: extX, y: extY, z: extZ }, overhangRatio, adhesionRatio },
    issues,
  };
}

function analyzeMoldability(
  stats: NonNullable<import("./session-client.js").RunResult["stats"]>,
  rawArgs: Record<string, unknown>,
) {
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
      id: "low-draft-risk",
      severity: "warning",
      message: `Inferred draft proxy (${inferredDraftDeg.toFixed(2)}°) is below minimum target (${minDraftDeg.toFixed(2)}°).`,
      evidence: { inferredDraftDeg, minDraftDeg, sideAreaRatio },
    });
  }
  const thicknessProxy = stats.volume && totalArea ? (2 * stats.volume) / totalArea : 0;
  const dims = [extX, extY, extZ].filter((n) => Number.isFinite(n) && n > 0);
  const thicknessSpread = dims.length > 0 ? (Math.max(...dims) - Math.min(...dims)) / Math.max(...dims) : 0;
  if (thicknessSpread > maxThicknessVarianceRatio) {
    issues.push({
      id: "wall-uniformity-risk",
      severity: "warning",
      message: `Wall-thickness variance proxy (${thicknessSpread.toFixed(3)}) exceeds threshold (${maxThicknessVarianceRatio.toFixed(3)}).`,
      evidence: { thicknessSpread, maxThicknessVarianceRatio, thicknessProxy },
    });
  }
  if ((stats.componentCount ?? 1) > 1) {
    issues.push({
      id: "multi-component-risk",
      severity: "warning",
      message: "Model has multiple disconnected components; mold split strategy may be required.",
      evidence: { componentCount: stats.componentCount ?? null },
    });
  }
  if (stats.triangles > 150_000) {
    issues.push({
      id: "complexity-risk",
      severity: "info",
      message: "High triangle count suggests geometric complexity that may introduce tooling and polishing challenges.",
      evidence: { triangles: stats.triangles },
    });
  }
  return {
    kind: "moldability",
    pass: issues.every((issue) => issue.severity !== "error"),
    thresholds: { minDraftDeg, maxThicknessVarianceRatio },
    metrics: { inferredDraftDeg, thicknessProxy, thicknessSpread },
    issues,
  };
}

function buildImprovementSuggestions(
  stats: NonNullable<import("./session-client.js").RunResult["stats"]>,
  diagnostics: Array<{ severity?: string; message?: string }>,
  rawArgs: Record<string, unknown>,
) {
  const includeChecks = Array.isArray(rawArgs.includeChecks)
    ? rawArgs.includeChecks.filter((value): value is "printability" | "moldability" => value === "printability" || value === "moldability")
    : ["printability", "moldability"];

  const suggestions: Array<{
    id: string;
    source: "printability" | "moldability" | "validation";
    severity: "info" | "warning" | "error";
    message: string;
    autoFixable: boolean;
  }> = [];

  if (includeChecks.includes("printability")) {
    for (const issue of analyzePrintability(stats, rawArgs).issues) {
      suggestions.push({
        id: `printability:${issue.id}`,
        source: "printability",
        severity: issue.severity,
        message: issue.message,
        autoFixable: issue.id === "thin-feature" || issue.id === "bed-adhesion-risk",
      });
    }
  }
  if (includeChecks.includes("moldability")) {
    for (const issue of analyzeMoldability(stats, rawArgs).issues) {
      suggestions.push({
        id: `moldability:${issue.id}`,
        source: "moldability",
        severity: issue.severity,
        message: issue.message,
        autoFixable: issue.id === "low-draft-risk" || issue.id === "wall-uniformity-risk",
      });
    }
  }
  for (const diag of diagnostics) {
    if (diag.severity === "error" || diag.severity === "warning") {
      suggestions.push({
        id: `validation:${slugify(diag.message ?? "diagnostic")}`,
        source: "validation",
        severity: diag.severity,
        message: diag.message ?? "Validation diagnostic",
        autoFixable: false,
      });
    }
  }

  const deduped = dedupeSuggestions(suggestions);
  return {
    kind: "suggest_improvements",
    total: deduped.length,
    bySeverity: {
      error: deduped.filter((item) => item.severity === "error").length,
      warning: deduped.filter((item) => item.severity === "warning").length,
      info: deduped.filter((item) => item.severity === "info").length,
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
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "item";
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("CadLad MCP server running (stdio)");
