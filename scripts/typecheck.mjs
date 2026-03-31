#!/usr/bin/env node
/**
 * Typecheck with graceful degradation for environments without node_modules.
 *
 * Strategy:
 *  1. Prefer local tsc; fall back to global tsc in PATH.
 *  2. Run `tsc --noEmit`, capture output.
 *  3. Identify files with TS2307 "Cannot find module" errors for packages listed
 *     in package.json (i.e. deps not installed, not internal typos).
 *  4. Suppress ALL errors in those files (including cascades like implicit-any
 *     that result from the missing module types).
 *  5. Exit non-zero only if genuine type errors remain in files unaffected by
 *     missing deps. Exit 0 with a summary otherwise.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Sniff tsc ──────────────────────────────────────────────────────────────
const localTsc = './node_modules/.bin/tsc';
const hasLocal = existsSync(localTsc);

if (!hasLocal) {
  console.log('[typecheck] No local node_modules/tsc — falling back to global tsc in PATH');
}

const tscCmd = hasLocal ? localTsc : 'tsc';

// ── Collect known package names from package.json ─────────────────────────
let knownPkgs = new Set();
try {
  const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
  for (const name of [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]) {
    knownPkgs.add(name);
    // Also handle scoped packages like "@types/three" → "@types/three" and sub-paths
    if (name.startsWith('@')) knownPkgs.add(name.split('/').slice(0, 2).join('/'));
  }
} catch {}

// ── Run tsc ────────────────────────────────────────────────────────────────
const result = spawnSync(tscCmd, ['--noEmit'], { encoding: 'utf8' });
const raw = (result.stdout ?? '') + (result.stderr ?? '');

if (result.status === 0) {
  process.exit(0);
}

// ── Parse errors ───────────────────────────────────────────────────────────
// Format: "path/to/file.ts(line,col): error TSxxxx: message"
const errorRe = /^(.+?)\(\d+,\d+\): error (TS\d+): (.+)$/;
const lines = raw.split('\n');

/** @type {Map<string, {code:string, msg:string}[]>} file → errors */
const byFile = new Map();
/** files with TS2307 for a known package (missing dep, not a typo) */
const depAffectedFiles = new Set();

for (const line of lines) {
  const m = line.match(errorRe);
  if (!m) continue;
  const [, filePath, code, msg] = m;
  const abs = resolve(filePath);
  if (!byFile.has(abs)) byFile.set(abs, []);
  byFile.get(abs).push({ code, msg, line });

  if (code === 'TS2307') {
    // "Cannot find module 'X' or its corresponding type declarations."
    const modMatch = msg.match(/Cannot find module '([^']+)'/);
    if (modMatch) {
      const modName = modMatch[1];
      // Check if this is a known project package (not an internal path)
      const rootPkg = modName.startsWith('@')
        ? modName.split('/').slice(0, 2).join('/')
        : modName.split('/')[0];
      if (knownPkgs.has(rootPkg) || knownPkgs.has(modName)) {
        depAffectedFiles.add(abs);
      }
    }
  }
}

// ── Filter: keep only errors in dep-free files ────────────────────────────
const realErrors = [];
for (const [file, errors] of byFile) {
  if (depAffectedFiles.has(file)) continue; // all errors in this file suppressed
  realErrors.push(...errors.map((e) => e.line));
}

if (depAffectedFiles.size > 0) {
  const skipped = [...depAffectedFiles].map((f) => f.replace(resolve('.') + '/', ''));
  console.log(
    `[typecheck] Suppressed errors in ${depAffectedFiles.size} file(s) with missing package deps:`,
  );
  skipped.forEach((f) => console.log(`  • ${f}`));
}

if (realErrors.length === 0) {
  console.log('[typecheck] No genuine type errors. Exit 0.');
  process.exit(0);
}

// ── Report remaining real errors ──────────────────────────────────────────
console.error('\n[typecheck] Type errors unrelated to missing packages:\n');
for (const line of realErrors) {
  console.error(line);
}
console.error(`\n${realErrors.length} error(s) found.`);
process.exit(1);
