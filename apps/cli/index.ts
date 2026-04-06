#!/usr/bin/env node
/**
 * CadLad CLI.
 *
 * Usage:
 *   cadlad run <file.forge.ts>            — validate & evaluate a model once
 *   cadlad validate <file.forge.ts>       — local-only validation loop (--watch)
 *   cadlad export <file> -o out.stl       — export to STL
 *   cadlad studio                          — launch browser studio (dev server)
 */

import { readdirSync, statSync, watch } from "node:fs";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { initManifold } from "@cadlad/kernel/manifold-backend.js";
import { evaluateModel } from "@cadlad/api/runtime.js";
import { loadModelSource } from "./source-loader.js";
import { buildRunJsonOutput, buildRunReport, formatRunReportText } from "./run-output.js";
import { formatValidationDiagnostic } from "@cadlad/validation/layered-validation.js";
import { LocalHistoryStore } from "./local-history-store.js";
import { RevisionBranchError } from "@cadlad/session-core/revision-branch.js";
import { loadTaskFile, runEval } from "@cadlad/eval/runner.js";
import { parseModelConfig } from "@cadlad/eval/model-adapter.js";
import { formatBatchSummaryTable, runBatch } from "@cadlad/eval/batch.js";
import { aggregateLogs, generateDeadweightReport, generateIssuesReport } from "@cadlad/eval/report.js";

const [, , command, ...args] = process.argv;

async function main() {
  switch (command) {
    case "run":
      await cmdRun(args, { watchMode: false });
      break;
    case "validate":
      await cmdRun(args, { watchMode: args.includes("--watch") });
      break;
    case "branch":
      await cmdBranch(args);
      break;
    case "compare":
      await cmdCompare(args);
      break;
    case "history":
      await cmdHistory(args);
      break;
    case "export":
      await cmdExport(args);
      break;
    case "studio":
      console.log("Launch the studio with: npm run dev");
      console.log("Then open http://localhost:5173 in your browser.");
      break;
    case "eval":
      await cmdEval(args);
      break;
    case "eval-report":
      await cmdEvalReport(args);
      break;
    case "models":
      await cmdModels(args);
      break;
    default:
      printUsage();
  }
}

interface ModelAvailabilitySummary {
  provider: "ollama" | "openai" | "anthropic" | "lmstudio";
  configured: boolean;
  endpoint: string;
  auth: "required" | "configured" | "not-required";
  available: boolean;
  models: string[];
  note?: string;
}

async function cmdRun(args: string[], options: { watchMode: boolean }) {
  const parsed = parseRunArgs(args);
  const file = parsed.file;
  const printJson = parsed.json;
  const includeMesh = parsed.includeMesh;
  const mode = options.watchMode ? "validate" : "run";
  if (!file) {
    console.error(`Usage: cadlad ${mode} <file.forge.ts>`);
    process.exit(1);
  }

  await initManifold();

  const runOnce = async () => {
    try {
      const code = await loadModelSource(file);
      const result = await evaluateModel(code);

      if (result.errors.length > 0) {
        if (printJson) {
          console.log(JSON.stringify(buildRunJsonOutput({
            ok: false,
            file,
            mode,
            errors: result.errors,
            modelResult: result,
            includeMesh,
          }), null, 2));
        } else {
          console.error("Errors:");
          if (result.diagnostics && result.diagnostics.length > 0) {
            result.diagnostics
              .filter((diag) => diag.severity === "error")
              .forEach((diag) => console.error(`  ${formatValidationDiagnostic(diag)}`));
          } else {
            result.errors.forEach((e) => console.error(`  ${e}`));
          }
        }
        return false;
      }

      if (parsed.recordEvents) {
        const historyStore = new LocalHistoryStore(file);
        const runRecord = await historyStore.recordRun({
          source: code,
          params: Object.fromEntries(result.params.map((param) => [param.name, param.value])),
          actor: { kind: parsed.actorKind, ...(parsed.actorId ? { id: parsed.actorId } : {}) },
          modelResult: result,
          recordEvents: true,
        });

        if (!printJson) {
          console.log(
            `[cadlad] Recorded revision ${runRecord.revision.revision} on branch ${runRecord.branch.name} (${runRecord.eventCount} events).`,
          );
        }
      }

      const report = buildRunReport(result);
      if (printJson) {
        console.log(JSON.stringify(buildRunJsonOutput({
          ok: true,
          file,
          mode,
          modelResult: result,
          includeMesh,
        }), null, 2));
      } else {
        console.log(formatRunReportText(report));
      }
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (printJson) {
        console.log(JSON.stringify(buildRunJsonOutput({
          ok: false,
          file,
          mode,
          errors: [message],
        }), null, 2));
      } else {
        console.error(message);
      }
      return false;
    }
  };

  const firstRunOk = await runOnce();
  if (!options.watchMode) {
    if (!firstRunOk) process.exit(1);
    return;
  }

  console.log(`\n[cadlad] Watching ${resolve(file)} for changes. Press Ctrl+C to stop.`);
  let runScheduled = false;
  let running = false;

  const scheduleRun = () => {
    if (runScheduled) return;
    runScheduled = true;
    setTimeout(async () => {
      runScheduled = false;
      if (running) {
        scheduleRun();
        return;
      }
      running = true;
      console.log(`\n[cadlad] Revalidating at ${new Date().toISOString()}...`);
      await runOnce();
      running = false;
    }, 150);
  };

  watch(resolve(file), scheduleRun);
  await new Promise(() => {});
}

async function cmdBranch(args: string[]) {
  const parsed = parseBranchArgs(args);
  if (!parsed.file) {
    console.error("Usage: cadlad branch <list|create|checkout> [args] --file <file.forge.ts>");
    process.exit(1);
  }

  const historyStore = new LocalHistoryStore(parsed.file);

  try {
    if (parsed.subcommand === 'create') {
      if (!parsed.name) {
        console.error('Usage: cadlad branch create <name> [--from <revision>] --file <file.forge.ts>');
        process.exit(1);
      }
      const branch = historyStore.createBranch(parsed.name, parsed.fromRevision);
      console.log(`Created branch ${branch.name} (${branch.id}) at revision ${branch.headRevision}.`);
      return;
    }

    if (parsed.subcommand === 'checkout') {
      if (!parsed.target) {
        console.error('Usage: cadlad branch checkout <branch-id-or-name> --file <file.forge.ts>');
        process.exit(1);
      }
      const checkout = historyStore.checkoutBranch(parsed.target);
      console.log(`Checked out ${checkout.branch.name} at revision ${checkout.branch.headRevision}.`);
      return;
    }

    const branches = historyStore.listBranches();
    if (parsed.json) {
      console.log(JSON.stringify(branches, null, 2));
      return;
    }

    for (const branch of branches.branches) {
      const active = branch.id === branches.activeBranchId ? '*' : ' ';
      console.log(`${active} ${branch.name} (${branch.id}) head=${branch.headRevision} base=${branch.baseRevision ?? 'n/a'}`);
    }
  } catch (error) {
    handleRevisionBranchError(error);
  }
}

async function cmdCompare(args: string[]) {
  const parsed = parseCompareArgs(args);
  if (!parsed.file || !parsed.branchA || !parsed.branchB) {
    console.error('Usage: cadlad compare <branch-a> <branch-b> --file <file.forge.ts> [--json]');
    process.exit(1);
  }

  const historyStore = new LocalHistoryStore(parsed.file);
  try {
    const comparison = historyStore.compareBranches(parsed.branchA, parsed.branchB);
    if (parsed.json) {
      console.log(JSON.stringify(comparison, null, 2));
      return;
    }

    console.log(`Compare ${comparison.branches.a.name} (rev ${comparison.branches.a.headRevision}) vs ${comparison.branches.b.name} (rev ${comparison.branches.b.headRevision})`);
    console.log(`  Error delta: ${comparison.diff.validation.errorCountDelta}`);
    console.log(`  Warning delta: ${comparison.diff.validation.warningCountDelta}`);
    console.log(`  Stats delta: ${JSON.stringify(comparison.diff.stats)}`);
  } catch (error) {
    handleRevisionBranchError(error);
  }
}

async function cmdHistory(args: string[]) {
  const parsed = parseHistoryArgs(args);
  if (!parsed.file) {
    console.error('Usage: cadlad history --file <file.forge.ts> [--limit N] [--offset N] [--json]');
    process.exit(1);
  }

  const historyStore = new LocalHistoryStore(parsed.file);
  const history = historyStore.getHistory(parsed.limit, parsed.offset);
  if (parsed.json) {
    console.log(JSON.stringify(history, null, 2));
    return;
  }

  console.log(`Revisions (${history.total} total):`);
  for (const revision of history.revisions) {
    console.log(`  r${revision.revision} branch=${revision.branchId} events=${revision.eventIds.length} sourceHash=${revision.sourceHash.slice(0, 10)}...`);
  }
}

async function cmdExport(args: string[]) {
  const file = args[0];
  const outIdx = args.indexOf("-o");
  const outFile = outIdx >= 0 ? args[outIdx + 1] : undefined;

  if (!file) {
    console.error("Usage: cadlad export <file.forge.ts> -o output.stl");
    process.exit(1);
  }

  await initManifold();
  const code = await loadModelSource(file);
  const result = await evaluateModel(code);

  if (result.errors.length > 0) {
    console.error("Errors:");
    if (result.diagnostics && result.diagnostics.length > 0) {
      result.diagnostics
        .filter((diag) => diag.severity === "error")
        .forEach((diag) => console.error(`  ${formatValidationDiagnostic(diag)}`));
    } else {
      result.errors.forEach((e) => console.error(`  ${e}`));
    }
    process.exit(1);
  }

  if (result.bodies.length === 0) {
    console.error("No bodies to export.");
    process.exit(1);
  }

  const outputPath = outFile ?? file.replace(/\.forge\.ts$/, ".stl");
  const body = result.bodies[0];
  const stl = meshToSTLBuffer(body.mesh);
  writeFileSync(resolve(outputPath), Buffer.from(stl));
  console.log(`Exported: ${outputPath} (${(stl.byteLength / 1024).toFixed(1)} KB)`);
}

async function cmdEval(args: string[]) {
  const parsed = parseEvalArgs(args);
  if (!parsed.taskPath) {
    console.error("Usage: cadlad eval <task.yaml|task-dir> [--model <provider://model|context-loop|http://host/model>] [--concurrency <n>] [--repeat <n>] [--render]");
    process.exit(1);
  }

  const modelConfigs = parsed.modelRefs.map((modelRef) => parseModelConfig(modelRef));
  const judgeConfig = parsed.judgeRef ? parseModelConfig(parsed.judgeRef) : undefined;
  const taskFiles = collectTaskFiles(parsed.taskPath);
  if (taskFiles.length === 0) {
    console.error(`[cadlad eval] No task files found at ${parsed.taskPath}`);
    process.exit(1);
  }

  const tasks = taskFiles.map((taskFile) => loadTaskFile(taskFile));

  let renderSession: any | undefined;
  if (parsed.render) {
    const { RenderSession } = await import("../../packages/eval/renderer.js");
    renderSession = await RenderSession.start();
  }

  try {
    if (tasks.length === 1 && modelConfigs.length === 1 && parsed.repeat === 1) {
      const task = tasks[0];
      const modelConfig = modelConfigs[0];
      const result = await runEval(task, modelConfig, { judgeConfig, renderSession });
      const status = result.pass ? "PASS" : "FAIL";
      const seconds = (result.duration_ms / 1000).toFixed(1);
      const tokens = result.total_tokens.toLocaleString("en-US");
      const reasonSuffix = result.pass ? "" : `  reason: ${result.reason ?? "score below threshold"}`;
      console.log(
        `[eval] ${task.id.padEnd(14)} (${parsed.modelRefs[0]})  ${status.padEnd(4)}  score=${Math.round(result.score)}  iterations=${result.iterations}  tokens=${tokens}  time=${seconds}s${reasonSuffix}`,
      );
      if (renderSession) await renderSession.close();
      if (!result.pass) {
        process.exit(1);
      }
      return;
    }

    let allPass = true;
    const report = await runBatch({
      tasks,
      models: modelConfigs,
      judgeConfig,
      concurrency: parsed.concurrency,
      repeat: parsed.repeat,
      renderSession,
      onResult: (result) => {
        if (!result.pass) {
          allPass = false;
        }
        const status = result.pass ? "PASS" : "FAIL";
        const seconds = (result.duration_ms / 1000).toFixed(1);
        const tokens = result.total_tokens.toLocaleString("en-US");
        const reasonSuffix = result.pass ? "" : `  reason: ${result.reason ?? "score below threshold"}`;
        console.log(
          `[eval] ${result.task.id} (${result.model})  ${status}  score=${Math.round(result.score)}  iterations=${result.iterations}  tokens=${tokens}  time=${seconds}s${reasonSuffix}`,
        );
      },
    });

    if (renderSession) await renderSession.close();

    console.log("");
    console.log(formatBatchSummaryTable(report));
    console.log("");
    aggregateLogs();
    console.log(
      `[eval] Batch complete: ${report.summary.total_runs} runs, ${report.summary.total_pass} pass, ${report.summary.total_fail} fail. See eval-logs/reports/ for details.`,
    );

    if (!allPass) {
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[eval] Batch failed: ${message}`);
    process.exit(1);
  }
}

async function cmdEvalReport(args: string[]) {
  const parsed = parseEvalReportArgs(args);
  const report = aggregateLogs(parsed.logDir);
  const filteredTasks = parsed.taskId
    ? report.tasks.filter((task) => task.task_id === parsed.taskId)
    : report.tasks;
  const scopedReport = { ...report, tasks: filteredTasks };

  if (parsed.deadweight) {
    const deadweight = generateDeadweightReport(parsed.logDir, parsed.tasksDir);
    if (parsed.json) {
      console.log(JSON.stringify(deadweight, null, 2));
      return;
    }
    printDeadweightReport(deadweight);
    return;
  }

  if (parsed.issues) {
    const issues = generateIssuesReport(scopedReport);
    if (parsed.json) {
      console.log(JSON.stringify(issues, null, 2));
      return;
    }
    printIssuesReport(issues);
    return;
  }

  if (parsed.compare) {
    if (parsed.json) {
      console.log(JSON.stringify(scopedReport, null, 2));
      return;
    }
    printModelComparison(scopedReport);
    return;
  }

  if (parsed.json) {
    console.log(JSON.stringify(scopedReport, null, 2));
    return;
  }
  printSummary(scopedReport);
}

async function cmdModels(args: string[]) {
  const parsed = parseModelsArgs(args);
  const timeoutMs = parsed.timeoutMs;
  const results = await Promise.all([
    discoverOllamaModels(timeoutMs),
    discoverOpenAIModels(timeoutMs),
    discoverAnthropicModels(timeoutMs),
    discoverLmStudioModels(timeoutMs),
  ]);

  if (parsed.json) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), providers: results }, null, 2));
    return;
  }

  console.log("Configured and available models:\n");
  for (const result of results) {
    const configured = result.configured ? "yes" : "no";
    const reachable = result.available ? "yes" : "no";
    console.log(`${result.provider}`);
    console.log(`  configured: ${configured}`);
    console.log(`  endpoint:   ${result.endpoint}`);
    console.log(`  auth:       ${result.auth}`);
    console.log(`  reachable:  ${reachable}`);
    if (result.models.length > 0) {
      console.log("  models:");
      result.models.forEach((model) => console.log(`    - ${model}`));
    } else {
      console.log("  models:     (none discovered)");
    }
    if (result.note) {
      console.log(`  note:       ${result.note}`);
    }
    console.log("");
  }
}

function parseModelsArgs(args: string[]): { json: boolean; timeoutMs: number } {
  const parsed = {
    json: false,
    timeoutMs: 2000,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--timeout-ms") {
      const next = Number(args[index + 1]);
      if (Number.isFinite(next) && next >= 100) {
        parsed.timeoutMs = Math.floor(next);
      }
      index += 1;
    }
  }

  return parsed;
}

async function discoverOllamaModels(timeoutMs: number): Promise<ModelAvailabilitySummary> {
  const endpoint = "http://localhost:11434";
  const configured = true;

  try {
    const payload = await fetchJsonWithTimeout(`${endpoint}/api/tags`, timeoutMs);
    const models = Array.isArray(payload?.models)
      ? payload.models
        .map((entry: { name?: unknown }) => (typeof entry.name === "string" ? entry.name : ""))
        .filter((name: string) => name.length > 0)
      : [];

    return {
      provider: "ollama",
      configured,
      endpoint,
      auth: "not-required",
      available: true,
      models,
      note: models.length === 0 ? "Ollama responded but returned no installed models." : undefined,
    };
  } catch (error) {
    return {
      provider: "ollama",
      configured,
      endpoint,
      auth: "not-required",
      available: false,
      models: [],
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

async function discoverOpenAIModels(timeoutMs: number): Promise<ModelAvailabilitySummary> {
  const endpoint = "https://api.openai.com";
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      provider: "openai",
      configured: false,
      endpoint,
      auth: "required",
      available: false,
      models: [],
      note: "Set OPENAI_API_KEY to enable model discovery.",
    };
  }

  try {
    const payload = await fetchJsonWithTimeout(`${endpoint}/v1/models`, timeoutMs, {
      authorization: `Bearer ${apiKey}`,
    });
    const models = Array.isArray(payload?.data)
      ? payload.data
        .map((entry: { id?: unknown }) => (typeof entry.id === "string" ? entry.id : ""))
        .filter((id: string) => id.length > 0)
      : [];

    return {
      provider: "openai",
      configured: true,
      endpoint,
      auth: "configured",
      available: true,
      models,
      note: models.length === 0 ? "OpenAI responded but returned no models." : undefined,
    };
  } catch (error) {
    return {
      provider: "openai",
      configured: true,
      endpoint,
      auth: "configured",
      available: false,
      models: [],
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

async function discoverAnthropicModels(timeoutMs: number): Promise<ModelAvailabilitySummary> {
  const endpoint = "https://api.anthropic.com";
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      provider: "anthropic",
      configured: false,
      endpoint,
      auth: "required",
      available: false,
      models: [],
      note: "Set ANTHROPIC_API_KEY to enable model discovery.",
    };
  }

  try {
    const payload = await fetchJsonWithTimeout(`${endpoint}/v1/models`, timeoutMs, {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    });
    const models = Array.isArray(payload?.data)
      ? payload.data
        .map((entry: { id?: unknown }) => (typeof entry.id === "string" ? entry.id : ""))
        .filter((id: string) => id.length > 0)
      : [];

    return {
      provider: "anthropic",
      configured: true,
      endpoint,
      auth: "configured",
      available: true,
      models,
      note: models.length === 0 ? "Anthropic responded but returned no models." : undefined,
    };
  } catch (error) {
    return {
      provider: "anthropic",
      configured: true,
      endpoint,
      auth: "configured",
      available: false,
      models: [],
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

async function discoverLmStudioModels(timeoutMs: number): Promise<ModelAvailabilitySummary> {
  const endpoint = "http://localhost:1234";

  try {
    const payload = await fetchJsonWithTimeout(`${endpoint}/v1/models`, timeoutMs);
    const models = Array.isArray(payload?.data)
      ? payload.data
        .map((entry: { id?: unknown }) => (typeof entry.id === "string" ? entry.id : ""))
        .filter((id: string) => id.length > 0)
      : [];

    return {
      provider: "lmstudio",
      configured: true,
      endpoint,
      auth: "not-required",
      available: true,
      models,
      note: models.length === 0 ? "LM Studio responded but returned no loaded models." : undefined,
    };
  } catch (error) {
    return {
      provider: "lmstudio",
      configured: true,
      endpoint,
      auth: "not-required",
      available: false,
      models: [],
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    const payload: Record<string, unknown> | undefined = await response.json().catch(() => undefined);
    if (!response.ok) {
      const err = typeof payload?.error === "object" ? payload?.error as Record<string, unknown> : undefined;
      const detail = typeof err?.message === "string"
        ? err.message
        : typeof payload?.error === "string"
          ? payload.error
          : JSON.stringify(payload);
      throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function collectTaskFiles(taskPath: string): string[] {
  const absolute = resolve(taskPath);
  const stat = statSync(absolute);
  if (stat.isFile()) {
    return [absolute];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  return readdirSync(absolute)
    .filter((name) => name.endsWith(".yaml"))
    .map((name) => join(absolute, name))
    .sort();
}

function meshToSTLBuffer(mesh: { positions: Float32Array; indices: Uint32Array }): ArrayBuffer {
  const numTris = mesh.indices.length / 3;
  const buf = new ArrayBuffer(80 + 4 + numTris * 50);
  const view = new DataView(buf);
  let offset = 80;

  view.setUint32(offset, numTris, true);
  offset += 4;

  const pos = mesh.positions;
  const idx = mesh.indices;

  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;

    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }

    view.setFloat32(offset, nx, true); offset += 4;
    view.setFloat32(offset, ny, true); offset += 4;
    view.setFloat32(offset, nz, true); offset += 4;

    for (const vi of [a, b, c]) {
      view.setFloat32(offset, pos[vi], true); offset += 4;
      view.setFloat32(offset, pos[vi + 1], true); offset += 4;
      view.setFloat32(offset, pos[vi + 2], true); offset += 4;
    }

    view.setUint16(offset, 0, true); offset += 2;
  }

  return buf;
}

function printUsage() {
  console.log(`
CadLad — Code-first parametric CAD

Usage:
  cadlad run <file.forge.ts> [--json] [--include-mesh] [--record-events]
                                       Validate/evaluate once (JSON for agents/CI)
  cadlad validate <file.forge.ts> [--watch] [--json]
                                       Validate locally (watch loop optional)
  cadlad branch [list] --file <file.forge.ts> [--json]
                                       List local branches
  cadlad branch create <name> --file <file.forge.ts> [--from <revision>]
                                       Create local branch
  cadlad branch checkout <branch-id-or-name> --file <file.forge.ts>
                                       Switch active local branch
  cadlad compare <branch-a> <branch-b> --file <file.forge.ts> [--json]
                                       Compare local branch heads
  cadlad history --file <file.forge.ts> [--limit N] [--offset N] [--json]
                                       Show local revision history
  cadlad export <file> -o output.stl    Export model to STL
  cadlad eval <task.yaml|dir> [--model <provider://model|context-loop|http://host/model>] [--concurrency <n>] [--repeat <n>]
                                       Run one or many eval tasks across one or many models
  cadlad eval-report [--task <task-id>] [--compare] [--issues] [--deadweight] [--json]
                                       Aggregate eval logs into summary/comparison/issue reports
  cadlad models [--json] [--timeout-ms <ms>]
                                       List configured providers and discover available models in current env
  cadlad studio                         Launch browser studio
`);
}

function parseRunArgs(args: string[]): { file?: string; json: boolean; includeMesh: boolean; recordEvents: boolean; actorKind: 'human' | 'agent'; actorId?: string } {
  let file: string | undefined;
  let json = false;
  let includeMesh = false;
  let recordEvents = false;
  let actorKind: 'human' | 'agent' = 'human';
  let actorId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--include-mesh") {
      includeMesh = true;
      continue;
    }
    if (arg === '--record-events') {
      recordEvents = true;
      continue;
    }
    if (arg === '--actor') {
      const next = args[index + 1];
      if (next === 'human' || next === 'agent') {
        actorKind = next;
        index += 1;
      }
      continue;
    }
    if (arg === '--actor-id') {
      actorId = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--watch") continue;
    if (arg.startsWith("-")) continue;
    if (!file) file = arg;
  }

  return { file, json, includeMesh, recordEvents, actorKind, actorId };
}

function parseBranchArgs(args: string[]): {
  subcommand: 'list' | 'create' | 'checkout';
  file?: string;
  name?: string;
  target?: string;
  fromRevision?: number;
  json: boolean;
} {
  const first = args[0];
  const subcommand: 'list' | 'create' | 'checkout' = first === 'create' || first === 'checkout' ? first : 'list';
  const parsed = {
    subcommand,
    file: undefined as string | undefined,
    name: undefined as string | undefined,
    target: undefined as string | undefined,
    fromRevision: undefined as number | undefined,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--file') {
      parsed.file = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--from') {
      parsed.fromRevision = Number(args[index + 1]);
      index += 1;
      continue;
    }
  }

  if (subcommand === 'create') {
    parsed.name = args[1];
  }
  if (subcommand === 'checkout') {
    parsed.target = args[1];
  }

  return parsed;
}

function parseCompareArgs(args: string[]): { file?: string; branchA?: string; branchB?: string; json: boolean } {
  const parsed = {
    file: undefined as string | undefined,
    branchA: args[0],
    branchB: args[1],
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--file') {
      parsed.file = args[index + 1];
      index += 1;
      continue;
    }
  }

  return parsed;
}

function parseHistoryArgs(args: string[]): { file?: string; limit: number; offset: number; json: boolean } {
  const parsed = {
    file: undefined as string | undefined,
    limit: 50,
    offset: 0,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--file') {
      parsed.file = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--limit') {
      parsed.limit = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--offset') {
      parsed.offset = Number(args[index + 1]);
      index += 1;
      continue;
    }
  }

  return parsed;
}

function parseEvalArgs(args: string[]): { taskPath?: string; modelRefs: string[]; judgeRef?: string; concurrency: number; repeat: number; render: boolean } {
  const parsed = {
    taskPath: undefined as string | undefined,
    modelRefs: [] as string[],
    judgeRef: undefined as string | undefined,
    concurrency: 2,
    repeat: 1,
    render: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--model") {
      const next = args[index + 1];
      if (next) {
        parsed.modelRefs.push(next);
      }
      index += 1;
      continue;
    }
    if (arg === "--judge") {
      parsed.judgeRef = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--concurrency") {
      const next = Number(args[index + 1]);
      if (Number.isFinite(next) && next > 0) {
        parsed.concurrency = Math.floor(next);
      }
      index += 1;
      continue;
    }
    if (arg === "--repeat") {
      const next = Number(args[index + 1]);
      if (Number.isFinite(next) && next > 0) {
        parsed.repeat = Math.floor(next);
      }
      index += 1;
      continue;
    }
    if (arg === "--render") {
      parsed.render = true;
      continue;
    }
    if (arg.startsWith("-")) {
      continue;
    }
    if (!parsed.taskPath) {
      parsed.taskPath = arg;
    }
  }

  if (parsed.modelRefs.length === 0) {
    parsed.modelRefs = ["manual"];
  }

  return parsed;
}

function parseEvalReportArgs(args: string[]): {
  taskId?: string;
  compare: boolean;
  issues: boolean;
  deadweight: boolean;
  json: boolean;
  logDir: string;
  tasksDir: string;
} {
  const parsed = {
    taskId: undefined as string | undefined,
    compare: false,
    issues: false,
    deadweight: false,
    json: false,
    logDir: resolve("eval-logs"),
    tasksDir: resolve("tasks/benchmark"),
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--task") {
      parsed.taskId = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--compare") {
      parsed.compare = true;
      continue;
    }
    if (arg === "--issues") {
      parsed.issues = true;
      continue;
    }
    if (arg === "--deadweight") {
      parsed.deadweight = true;
      continue;
    }
    if (arg === "--json") {
      parsed.json = true;
    }
  }

  return parsed;
}

function printSummary(report: { generated_at: string; total_runs: number; tasks: Array<{ task_id: string; runs: number; pass_rate: number; avg_score: number; avg_iterations: number; avg_tokens: number; }> }): void {
  const date = report.generated_at.slice(0, 10);
  console.log(`## Eval Summary (${report.total_runs} runs, ${date})\n`);
  console.log("| Task | Runs | Pass Rate | Avg Score | Avg Iters | Avg Tokens |");
  console.log("|-------------------|------|-----------|-----------|-----------|------------|");
  for (const task of report.tasks) {
    console.log(
      `| ${task.task_id} | ${padLeft(task.runs.toString(), 4)} | ${padLeft(formatPercent(task.pass_rate), 8)} | ${padLeft(task.avg_score.toFixed(1), 8)} | ${padLeft(task.avg_iterations.toFixed(1), 8)} | ${padLeft(formatInt(task.avg_tokens), 10)} |`,
    );
  }
}

function printModelComparison(report: { tasks: Array<{ task_id: string; by_model: Record<string, { pass_rate: number; avg_iterations: number }> }>; models: string[] }): void {
  console.log("## Model Comparison\n");
  const header = ["Task", ...report.models];
  console.log(`| ${header.join(" | ")} |`);
  console.log(`|${header.map(() => "---").join("|")}|`);
  for (const task of report.tasks) {
    const columns = report.models.map((model) => {
      const modelData = task.by_model[model];
      if (!modelData) return "—";
      return `${formatPercent(modelData.pass_rate)} (${modelData.avg_iterations.toFixed(1)} iter)`;
    });
    console.log(`| ${task.task_id} | ${columns.join(" | ")} |`);
  }
}

function printIssuesReport(report: { issues: Array<{ task_id: string; severity: "critical" | "warning"; issue: string; detail: string }> }): void {
  if (report.issues.length === 0) {
    console.log("No issues detected.");
    return;
  }

  for (const issue of report.issues) {
    const emoji = issue.severity === "critical" ? "X" : "!";
    console.log(`- ${emoji} [${issue.severity}] ${issue.task_id}: ${issue.issue} — ${issue.detail}`);
  }
}

function printDeadweightReport(report: { entries: Array<{ api_method: string; referenced_in_tasks: string[]; success_rate: number; issue: string }> }): void {
  if (report.entries.length === 0) {
    console.log("No deadweight API methods detected.");
    return;
  }

  console.log("| Method | Tasks | Success Rate | Issue |");
  console.log("|---|---|---|---|");
  for (const entry of report.entries) {
    console.log(`| ${entry.api_method} | ${entry.referenced_in_tasks.join(", ")} | ${formatPercent(entry.success_rate)} | ${entry.issue} |`);
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatInt(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function padLeft(value: string, width: number): string {
  return value.length >= width ? value : `${" ".repeat(width - value.length)}${value}`;
}

function handleRevisionBranchError(error: unknown): never {
  if (error instanceof RevisionBranchError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
