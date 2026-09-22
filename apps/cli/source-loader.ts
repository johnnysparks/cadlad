import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileModelSource } from "@cadlad/api/source-compiler.js";

export async function loadModelSource(file: string): Promise<string> {
  const absolutePath = resolve(file);
  const rawSource = readFileSync(absolutePath, "utf-8");

  if (!file.endsWith(".forge.ts")) {
    throw new Error(
      `Unsupported model file: ${file}. CadLad now accepts only .forge.ts files in the CLI.`,
    );
  }

  return compileModelSource(rawSource, { fileName: absolutePath });
}
