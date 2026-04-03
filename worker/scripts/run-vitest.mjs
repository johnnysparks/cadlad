#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const vitestBin = path.resolve(scriptDir, '../node_modules/vitest/vitest.mjs');

const rawArgs = process.argv.slice(2);
const filteredArgs = [];
let requestedRunInBand = false;

for (const arg of rawArgs) {
  if (arg === '--runInBand') {
    requestedRunInBand = true;
    continue;
  }
  filteredArgs.push(arg);
}

if (requestedRunInBand) {
  filteredArgs.push('--maxWorkers=1');
  console.warn('[worker:test] Ignoring Jest-only --runInBand; using Vitest --maxWorkers=1 instead.');
}

const child = spawn(process.execPath, [vitestBin, 'run', ...filteredArgs], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
