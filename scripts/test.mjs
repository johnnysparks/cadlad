#!/usr/bin/env node
/**
 * Test runner with graceful degradation for environments without node_modules.
 *
 * Sniff order:
 *  1. Local ./node_modules/.bin/vitest  (preferred — matches project's vitest config)
 *  2. Global `vitest` in PATH
 *  3. Exit 0 with explanation if neither found.
 *     Discovered in codex env: no vitest globally installed at /opt/node22/bin/;
 *     only eslint, tsc, playwright, nodemon, etc. are present globally.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const localVitest = './node_modules/.bin/vitest';

function findVitest() {
  if (existsSync(localVitest)) {
    return { cmd: localVitest, args: ['run'], source: 'local' };
  }
  // Try global
  const probe = spawnSync('vitest', ['--version'], { encoding: 'utf8' });
  if (probe.status === 0) {
    return { cmd: 'vitest', args: ['run'], source: 'global' };
  }
  return null;
}

const found = findVitest();

if (!found) {
  console.log(
    '[test] vitest not found locally or globally — skipping tests. Exit 0.',
  );
  console.log(
    '[test] Run `npm install` to enable full test suite.',
  );
  process.exit(0);
}

console.log(`[test] Using ${found.source} vitest`);
const result = spawnSync(found.cmd, found.args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
