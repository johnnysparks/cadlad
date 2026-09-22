import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export async function loadModelSource(file: string): Promise<string> {
  const absolutePath = resolve(file);
  const rawSource = readFileSync(absolutePath, "utf-8");

  if (!file.endsWith(".forge.ts")) {
    throw new Error(
      `Unsupported model file: ${file}. CadLad now accepts only .forge.ts files in the CLI.`,
    );
  }

  // Compilation belongs to evaluateModel so CLI, Studio, and eval all receive
  // the same source and the same syntax/runtime diagnostics.
  return rawSource;
}
