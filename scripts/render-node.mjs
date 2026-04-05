#!/usr/bin/env node
/**
 * render-node.mjs — Fast headless PNG renderer via Playwright + studio API.
 *
 * No fixed sleeps. Uses window.__cadlad.run() (async) + captureFrame(view) (dataURL).
 * Requires the dev server to be running: npm run dev
 *
 * Usage:
 *   node scripts/render-node.mjs <path-to.forge.ts>           # 4 angles → project snapshots/
 *   node scripts/render-node.mjs <path.forge.ts> /tmp/out     # custom output dir
 *   node scripts/render-node.mjs <path.forge.ts> --angles 1   # iso only
 *   node scripts/render-node.mjs <path.forge.ts> --angles 7   # all 7 angles
 *   node scripts/render-node.mjs <path.forge.ts> --angle iso  # specific angle
 *   node scripts/render-node.mjs <path.forge.ts> --url http://localhost:5173
 */

import { readFileSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- Arg parsing ---

const args = process.argv.slice(2);
const isForgeFile = (s) => s.endsWith(".forge.ts") || s.endsWith(".forge.js");
const forgeFile = args.find(isForgeFile);

if (!forgeFile) {
  console.error(
    "Usage: node scripts/render-node.mjs <path-to.forge.ts> [output-dir] [--angles 1|4|7] [--angle <view>] [--url <url>]",
  );
  process.exit(1);
}

function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const ALL_VIEWS = ["iso", "front", "back", "left", "right", "top", "bottom"];
const DEFAULT_VIEWS = ["iso", "front", "right", "top"];

const specificAngle = argVal("--angle");
const angleCount = argVal("--angles");

let views;
if (specificAngle) {
  if (!ALL_VIEWS.includes(specificAngle)) {
    console.error(`Unknown angle "${specificAngle}". Valid: ${ALL_VIEWS.join(", ")}`);
    process.exit(1);
  }
  views = [specificAngle];
} else if (angleCount === "1") {
  views = ["iso"];
} else if (angleCount === "7") {
  views = ALL_VIEWS;
} else {
  views = DEFAULT_VIEWS;
}

const forgePath = resolve(forgeFile);
const projectDir = dirname(forgePath);
const outputArg = args.find(
  (a) =>
    !a.startsWith("--") &&
    !isForgeFile(a) &&
    a !== argVal("--angles") &&
    a !== argVal("--angle") &&
    a !== argVal("--url"),
);
const outputDir = outputArg ? resolve(outputArg) : join(projectDir, "snapshots");
const modelName = basename(forgePath).replace(/\.forge\.(ts|js)$/, "");
const baseUrl = argVal("--url") ?? "http://localhost:5173";

if (!existsSync(forgePath)) {
  console.error(`ERROR: File not found: ${forgePath}`);
  process.exit(1);
}

// --- Run via tsx (TypeScript support) ---

const tsRunner = join(ROOT, "node_modules", ".bin", "tsx");
if (!existsSync(tsRunner)) {
  console.error("ERROR: tsx not found. Run: npm install");
  process.exit(1);
}

// Inline TS script — uses RenderSession for fast, event-driven capture
const runScript = `
import { readFileSync } from "node:fs";
import { RenderSession } from "${pathToFileURL(join(ROOT, "src/eval/renderer.ts")).href}";

const code = readFileSync(${JSON.stringify(forgePath)}, "utf-8");

const session = await RenderSession.start({ baseUrl: ${JSON.stringify(baseUrl)} });
try {
  const paths = await session.renderCode(
    code,
    ${JSON.stringify(outputDir)},
    ${JSON.stringify(modelName)},
    ${JSON.stringify(views)},
  );
  for (const p of paths) console.log(p);
} finally {
  await session.close();
}
`;

const tmpScript = join(tmpdir(), `cadlad-render-${process.pid}.mts`);
writeFileSync(tmpScript, runScript, "utf-8");

try {
  execSync(`${JSON.stringify(tsRunner)} ${JSON.stringify(tmpScript)}`, {
    stdio: "inherit",
    env: { ...process.env },
  });
} finally {
  try {
    unlinkSync(tmpScript);
  } catch {}
}
