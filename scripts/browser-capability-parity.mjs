#!/usr/bin/env node

/**
 * Execute every registry example in the actual Studio browser worker and
 * compare its serializable result with the shared Node/eval runtime.
 *
 * Requires a running Vite server and a Chrome/Chromium executable. The
 * renderer accepts CHROME_PATH for environments without a system browser.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { CAPABILITIES } from "../packages/cad-api/capabilities.ts";
import { evaluateModel } from "../packages/cad-api/runtime.ts";
import { RenderSession } from "../packages/eval/renderer.ts";

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}

function parityProjection(result) {
  return {
    errors: result.errors,
    diagnostics: result.diagnostics,
    summary: result.summary ?? result.evaluation?.summary,
    stats: result.stats?.data ?? result.evaluation?.stats?.data,
  };
}

const baseUrl = argValue("--url", "http://127.0.0.1:5173");
const examples = CAPABILITIES.filter((capability) => capability.example);
const outputDir = await mkdtemp(join(tmpdir(), "cadlad-browser-capability-"));
const session = await RenderSession.start({ baseUrl });

try {
  for (const capability of examples) {
    const source = capability.example;
    const nodeResult = await evaluateModel(source);
    const browserResult = await session.evaluateCode(source);
    assert.deepEqual(
      parityProjection(browserResult),
      {
        errors: nodeResult.errors,
        diagnostics: nodeResult.diagnostics,
        summary: nodeResult.evaluation.summary,
        stats: nodeResult.evaluation.stats.data,
      },
      `${capability.name} browser/runtime parity`,
    );

    const paths = await session.renderCode(source, outputDir, capability.name, ["iso"]);
    assert.equal(paths.length, 1, `${capability.name} should capture one browser view`);
    console.log(`[browser-parity] ${capability.name}: pass (${paths[0]})`);
  }

  const invalidSource = "return box(";
  const nodeInvalid = await evaluateModel(invalidSource);
  const browserInvalid = await session.evaluateCode(invalidSource);
  assert.deepEqual(
    parityProjection(browserInvalid),
    {
      errors: nodeInvalid.errors,
      diagnostics: nodeInvalid.diagnostics,
      summary: nodeInvalid.evaluation.summary,
      stats: nodeInvalid.evaluation.stats.data,
    },
    "syntax diagnostics browser/runtime parity",
  );
  console.log("[browser-parity] invalid syntax diagnostics: pass");
} finally {
  await session.close();
  await rm(outputDir, { recursive: true, force: true });
}
