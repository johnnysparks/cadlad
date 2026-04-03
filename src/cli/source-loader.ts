import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export async function loadModelSource(file: string): Promise<string> {
  const absolutePath = resolve(file);
  const rawSource = readFileSync(absolutePath, "utf-8");

  if (!file.endsWith(".forge.ts")) {
    return rawSource;
  }

  let ts: typeof import("typescript");
  try {
    ts = await import("typescript");
  } catch {
    throw new Error(
      "TypeScript is required to run .forge.ts files. Install it with `npm install --save-dev typescript`.",
    );
  }

  const transpiled = ts.transpileModule(rawSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ES2020,
    },
    fileName: absolutePath,
    reportDiagnostics: true,
  });

  const diagnostics = transpiled.diagnostics?.filter(
    (diag) => diag.category === ts.DiagnosticCategory.Error,
  ) ?? [];

  if (diagnostics.length > 0) {
    const host: import("typescript").FormatDiagnosticsHost = {
      getCanonicalFileName: (name: string) => name,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    };
    const message = ts.formatDiagnosticsWithColorAndContext(diagnostics, host);
    throw new Error(`Failed to transpile ${file}:\n${message}`);
  }

  return transpiled.outputText;
}
