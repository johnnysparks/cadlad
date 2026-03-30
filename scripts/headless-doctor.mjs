#!/usr/bin/env node
/**
 * headless-doctor.mjs — Diagnose Chromium runtime readiness for Puppeteer screenshots.
 *
 * Usage:
 *   node scripts/headless-doctor.mjs
 *   node scripts/headless-doctor.mjs --install
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const SHOULD_INSTALL = args.includes("--install");

function run(cmd) {
  return execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function runMaybe(cmd) {
  try {
    return run(cmd);
  } catch {
    return "";
  }
}

function findChromeBinary() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const home = process.env.HOME || "/root";
  const pwBase = join(home, ".cache", "ms-playwright");
  if (existsSync(pwBase)) {
    try {
      const dirs = readdirSync(pwBase).filter((d) => d.startsWith("chromium-")).sort().reverse();
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

  const systemChrome = runMaybe("which google-chrome || which chromium || which chromium-browser");
  return systemChrome || null;
}

function missingLibsFor(binaryPath) {
  const lddOut = runMaybe(`ldd "${binaryPath}" 2>/dev/null`);
  if (!lddOut) return [];

  return lddOut
    .split("\n")
    .filter((line) => line.includes("=> not found"))
    .map((line) => line.split("=>")[0].trim())
    .filter(Boolean);
}

function installLinuxRuntimeLibs() {
  if (!runMaybe("which apt-get")) {
    console.error("[headless-doctor] apt-get not found. Install Chromium runtime libs with your distro package manager.");
    return 1;
  }

  const command = `set -e
apt-get update
apt-get install -y \\
  libatk1.0-0 libatk-bridge2.0-0 libcups2 || apt-get install -y libcups2t64
apt-get install -y \\
  libxkbcommon0 libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 \\
  libxrandr2 libgbm1 libnss3 libnspr4 libgtk-3-0 libdrm2 libxshmfence1
apt-get install -y libasound2 || apt-get install -y libasound2t64`;

  try {
    execSync(command, { stdio: "inherit", shell: "/bin/bash" });
    return 0;
  } catch {
    return 1;
  }
}

function printInstallHint() {
  console.error("\nInstall common Chromium runtime libs (Debian/Ubuntu):");
  console.error("  sudo node scripts/headless-doctor.mjs --install");
  console.error("Or run apt manually if sudo is unavailable.");
}

function main() {
  console.log(`[headless-doctor] platform=${process.platform}`);

  const chromePath = findChromeBinary();
  if (!chromePath) {
    console.error("[headless-doctor] No Chrome/Chromium binary found.");
    console.error("Install Puppeteer (downloads Chrome) or provide PUPPETEER_EXECUTABLE_PATH.");
    process.exit(1);
  }

  console.log(`[headless-doctor] chrome=${chromePath}`);

  if (process.platform !== "linux") {
    console.log("[headless-doctor] Non-Linux platform: shared-lib dependency check is not required.");
    process.exit(0);
  }

  let missing = missingLibsFor(chromePath);
  if (missing.length === 0) {
    console.log("[headless-doctor] OK: all required shared libs are present.");
    process.exit(0);
  }

  console.error(`[headless-doctor] Missing shared libs (${missing.length}):`);
  for (const lib of missing) console.error(`  - ${lib}`);

  if (SHOULD_INSTALL) {
    const exitCode = installLinuxRuntimeLibs();
    if (exitCode !== 0) {
      console.error("[headless-doctor] Failed to install packages.");
      process.exit(1);
    }

    missing = missingLibsFor(chromePath);
    if (missing.length === 0) {
      console.log("[headless-doctor] OK after install: shared libs are now present.");
      process.exit(0);
    }

    console.error("[headless-doctor] Still missing shared libs after install:");
    for (const lib of missing) console.error(`  - ${lib}`);
    process.exit(1);
  }

  printInstallHint();
  process.exit(1);
}

main();
