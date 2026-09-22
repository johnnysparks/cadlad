import { afterEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { discoverModels } from "./model-files.mjs";
import { exampleModules } from "../apps/studio-web/gallery/examples.ts";
import { fileURLToPath } from "node:url";

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "cadlad-models-"));
  roots.push(root);
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "return box(1, 1, 1);");
  }
  return root;
}

it("discovers every .forge.ts file one directory deep, sorted, without legacy or flat fallbacks", async () => {
  const root = fixture(["z/b.forge.ts", "a/second.forge.ts", "a/first.forge.ts",
    "a/old.forge.js", "flat.forge.ts", "a/nested/hidden.forge.ts", "a/README.md"]);
  expect(await discoverModels(root)).toEqual(["a/first.forge.ts", "a/second.forge.ts", "z/b.forge.ts"]);
});

it("rejects an empty or legacy-only corpus", async () => {
  await expect(discoverModels(fixture([]))).rejects.toThrow("No models found");
  await expect(discoverModels(fixture(["old/old.forge.js"]))).rejects.toThrow("No models found");
});

it("reports a missing directory instead of succeeding with no work", async () => {
  await expect(discoverModels(join(fixture([]), "missing"))).rejects.toThrow();
});

it("snapshot discovery and the actual Vite gallery glob select the same corpus", async () => {
  const root = fileURLToPath(new URL("../content/projects/", import.meta.url));
  expect(await discoverModels(root)).toEqual(
    Object.keys(exampleModules).map((path) => path.split("content/projects/")[1]).sort(),
  );
});
