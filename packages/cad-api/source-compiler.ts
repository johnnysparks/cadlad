import * as typescript from "typescript";

export type CompileModelSourceOptions = {
  fileName?: string;
};

/** Compile a .forge.ts source string for the shared model runtime. */
export function compileModelSource(
  source: string,
  options: CompileModelSourceOptions = {},
): string {
  const fileName = options.fileName ?? "model.forge.ts";
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: {
      target: typescript.ScriptTarget.ES2020,
      module: typescript.ModuleKind.ES2020,
    },
    fileName,
    reportDiagnostics: true,
  });

  const diagnostics = transpiled.diagnostics?.filter(
    (diagnostic) => diagnostic.category === typescript.DiagnosticCategory.Error,
  ) ?? [];

  if (diagnostics.length > 0) {
    const host: typescript.FormatDiagnosticsHost = {
      getCanonicalFileName: (name: string) => name,
      getCurrentDirectory: () => typeof process === "undefined" ? "/" : process.cwd(),
      getNewLine: () => "\n",
    };
    const message = typescript.formatDiagnosticsWithColorAndContext(diagnostics, host);
    throw new Error(`Failed to transpile ${fileName}:\n${message}`);
  }

  return transpiled.outputText;
}
