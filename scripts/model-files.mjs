import { readdir } from "node:fs/promises";
import { join } from "node:path";

// Same one-level corpus layout as the gallery's Vite glob. No legacy fallback.
export async function discoverModels(root) {
  const files = [];
  for (const project of await readdir(root, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    for (const file of await readdir(join(root, project.name), { withFileTypes: true })) {
      if (file.isFile() && file.name.endsWith(".forge.ts")) {
        files.push(join(project.name, file.name));
      }
    }
  }
  if (files.length === 0) throw new Error(`No models found in ${root}/*/*.forge.ts`);
  return files.sort();
}
