import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { exampleModules, examples } from "./examples.js";
import { loadModelSource } from "../../cli/source-loader.js";
import { evaluateModel } from "@cadlad/api/runtime.js";

const root = resolve("content/projects");
const files = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => readdirSync(resolve(root, entry.name))
    .filter((file) => file.endsWith(".forge.ts"))
    .map((file) => `${entry.name}/${file}`)).sort();

it("the actual Vite gallery glob discovers the entire nonempty corpus", () => {
  expect(files.length).toBeGreaterThan(0);
  expect(Object.keys(exampleModules).map((path) => path.split("content/projects/")[1]).sort()).toEqual(files);
  expect(examples).toHaveLength(files.length);
  expect(examples.map((example) => example.name)).toEqual(examples.map((example) => example.name).sort());
  for (const [path, source] of Object.entries(exampleModules)) {
    expect(source).toBe(readFileSync(resolve(root, path.split("content/projects/")[1]), "utf8"));
  }
});

describe("retained corpus", () => {
  for (const file of files) {
    it(`${file} loads through CLI and gallery with equivalent valid geometry`, async () => {
      const gallerySource = exampleModules[`../../../content/projects/${file}`];
      const cliSource = await loadModelSource(resolve(root, file));
      const gallery = await evaluateModel(gallerySource);
      const cli = await evaluateModel(cliSource);
      expect(gallery.errors).toEqual([]);
      expect(cli.errors).toEqual([]);
      expect(gallery.bodies.length).toBeGreaterThan(0);
      expect(cli.evaluation.stats.data).toEqual(gallery.evaluation.stats.data);
      expect(cli.diagnostics).toEqual(gallery.diagnostics);
      expect(cli.evaluation.summary).toEqual(gallery.evaluation.summary);
      for (const body of gallery.bodies) {
        expect(body.mesh.indices.length).toBeGreaterThan(0);
        expect(Array.from(body.mesh.positions).every(Number.isFinite)).toBe(true);
      }
    }, 30_000);
  }
});
