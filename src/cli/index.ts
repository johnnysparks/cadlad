#!/usr/bin/env node
/**
 * CadLad CLI.
 *
 * Usage:
 *   cadlad run <file.forge.ts> — validate & evaluate a model
 *   cadlad export <file> -o out.stl — export to STL
 *   cadlad studio                   — launch browser studio (dev server)
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { initManifold } from "../engine/manifold-backend.js";
import { evaluateModel } from "../api/runtime.js";
import { loadModelSource } from "./source-loader.js";

const [, , command, ...args] = process.argv;

async function main() {
  switch (command) {
    case "run":
      await cmdRun(args);
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

async function cmdRun(args: string[]) {
  const file = args[0];
  if (!file) {
    console.error("Usage: cadlad run <file.forge.ts>");
    process.exit(1);
  }

  await initManifold();
  const code = await loadModelSource(file);
  const result = await evaluateModel(code);

  if (result.errors.length > 0) {
    console.error("Errors:");
    result.errors.forEach((e) => console.error(`  ${e}`));
    process.exit(1);
  }

  console.log(`Bodies: ${result.bodies.length}`);
  console.log(`Params: ${result.params.length}`);

  for (const body of result.bodies) {
    const name = body.name ?? "(unnamed)";
    const tris = body.mesh.indices.length / 3;
    console.log(`  ${name}: ${tris} triangles`);
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
    result.errors.forEach((e) => console.error(`  ${e}`));
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
  cadlad run <file.forge.ts> Validate and evaluate a model
  cadlad export <file> -o output.stl    Export model to STL
  cadlad studio                         Launch browser studio
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
