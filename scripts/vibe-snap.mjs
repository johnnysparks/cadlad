#!/usr/bin/env node
/**
 * vibe-snap.mjs — One-command screenshot capture for vibe-modeling sessions.
 *
 * Usage:
 *   node scripts/vibe-snap.mjs projects/foo/foo.forge.js           # 4 angles → projects/foo/snapshots/
 *   node scripts/vibe-snap.mjs projects/foo/foo.forge.js /tmp/out  # custom output dir
 *   node scripts/vibe-snap.mjs projects/foo/foo.forge.js --angles 1   # just iso
 *   node scripts/vibe-snap.mjs projects/foo/foo.forge.js --angles 7   # all 7 angles
 *   node scripts/vibe-snap.mjs projects/foo/foo.forge.js --angle front # specific angle
 *   node scripts/vibe-snap.mjs projects/foo/foo.forge.js --quiet      # suppress info logs
 *
 * Requires: dev server running at localhost:5173 (npm run dev)
 */

import { readFile, mkdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- Puppeteer & Chrome discovery (shared with snapshot-test.mjs) ---

async function loadPuppeteer() {
  try { return await import("puppeteer"); } catch {}
  try { return await import("/tmp/cadlad_sniff/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js"); } catch {}
  try {
    const globalPath = execSync("node -e \"console.log(require.resolve('puppeteer'))\"", { encoding: "utf-8" }).trim();
    if (globalPath) return await import(globalPath);
  } catch {}
  try {
    const npxPath = execSync("npx --no-install puppeteer --version 2>/dev/null && npx --no-install -p puppeteer node -e \"console.log(require.resolve('puppeteer'))\"", { encoding: "utf-8" }).trim();
    if (npxPath) return await import(npxPath);
  } catch {}

  console.error(`ERROR: Puppeteer not found.
Install it anywhere — this script searches project, global, and temp locations:
  mkdir -p /tmp/cadlad_sniff && cd /tmp/cadlad_sniff && npm init -y && npm i puppeteer
See .claude/skills/sniff_screenshot.md for full setup guide.`);
  process.exit(1);
}

function findChromeBinary() {
  const home = process.env.HOME || "/root";
  const pwBase = join(home, ".cache", "ms-playwright");
  if (existsSync(pwBase)) {
    try {
      const dirs = readdirSync(pwBase).filter(d => d.startsWith("chromium-")).sort().reverse();
      for (const d of dirs) {
        const p = join(pwBase, d, "chrome-linux", "chrome");
        if (existsSync(p)) return p;
      }
    } catch {}
  }
  const ppBase = join(home, ".cache", "puppeteer", "chrome");
  if (existsSync(ppBase)) {
    try {
      const dirs = readdirSync(ppBase).sort().reverse();
      for (const d of dirs) {
        const p = join(ppBase, d, "chrome-linux64", "chrome");
        if (existsSync(p)) return p;
      }
    } catch {}
  }
  return null;
}

// --- Argument parsing ---

const args = process.argv.slice(2);
const QUIET = args.includes("--quiet");
const forgeFile = args.find(a => a.endsWith(".forge.js"));

if (!forgeFile) {
  console.error("Usage: node scripts/vibe-snap.mjs <path-to.forge.js> [output-dir] [--angles 1|4|7] [--angle <view>] [--quiet]");
  process.exit(1);
}

function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

const ALL_VIEWS = ["iso", "front", "back", "left", "right", "top", "bottom"];
const DEFAULT_VIEWS = ["iso", "front", "right", "top"];

let views;
const specificAngle = argVal("--angle");
const angleCount = argVal("--angles");

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

// Output directory: explicit arg, or project's snapshots/ folder
const forgePath = resolve(forgeFile);
const projectDir = dirname(forgePath);
const outputArg = args.find(a => !a.startsWith("--") && !a.endsWith(".forge.js") && a !== argVal("--angles") && a !== argVal("--angle"));
const outputDir = outputArg ? resolve(outputArg) : join(projectDir, "snapshots");

const BASE_URL = argVal("--url") || "http://localhost:5173";
const RENDER_WAIT = parseInt(argVal("--wait") || "4000");

function info(msg) {
  if (!QUIET) console.error(`[vibe-snap] ${msg}`);
}

// --- Main ---

async function main() {
  if (!existsSync(forgePath)) {
    console.error(`ERROR: File not found: ${forgePath}`);
    process.exit(1);
  }

  // Check dev server
  try {
    const resp = await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } catch {
    console.error(`ERROR: Dev server not running at ${BASE_URL}
Start it first:  npm run dev`);
    process.exit(1);
  }

  await mkdir(outputDir, { recursive: true });

  const code = await readFile(forgePath, "utf-8");
  const modelName = basename(forgePath, ".forge.js");

  info(`Model: ${modelName}`);
  info(`Angles: ${views.join(", ")} (${views.length})`);
  info(`Output: ${outputDir}`);

  const puppeteer = await loadPuppeteer();
  const launch = puppeteer.default?.launch ? puppeteer.default : puppeteer;
  const chromePath = findChromeBinary();
  if (chromePath) info(`Chrome: ${chromePath}`);

  const browser = await launch.launch({
    headless: "new",
    ...(chromePath ? { executablePath: chromePath } : {}),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--use-gl=angle",
      "--use-angle=swiftshader-webgl",
      "--disable-dev-shm-usage",
    ],
    protocolTimeout: 120000,
  });

  const page = await browser.newPage();
  page.on("pageerror", (e) => info(`PAGE ERROR: ${e.message}`));
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });

  try {
    await page.goto(BASE_URL, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(() => !!(window).__cadlad, { timeout: 30000 });

    await page.evaluate((src) => {
      (window).__cadlad.setCode(src);
    }, code);

    await page.click("#btn-run");
    await new Promise((r) => setTimeout(r, RENDER_WAIT));

    // Check for model errors
    const modelError = await page.evaluate(() => {
      const bar = document.getElementById("error-bar");
      if (bar && bar.classList.contains("visible")) return bar.textContent;
      return null;
    });

    if (modelError) {
      console.error(`MODEL ERROR: ${modelError}`);
      await browser.close();
      process.exit(1);
    }

    const viewport = await page.$("#viewport");
    if (!viewport) {
      console.error("ERROR: #viewport element not found in studio page");
      await browser.close();
      process.exit(1);
    }

    const outputPaths = [];

    for (const view of views) {
      await page.evaluate((v) => {
        (window).__cadlad.setView(v);
      }, view);
      // Brief pause for camera transition
      await new Promise((r) => setTimeout(r, 300));

      const filename = `${modelName}-${view}.png`;
      const filePath = join(outputDir, filename);
      await viewport.screenshot({ path: filePath });
      outputPaths.push(resolve(filePath));
    }

    // Print paths to stdout (one per line) — these can be Read directly
    for (const p of outputPaths) {
      console.log(p);
    }

    if (!QUIET && views.length < 4) {
      info("Tip: if the change isn't obvious, escalate to 4 angles (default) or --angles 7 for full coverage.");
    }
    if (!QUIET && views.length >= 4) {
      info("Tip: for quick iteration, use --angles 1 to capture just the iso view.");
    }

  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    await browser.close();
    process.exit(1);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(`vibe-snap failed: ${err.message}`);
  process.exit(1);
});
