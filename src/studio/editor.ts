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

const DEFAULT_CODE = `// CadLad — Parametric Desk Organizer
// Tweak the sliders on the right, then press Ctrl+Enter to rebuild!

const baseW = param("Base Width", 120, { min: 80, max: 180, unit: "mm" });
const baseD = param("Base Depth", 60, { min: 40, max: 90, unit: "mm" });
const baseH = param("Base Height", 5, { min: 3, max: 10, unit: "mm" });
const cupR = param("Pen Cup Radius", 15, { min: 10, max: 25, unit: "mm" });
const cupH = param("Pen Cup Height", 50, { min: 30, max: 80, unit: "mm" });
const cupWall = param("Cup Wall", 2, { min: 1.5, max: 4, unit: "mm" });
const slotW = param("Card Slot Width", 40, { min: 25, max: 60, unit: "mm" });
const slotH = param("Card Slot Height", 25, { min: 15, max: 40, unit: "mm" });
const dockW = param("Phone Dock Width", 35, { min: 25, max: 50, unit: "mm" });
const dockAngle = param("Dock Angle", 15, { min: 5, max: 30 });

// Base platform with rounded corners
const base = roundedRect(baseW, baseD, 4, baseH)
  .translate(0, 0, baseH / 2)
  .color("#445566");

// Pen cup — hollow cylinder, left side
const cupOuter = cylinder(cupH, cupR).color("#6699bb");
const cupInner = cylinder(cupH + 1, cupR - cupWall);
const cup = cupOuter.subtract(cupInner)
  .translate(-baseW / 2 + cupR + 8, 0, baseH + cupH / 2);

// Card slot — angled holder, center
const slotBack = box(slotW, 3, slotH).color("#bb7744");
const slotLip = box(slotW, 12, 3)
  .translate(0, -6 + 1.5, -slotH / 2 + 1.5)
  .color("#bb7744");
const cardSlot = slotBack.union(slotLip)
  .rotate(8, 0, 0)
  .translate(0, 0, baseH + slotH / 2 + 2);

// Phone dock — angled cradle, right side
const dockBack = box(dockW, 4, 40).color("#66aa77");
const dockLip = box(dockW, 10, 6)
  .translate(0, -3, -17)
  .color("#66aa77");
const phoneDock = dockBack.union(dockLip)
  .rotate(dockAngle, 0, 0)
  .translate(baseW / 2 - dockW / 2 - 8, 0, baseH + 22);

// Decorative accent on pen cup
const accent = sphere(4)
  .translate(-baseW / 2 + cupR + 8, 0, baseH + cupH + 4)
  .color("#dd6655");

// Assemble — each part keeps its own color
const organizer = assembly("Desk Organizer")
  .add("base", base)
  .add("pen-cup", cup)
  .add("card-slot", cardSlot)
  .add("phone-dock", phoneDock)
  .add("accent", accent);

return organizer;
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
