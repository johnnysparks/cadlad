/**
 * Monaco editor setup for the CadLad studio.
 */

import * as monaco from "monaco-editor";

// Configure Monaco workers for web
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "typescript" || label === "javascript") {
      return new Worker(
        new URL("monaco-editor/esm/vs/language/typescript/ts.worker.js", import.meta.url),
        { type: "module" },
      );
    }
    return new Worker(
      new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url),
      { type: "module" },
    );
  },
};

const DEFAULT_CODE = `// CadLad — parametric CAD in TypeScript
// Press Ctrl+Enter to run

const width = param("Width", 60, { min: 20, max: 200, unit: "mm" });
const depth = param("Depth", 40, { min: 20, max: 200, unit: "mm" });
const height = param("Height", 20, { min: 5, max: 100, unit: "mm" });
const holeR = param("Hole Radius", 8, { min: 2, max: 30, unit: "mm" });

const base = box(width, depth, height).color("#5f87c6");
const hole = cylinder(height + 2, holeR);
const part = base.subtract(hole);

return part;
`;

/** CadLad API type declarations for IntelliSense */
const CADLAD_TYPES = `
declare function param(name: string, defaultValue: number, opts?: {
  min?: number; max?: number; step?: number; unit?: string;
}): number;

declare function box(x: number, y: number, z: number): Solid;
declare function cylinder(height: number, radiusBottom: number, radiusTop?: number, segments?: number): Solid;
declare function sphere(radius: number, segments?: number): Solid;
declare function roundedRect(width: number, depth: number, radius: number, height?: number): Solid;
declare function assembly(name: string): Assembly;

declare function rect(width: number, height: number): Sketch;
declare function circle(radius: number, segments?: number): Sketch;

declare class Solid {
  union(other: Solid): Solid;
  subtract(other: Solid): Solid;
  intersect(other: Solid): Solid;
  translate(x: number, y: number, z: number): Solid;
  rotate(x: number, y: number, z: number): Solid;
  scale(x: number, y?: number, z?: number): Solid;
  mirror(normal: [number, number, number]): Solid;
  color(c: string | [number, number, number, number]): Solid;
  named(name: string): Solid;
  volume(): number;
  surfaceArea(): number;
}

declare class Sketch {
  static begin(x?: number, y?: number): Sketch;
  moveTo(x: number, y: number): Sketch;
  lineTo(x: number, y: number): Sketch;
  lineBy(dx: number, dy: number): Sketch;
  arcTo(x: number, y: number, radius: number, segments?: number): Sketch;
  close(): Sketch;
  extrude(height: number): Solid;
  revolve(segments?: number): Solid;
  points(): [number, number][];
}

declare class Assembly {
  add(name: string, solid: Solid, position?: [number, number, number]): Assembly;
  toSolid(): Solid;
  toBodies(): any[];
}
`;

export function createEditor(container: HTMLElement): monaco.editor.IStandaloneCodeEditor {
  // Add CadLad type declarations for IntelliSense
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    CADLAD_TYPES,
    "cadlad.d.ts",
  );

  const editor = monaco.editor.create(container, {
    value: DEFAULT_CODE,
    language: "javascript",
    theme: "vs-dark",
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontLigatures: true,
    minimap: { enabled: false },
    lineNumbers: "on",
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    padding: { top: 8 },
    renderLineHighlight: "line",
    bracketPairColorization: { enabled: true },
    suggest: { showKeywords: true },
  });

  return editor;
}

export { DEFAULT_CODE };
