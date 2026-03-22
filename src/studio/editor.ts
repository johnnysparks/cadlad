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

const DEFAULT_CODE = `// CadLad — Parametric Trophy Cup
// Drag the sliders to reshape it!

const baseR = param("Base Radius", 20, { min: 12, max: 35, unit: "mm" });
const stemR = param("Stem Radius", 5, { min: 3, max: 12, unit: "mm" });
const stemH = param("Stem Height", 25, { min: 10, max: 50, unit: "mm" });
const bowlR = param("Bowl Radius", 22, { min: 14, max: 40, unit: "mm" });
const bowlH = param("Bowl Height", 30, { min: 15, max: 50, unit: "mm" });
const wall  = param("Wall Thickness", 3, { min: 1.5, max: 6, unit: "mm" });

// Base — wide disc sitting on the ground
const base = cylinder(6, baseR)
  .translate(0, 0, 3)
  .color("#c9a84c");

// Stem — narrow column rising from the base
const stem = cylinder(stemH, stemR)
  .translate(0, 0, 6 + stemH / 2)
  .color("#c9a84c");

// Bowl — tapered hollow cup (wider at top)
const outer = cylinder(bowlH, stemR + 4, bowlR);
const inner = cylinder(bowlH, stemR + 4 - wall, bowlR - wall)
  .translate(0, 0, wall);
const bowl = outer.subtract(inner)
  .translate(0, 0, 6 + stemH + bowlH / 2)
  .color("#dbb84c");

// Handles on each side
const handle = box(6, 4, bowlH * 0.5).color("#b89830");
const lHandle = handle.translate(-bowlR - 1, 0, 6 + stemH + bowlH * 0.5);
const rHandle = handle.translate( bowlR + 1, 0, 6 + stemH + bowlH * 0.5);

return base
  .union(stem)
  .union(bowl)
  .union(lHandle)
  .union(rHandle)
  .named("Trophy Cup")
  .color("#c9a84c");
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
