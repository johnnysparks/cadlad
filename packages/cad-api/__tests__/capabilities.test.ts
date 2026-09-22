import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  CAPABILITIES,
  CAPABILITY_BINDINGS,
  buildCapabilityDeclarations,
  buildCapabilityReference,
  getRuntimeCapabilityNames,
} from "../capabilities.js";
import { evaluateModel } from "../runtime.js";
import { loadModelSource } from "../../../apps/cli/source-loader.js";
import { buildSystemPrompt } from "@cadlad/eval/prompts.js";
import type { TaskSpec } from "@cadlad/eval/types.js";

describe("capability registry", () => {
  it("keeps runtime bindings, references, and declarations in sync", () => {
    const reference = buildCapabilityReference();
    const declarations = buildCapabilityDeclarations();
    const globals = CAPABILITIES.filter((capability) => capability.exposure === "global");

    expect(getRuntimeCapabilityNames()).toEqual(globals.map((capability) => capability.name));
    for (const capability of globals) {
      expect(CAPABILITY_BINDINGS[capability.name]).toBeDefined();
      expect(reference).toContain(`- ${capability.name}: ${capability.signature}`);
      if (capability.declaration) {
        expect(declarations).toContain(capability.declaration);
      }
    }
    for (const capability of CAPABILITIES) {
      expect(reference).toContain(`- ${capability.name}:`);
    }
  });

  it("exposes the typed and specialized helpers through the model runtime", async () => {
    const result = await evaluateModel(`
      const width: number = 40;
      const profile = slot(width, 12, 6);
      const body: Solid = profile.extrude(10);
      return body;
    `);

    expect(result.errors).toEqual([]);
    expect(result.bodies).toHaveLength(1);
    expect(result.bodies[0].mesh.indices.length).toBeGreaterThan(0);
  });

  it("runs every registry-advertised example through the shared CLI, Studio, and eval runtime path", async () => {
    const examples = CAPABILITIES.filter((capability) => capability.example);
    const task: TaskSpec = {
      id: "capability-registry",
      difficulty: 1,
      description: "Exercise the shared capability registry.",
      acceptance: {},
      api_surface: [],
      reference_images: [],
    };
    const prompt = buildSystemPrompt(task);
    const temp = mkdtempSync(join(tmpdir(), "cadlad-capabilities-"));
    try {
      for (const capability of examples) {
        expect(prompt).toContain(capability.example as string);
        const file = join(temp, `${capability.name}.forge.ts`);
        writeFileSync(file, capability.example as string, "utf8");
        const browserSource = capability.example as string;
        const cliSource = await loadModelSource(file);
        const browser = await evaluateModel(browserSource);
        const cli = await evaluateModel(cliSource);
        expect(browser.errors, capability.name).toEqual([]);
        expect(cli.errors, capability.name).toEqual([]);
        expect(cli.evaluation.stats.data, capability.name).toEqual(browser.evaluation.stats.data);
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }, 30_000);

  it("keeps syntax diagnostics identical when loaded by the CLI or evaluated directly", async () => {
    const source = "return box(";
    const temp = mkdtempSync(join(tmpdir(), "cadlad-diagnostics-"));
    try {
      const file = join(temp, "invalid.forge.ts");
      writeFileSync(file, source, "utf8");
      const loaded = await loadModelSource(file);
      const direct = await evaluateModel(source);
      const cli = await evaluateModel(loaded);

      expect(loaded).toBe(source);
      expect(cli.errors).toEqual(direct.errors);
      expect(cli.diagnostics).toEqual(direct.diagnostics);
      expect(cli.evaluation.summary).toEqual(direct.evaluation.summary);
      expect(cli.evaluation.stats.data).toEqual(direct.evaluation.stats.data);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
