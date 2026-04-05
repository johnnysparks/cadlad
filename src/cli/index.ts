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
import { initManifold } from "../engine/manifold-backend.js";
import { evaluateModel } from "../api/runtime.js";
import { loadModelSource } from "./source-loader.js";
import { buildRunJsonOutput, buildRunReport, formatRunReportText } from "./run-output.js";
import { formatValidationDiagnostic } from "../validation/layered-validation.js";
import { LocalHistoryStore } from "./local-history-store.js";
import { RevisionBranchError } from "../core/revision-branch.js";
import { loadTaskFile, runEval } from "../eval/runner.js";
import { parseModelConfig } from "../eval/model-adapter.js";

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
    default:
      printUsage();
  }
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
    console.error("Usage: cadlad eval <task.yaml|task-dir> [--model <provider://model|http://host/model>] [--judge <provider://model|http://host/model>] [--no-judge]");
    process.exit(1);
  }

  const modelConfig = parseModelConfig(parsed.modelRef);
  const taskFiles = collectTaskFiles(parsed.taskPath);
  if (taskFiles.length === 0) {
    console.error(`[cadlad eval] No task files found at ${parsed.taskPath}`);
    process.exit(1);
  }

  let allPass = true;

  for (const taskFile of taskFiles) {
    try {
      const task = loadTaskFile(taskFile);
      const judgeConfig = parsed.noJudge || !parsed.judgeModelRef ? undefined : parseModelConfig(parsed.judgeModelRef);
      const result = await runEval(task, modelConfig, { judgeConfig });
      if (!result.pass) {
        allPass = false;
      }

      const status = result.pass ? "PASS" : "FAIL";
      const seconds = (result.duration_ms / 1000).toFixed(1);
      const tokens = result.total_tokens.toLocaleString("en-US");
      const judgeSuffix = result.judge !== undefined ? ` (judge:${Math.round(result.judge)})` : "";
      const reasonSuffix = result.pass ? "" : `  reason: ${result.reason ?? "score below threshold"}`;
      console.log(
        `[eval] ${task.id.padEnd(14)} ${status.padEnd(4)}  score=${Math.round(result.score)}${judgeSuffix}  iterations=${result.iterations}  tokens=${tokens}  time=${seconds}s${reasonSuffix}`,
      );
    } catch (error) {
      allPass = false;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[eval] ${taskFile} FAIL  reason: ${message}`);
    }
  }

  if (!allPass) {
    process.exit(1);
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
  cadlad eval <task.yaml|dir> [--model <provider://model|http://host/model>] [--judge <provider://model|http://host/model>] [--no-judge]
                                       Run one or many eval tasks
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
  const subcommand = first === 'create' || first === 'checkout' ? first : 'list';
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

function parseEvalArgs(args: string[]): { taskPath?: string; modelRef: string; judgeModelRef?: string; noJudge: boolean } {
  const parsed = {
    taskPath: undefined as string | undefined,
    modelRef: "ollama://llama3.2",
    judgeModelRef: undefined as string | undefined,
    noJudge: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--model") {
      parsed.modelRef = args[index + 1] ?? parsed.modelRef;
      index += 1;
      continue;
    }
    if (arg === "--judge") {
      parsed.judgeModelRef = args[index + 1] ?? parsed.judgeModelRef;
      index += 1;
      continue;
    }
    if (arg === "--no-judge") {
      parsed.noJudge = true;
      continue;
    }
    if (arg.startsWith("-")) {
      continue;
    }
    if (!parsed.taskPath) {
      parsed.taskPath = arg;
    }
  }

  return parsed;
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
