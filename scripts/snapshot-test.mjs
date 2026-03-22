#!/usr/bin/env node
/**
 * Snapshot tests for CadLad example models.
 *
 * Renders each example in headless Chrome, captures the viewport,
 * compares against reference images.
 *
 * Usage:
 *   node scripts/snapshot-test.mjs                  # compare against references
 *   node scripts/snapshot-test.mjs --update          # capture new reference images
 *   node scripts/snapshot-test.mjs --url http://localhost:5177
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

// Find puppeteer from wherever it lives — project, global, tmp, npx cache.
// Never install it ourselves; just use what the environment has.
async function loadPuppeteer() {
  // 1. Project node_modules
  try { return await import("puppeteer"); } catch {}
  // 2. Common temp install location
  try { return await import("/tmp/cadlad_sniff/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js"); } catch {}
  // 3. Ask node to resolve it globally
  try {
    const globalPath = execSync("node -e \"console.log(require.resolve('puppeteer'))\"", { encoding: "utf-8" }).trim();
    if (globalPath) return await import(globalPath);
  } catch {}
  // 4. npx cache (resolve without installing)
  try {
    const npxPath = execSync("npx --no-install puppeteer --version 2>/dev/null && npx --no-install -p puppeteer node -e \"console.log(require.resolve('puppeteer'))\"", { encoding: "utf-8" }).trim();
    if (npxPath) return await import(npxPath);
  } catch {}

  console.error(`Puppeteer not found in environment.
Install it anywhere — the script searches project, global, and temp locations:
  mkdir /tmp/pp && cd /tmp/pp && npm init -y && npm i puppeteer  # throwaway, works everywhere
  npm install puppeteer                                          # project-local
This downloads Chromium on first run (~150MB cached at ~/.cache/puppeteer/).`);
  process.exit(1);
}

// Find a Chrome/Chromium binary: Playwright cache, Puppeteer cache, system.
// Returns the path or null (let Puppeteer use its bundled browser).
function findChromeBinary() {
  const home = process.env.HOME || "/root";
  // Playwright Chromium (common in CI / Codex containers)
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
  // Puppeteer cache
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

const args = process.argv.slice(2);
const UPDATE = args.includes("--update");
const EXAMPLES_DIR = argVal("--examples-dir") || join(ROOT, "examples");
const BASE_URL = argVal("--url") || "http://localhost:5173";
const REF_DIR = join(ROOT, "snapshots", "reference");
const CUR_DIR = join(ROOT, "snapshots", "current");
const REPORT_PATH = join(ROOT, "snapshots", "report.json");
const RENDER_WAIT = parseInt(argVal("--wait") || "4000");

function argVal(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

async function main() {
  await mkdir(REF_DIR, { recursive: true });
  await mkdir(CUR_DIR, { recursive: true });

  const files = (await readdir(EXAMPLES_DIR))
    .filter((f) => f.endsWith(".forge.js"))
    .sort();

  if (files.length === 0) {
    console.error("No .forge.js files found in", EXAMPLES_DIR);
    process.exit(1);
  }

  console.log(`Found ${files.length} examples: ${files.join(", ")}`);

  const puppeteer = await loadPuppeteer();
  const launch = puppeteer.default?.launch ? puppeteer.default : puppeteer;
  const chromePath = findChromeBinary();
  if (chromePath) console.log(`Using Chrome: ${chromePath}`);
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

  const results = [];

  for (const file of files) {
    const name = basename(file, ".forge.js");
    const code = await readFile(join(EXAMPLES_DIR, file), "utf-8");
    const refPath = join(REF_DIR, `${name}.png`);
    const curPath = join(CUR_DIR, `${name}.png`);

    console.log(`\n--- ${name} ---`);

    // Fresh page per example — avoids stale WASM state between models
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log(`  PAGE ERROR: ${e.message}`));
    await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });

    try {
      await page.goto(BASE_URL, { waitUntil: "load", timeout: 30000 });

      // Wait for studio boot (WASM init)
      await page.waitForFunction(() => !!(window).__cadlad, { timeout: 30000 });

      // Set the code in the editor (non-blocking)
      await page.evaluate((src) => {
        (window).__cadlad.setCode(src);
      }, code);

      // Click the Run button instead of calling run() directly
      // This avoids blocking on page.evaluate with async WASM calls
      await page.click("#btn-run");

      // Wait for render to complete
      await new Promise((r) => setTimeout(r, RENDER_WAIT));

      // Check for errors
      const hasError = await page.evaluate(() => {
        const bar = document.getElementById("error-bar");
        if (bar && bar.classList.contains("visible")) return bar.textContent;
        return null;
      });

      if (hasError) {
        console.log(`  MODEL ERROR: ${hasError}`);
        results.push({ name, status: "error", error: hasError });
        await page.close();
        continue;
      }

      // Screenshot the viewport
      const viewport = await page.$("#viewport");
      if (!viewport) {
        results.push({ name, status: "error", error: "#viewport not found" });
        await page.close();
        continue;
      }

      await viewport.screenshot({ path: curPath });

      if (UPDATE) {
        await viewport.screenshot({ path: refPath });
        console.log("  Updated reference");
        results.push({ name, status: "updated" });
      } else if (!existsSync(refPath)) {
        await viewport.screenshot({ path: refPath });
        console.log("  No reference existed — created");
        results.push({ name, status: "new" });
      } else {
        const refBuf = await readFile(refPath);
        const curBuf = await readFile(curPath);
        if (Buffer.compare(refBuf, curBuf) === 0) {
          console.log("  MATCH");
          results.push({ name, status: "match" });
        } else {
          console.log("  DIFF DETECTED");
          results.push({ name, status: "diff", referencePath: refPath, currentPath: curPath });
        }
      }
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      results.push({ name, status: "error", error: err.message });
    }

    await page.close();
  }

  await browser.close();
  await writeFile(REPORT_PATH, JSON.stringify(results, null, 2));

  const diffs = results.filter((r) => r.status === "diff");
  const errors = results.filter((r) => r.status === "error");
  const matches = results.filter((r) => r.status === "match");
  const updated = results.filter((r) => r.status === "updated" || r.status === "new");

  console.log(`\nResults: ${matches.length} match, ${diffs.length} diff, ${errors.length} error, ${updated.length} new/updated`);

  if (diffs.length > 0) {
    console.log("\nDiffs:");
    for (const d of diffs) console.log(`  ${d.name}`);
    process.exit(1);
  }
  if (errors.length > 0) {
    console.log("\nErrors:");
    for (const e of errors) console.log(`  ${e.name}: ${e.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Snapshot test failed:", err);
  process.exit(1);
});
