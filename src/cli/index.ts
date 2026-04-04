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

import { watch } from "node:fs";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { initManifold } from "../engine/manifold-backend.js";
import { evaluateModel } from "../api/runtime.js";
import { loadModelSource } from "./source-loader.js";
import { buildRunJsonOutput, buildRunReport, formatRunReportText } from "./run-output.js";
import { formatValidationDiagnostic } from "../validation/layered-validation.js";

const [, , command, ...args] = process.argv;

async function main() {
  switch (command) {
    case "run":
      await cmdRun(args, { watchMode: false });
      break;
    case "validate":
      await cmdRun(args, { watchMode: args.includes("--watch") });
      break;
    case "export":
      await cmdExport(args);
      break;
    case "studio":
      console.log("Launch the studio with: npm run dev");
      console.log("Then open http://localhost:5173 in your browser.");
      break;
    default:
      printUsage();
  }
}

async function cmdRun(args: string[], options: { watchMode: boolean }) {
  const parsed = parseRunArgs(args);
  const file = parsed.file;
  const printJson = parsed.json;
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
            diagnostics: result.diagnostics ?? [],
            evaluation: result.evaluation,
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

      const report = buildRunReport(result);
      if (printJson) {
        console.log(JSON.stringify(buildRunJsonOutput({
          ok: true,
          file,
          mode,
          report,
          diagnostics: result.diagnostics ?? [],
          evaluation: result.evaluation,
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
  cadlad run <file.forge.ts>            Validate and evaluate a model once
  cadlad validate <file.forge.ts>       Validate locally (use --watch for loop)
  cadlad export <file> -o output.stl    Export model to STL
  cadlad studio                         Launch browser studio
`);
}

function parseRunArgs(args: string[]): { file?: string; json: boolean } {
  let file: string | undefined;
  let json = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--watch") continue;
    if (arg.startsWith("-")) continue;
    if (!file) file = arg;
  }

  return { file, json };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
