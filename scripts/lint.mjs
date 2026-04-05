#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Environment sniff: prefer local install, fall back to global eslint in PATH.
const localBin = './node_modules/eslint/bin/eslint.js';
const hasLocal = existsSync(localBin);

if (hasLocal) {
  const discovered = ['eslint', '@eslint/js', 'typescript-eslint'].filter((pkg) => {
    try {
      require.resolve(pkg);
      return true;
    } catch {
      return false;
    }
  });
  if (discovered.length) {
    console.log(`[lint] Local packages: ${discovered.join(', ')}`);
  }
} else {
  console.log('[lint] No local node_modules/eslint — falling back to global eslint in PATH');

  // In bare-minimum fallback (no typescript-eslint), only JS files can be parsed.
  // If apps/ packages/ infra/ has none (pure TypeScript project), skip linting and exit 0.
  function hasJsFiles(dir) {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && hasJsFiles(join(dir, entry.name))) return true;
        if (!entry.isDirectory() && /\.(js|mjs|cjs)$/.test(entry.name)) return true;
      }
    } catch {}
    return false;
  }

  if (!hasJsFiles('apps')) {
    console.log(
      '[lint] Bare-minimum mode: apps/ packages/ infra/ has no plain JS files (TypeScript requires typescript-eslint). Exit 0.',
    );
    process.exit(0);
  }
}

const [cmd, args] = hasLocal
  ? ['node', [localBin, 'apps/ packages/ infra/']]
  : ['eslint', ['apps/ packages/ infra/']];

const result = spawnSync(cmd, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
