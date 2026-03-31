#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Environment sniff: use default installed libraries discovered locally.
const discovered = ['eslint', '@eslint/js', 'typescript-eslint'].filter((pkg) => {
  try {
    require.resolve(pkg);
    return true;
  } catch {
    return false;
  }
});

if (discovered.length) {
  console.log(`[lint] Using discovered local packages: ${discovered.join(', ')}`);
}

const result = spawnSync('node', ['./node_modules/eslint/bin/eslint.js', 'src/'], {
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
