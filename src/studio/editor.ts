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

const DEFAULT_CODE = `// CadLad — Trophy Cup Redux
// Cleaner silhouette: revolved cup, stepped base, carved side handles.

const baseR         = param("Base Radius", 24, { min: 14, max: 40, unit: "mm" });
const baseH         = param("Base Height", 6, { min: 4, max: 12, unit: "mm" });
const stemR         = param("Stem Radius", 4.8, { min: 3, max: 10, unit: "mm" });
const stemH         = param("Stem Height", 26, { min: 12, max: 50, unit: "mm" });

const cupR          = param("Cup Radius", 23, { min: 14, max: 40, unit: "mm" });
const cupH          = param("Cup Height", 28, { min: 16, max: 50, unit: "mm" });
const throatR       = param("Throat Radius", 11, { min: 6, max: 20, unit: "mm" });
const footR         = param("Cup Foot Radius", 8.5, { min: 4, max: 16, unit: "mm" });
const wall          = param("Wall Thickness", 2.4, { min: 1.2, max: 5, unit: "mm" });

const handleReach   = param("Handle Reach", 17, { min: 8, max: 30, unit: "mm" });
const handleWidth   = param("Handle Width", 5.5, { min: 3, max: 12, unit: "mm" });
const handleThick   = param("Handle Thickness", 3.2, { min: 1.5, max: 8, unit: "mm" });
const handleLift    = param("Handle Lift", 8, { min: 2, max: 18, unit: "mm" });

const goldA = "#d8b24a";
const goldB = "#c49b34";
const goldC = "#a88224";

// ── Base and stem ─────────────────────────────────────────────

const base = cylinder(baseH, baseR)
  .translate(0, 0, baseH / 2)
  .color(goldC);

const plinth = cylinder(4, baseR * 0.72, baseR * 0.58)
  .translate(0, 0, baseH + 2)
  .color(goldB);

const stem = cylinder(stemH, stemR * 1.12, stemR * 0.86)
  .translate(0, 0, baseH + 4 + stemH / 2)
  .color(goldA);

const cupZ = baseH + 4 + stemH;

const collar = cylinder(4, throatR * 0.9, throatR * 1.08)
  .translate(0, 0, cupZ + 2)
  .color(goldB);

// ── Cup, revolved outer and inner profiles ───────────────────

const outerProfile = Sketch.begin(0, 0)
  .lineTo(footR, 0)
  .lineTo(throatR, cupH * 0.18)
  .lineTo(cupR * 0.84, cupH * 0.68)
  .lineTo(cupR, cupH)
  .lineTo(0, cupH)
  .lineTo(0, 0)
  .close();

const outerCup = outerProfile
  .revolve(64)
  .translate(0, 0, cupZ)
  .color(goldA);

const innerFootR = Math.max(footR - wall, 1);
const innerThroatR = Math.max(throatR - wall, innerFootR + 0.5);
const innerTopR = Math.max(cupR - wall, innerThroatR + 1);
const innerH = cupH - wall;

const innerProfile = Sketch.begin(0, wall)
  .lineTo(innerFootR, wall)
  .lineTo(innerThroatR, wall + innerH * 0.18)
  .lineTo(innerTopR * 0.84, wall + innerH * 0.68)
  .lineTo(innerTopR, cupH + 2)
  .lineTo(0, cupH + 2)
  .lineTo(0, wall)
  .close();

const innerCup = innerProfile
  .revolve(64)
  .translate(0, 0, cupZ);

const cup = outerCup
  .subtract(innerCup)
  .color(goldA);

// ── Handles, side profile extruded through Y ─────────────────

const outerX = cupR - 1.0;                 // overlap into the wall slightly
const tipX = cupR + handleReach;
const lowerAttachZ = cupZ + cupH * 0.34;
const upperAttachZ = cupZ + cupH * 0.88;
const topZ = cupZ + cupH + handleLift;
const lowZ = cupZ + cupH * 0.16;

const handleOuter2D = Sketch.begin(outerX, lowerAttachZ)
  .lineTo(tipX, lowZ)
  .lineTo(tipX, topZ)
  .lineTo(outerX, upperAttachZ)
  .close();

const handleInner2D = Sketch.begin(outerX + handleThick, lowerAttachZ + handleThick * 1.2)
  .lineTo(tipX - handleThick * 1.6, lowZ + handleThick)
  .lineTo(tipX - handleThick * 1.6, topZ - handleThick)
  .lineTo(outerX + handleThick, upperAttachZ - handleThick * 1.2)
  .close();

const handleOuter = handleOuter2D
  .extrudeAlong([0, 1, 0], handleWidth)
  .translate(0, -handleWidth / 2, 0);

const handleInner = handleInner2D
  .extrudeAlong([0, 1, 0], handleWidth + 2)
  .translate(0, -handleWidth / 2 - 1, 0);

// Carve away anything that would show through inside the cup
const cupCarve = cylinder(cupH * 2, cupR - wall - 0.75)
  .translate(0, 0, cupZ + cupH / 2);

const rightHandle = handleOuter
  .subtract(handleInner)
  .subtract(cupCarve)
  .color(goldB);

const leftHandle = rightHandle
  .mirror([1, 0, 0])
  .color(goldB);

// ── Assembly ──────────────────────────────────────────────────

return {
  model: assembly("Trophy Cup Redux")
    .add("Base", base)
    .add("Plinth", plinth)
    .add("Stem", stem)
    .add("Collar", collar)
    .add("Cup", cup)
    .add("Left Handle", leftHandle)
    .add("Right Handle", rightHandle),
  camera: [75, -55, 50]
};
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
type CameraView = "front" | "back" | "top" | "bottom" | "left" | "right" | "iso";
type CrossSectionAxis = "x" | "y" | "z";
type Vec3 = [number, number, number];
type Body = { mesh: { positions: Float32Array; indices: Uint32Array } };

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
  mirrorUnion(normal: [number, number, number]): Solid;
  linearPattern(count: number, stepX?: number, stepY?: number, stepZ?: number): Solid;
  circularPattern(
    count: number,
    axis?: "x" | "y" | "z",
    totalAngleDeg?: number,
    center?: [number, number, number]
  ): Solid;
  color(c: string | [number, number, number, number]): Solid;
  named(name: string): Solid;
  smooth(subdivisions?: number, minSharpAngle?: number): Solid;
  fillet(subdivisions?: number): Solid;
  volume(): number;
  surfaceArea(): number;
}

declare class Sketch {
  static begin(x?: number, y?: number): Sketch;
  moveTo(x: number, y: number): Sketch;
  lineTo(x: number, y: number): Sketch;
  lineBy(dx: number, dy: number): Sketch;
  arcTo(x: number, y: number, radius: number, segments?: number): Sketch;
  tangentArcTo(x: number, y: number, segments?: number): Sketch;
  close(): Sketch;
  validate(): Array<{ type: "error" | "warning"; message: string }>;
  extrude(height: number): Solid;
  extrudeAlong(direction: [number, number, number], height: number): Solid;
  revolve(segments?: number): Solid;
  points(): [number, number][];
}

declare class Assembly {
  add(name: string, solid: Solid, position?: [number, number, number]): Assembly;
  toSolid(): Solid;
  toBodies(): Body[];
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
