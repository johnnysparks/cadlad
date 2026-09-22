/**
 * The single source of truth for the model authoring surface.
 *
 * Runtime bindings, editor declarations, and agent prompts are generated from
 * this registry so a capability cannot be documented without being usable.
 */

import { param } from "./params.js";
import { Sketch, rect, circle, slot, lShape, channel, tShape } from "./sketch.js";
import { Assembly, assembly } from "./assembly.js";
import { constraint } from "./constraints.js";
import { defineScene, mm, paramSweepTest } from "./scene-contract.js";
import { plane, axis, datum } from "./reference.js";
import { toolBody } from "./toolbody.js";
import { Solid } from "@cadlad/kernel/solid.js";
import {
  box,
  cylinder,
  sphere,
  roundedRect,
  roundedBox,
  taperedBox,
  sweep,
  loft,
} from "@cadlad/kernel/primitives.js";

export type CapabilityExposure = "global" | "method";
export type CapabilityDetailLevel = "broad" | "refined";

export type CapabilityDescriptor = {
  name: string;
  category: string;
  exposure: CapabilityExposure;
  signature: string;
  description: string;
  detailLevel: CapabilityDetailLevel;
  example?: string;
  notes?: string;
  declaration?: string;
};

type GlobalCapability = CapabilityDescriptor & {
  exposure: "global";
  binding: unknown;
};

const globalCapabilities: GlobalCapability[] = [
  {
    name: "param", category: "Parameters", exposure: "global", binding: param,
    signature: "param(name, defaultValue, opts?)",
    description: "Declare a live numeric parameter for the editor and evaluator.", detailLevel: "broad",
    example: 'const width = param("Width", 120, { min: 60, max: 220, unit: "mm" });\nreturn box(width, 60, 18);',
    declaration: 'declare function param(name: string, defaultValue: number, opts?: { min?: number; max?: number; step?: number; unit?: string }): number;',
  },
  {
    name: "box", category: "Primitives", exposure: "global", binding: box,
    signature: "box(width, depth, height)", description: "Create a centered axis-aligned box.", detailLevel: "broad",
    example: "return box(120, 60, 18);",
    declaration: "declare function box(width: number, depth: number, height: number): Solid;",
  },
  {
    name: "cylinder", category: "Primitives", exposure: "global", binding: cylinder,
    signature: "cylinder(height, radiusBottom, radiusTop?, segments?)", description: "Create a Z-aligned cylinder or tapered cylinder.", detailLevel: "broad",
    example: "return cylinder(700, 25).translate(0, 0, 350);",
    declaration: "declare function cylinder(height: number, radiusBottom: number, radiusTop?: number, segments?: number): Solid;",
  },
  {
    name: "sphere", category: "Primitives", exposure: "global", binding: sphere,
    signature: "sphere(radius, segments?)", description: "Create a centered sphere.", detailLevel: "refined",
    declaration: "declare function sphere(radius: number, segments?: number): Solid;",
  },
  {
    name: "roundedRect", category: "Primitives", exposure: "global", binding: roundedRect,
    signature: "roundedRect(width, depth, radius, height?)", description: "Create a rounded rectangle extruded along Z.", detailLevel: "refined",
    declaration: "declare function roundedRect(width: number, depth: number, radius: number, height?: number): Solid;",
  },
  {
    name: "roundedBox", category: "Primitives", exposure: "global", binding: roundedBox,
    signature: "roundedBox(width, depth, height, radius, segments?)", description: "Create a box with rounded edges and corners.", detailLevel: "refined",
    declaration: "declare function roundedBox(width: number, depth: number, height: number, radius: number, segments?: number): Solid;",
  },
  {
    name: "taperedBox", category: "Primitives", exposure: "global", binding: taperedBox,
    signature: "taperedBox(height, widthBottom, depthBottom, widthTop, depthTop)", description: "Create a box that tapers between two rectangular sections.", detailLevel: "refined",
    declaration: "declare function taperedBox(height: number, widthBottom: number, depthBottom: number, widthTop: number, depthTop: number): Solid;",
  },
  {
    name: "sweep", category: "Primitives", exposure: "global", binding: sweep,
    signature: "sweep(profile, path)", description: "Sweep a 2D polygon along a 3D path.", detailLevel: "refined",
    declaration: "declare function sweep(profile: Vec2[], path: Vec3[]): Solid;",
  },
  {
    name: "loft", category: "Primitives", exposure: "global", binding: loft,
    signature: "loft(profiles, heights)", description: "Loft matching polygon profiles between heights.", detailLevel: "refined",
    declaration: "declare function loft(profiles: Vec2[][], heights: number[]): Solid;",
  },
  {
    name: "Sketch", category: "Sketching", exposure: "global", binding: Sketch,
    signature: "Sketch.begin(x?, y?)", description: "Build a validated 2D profile with chained drawing operations.", detailLevel: "broad",
    example: "const profile = Sketch.begin(-20, -10).lineTo(20, -10).lineTo(20, 10).lineTo(-20, 10).close();\nreturn profile.extrude(10);",
    declaration: "declare class Sketch { static begin(x?: number, y?: number): Sketch; moveTo(x: number, y: number): Sketch; lineTo(x: number, y: number): Sketch; lineBy(dx: number, dy: number): Sketch; arcTo(x: number, y: number, radius: number, segments?: number): Sketch; tangentArcTo(x: number, y: number, segments?: number): Sketch; close(): Sketch; validate(): Array<{ type: 'error' | 'warning'; message: string }>; extrude(height: number): Solid; sweep(path: Vec3[]): Solid; extrudeAlong(direction: Vec3, height: number): Solid; revolve(segments?: number): Solid; points(): Vec2[]; }",
  },
  {
    name: "rect", category: "Sketching", exposure: "global", binding: rect,
    signature: "rect(width, height)", description: "Create a centered rectangular sketch.", detailLevel: "broad",
    declaration: "declare function rect(width: number, height: number): Sketch;",
  },
  {
    name: "circle", category: "Sketching", exposure: "global", binding: circle,
    signature: "circle(radius, segments?)", description: "Create a centered circular sketch.", detailLevel: "broad",
    declaration: "declare function circle(radius: number, segments?: number): Sketch;",
  },
  {
    name: "slot", category: "Sketching", exposure: "global", binding: slot,
    signature: "slot(width, height, endRadius)", description: "Create a slot profile.", detailLevel: "refined",
    declaration: "declare function slot(width: number, height: number, endRadius: number): Sketch;",
  },
  {
    name: "lShape", category: "Sketching", exposure: "global", binding: lShape,
    signature: "lShape(w1, h1, w2, h2)", description: "Create an L-shaped profile.", detailLevel: "refined",
    declaration: "declare function lShape(w1: number, h1: number, w2: number, h2: number): Sketch;",
  },
  {
    name: "channel", category: "Sketching", exposure: "global", binding: channel,
    signature: "channel(width, height, flangeWidth)", description: "Create a U/channel profile.", detailLevel: "refined",
    declaration: "declare function channel(width: number, height: number, flangeWidth: number): Sketch;",
  },
  {
    name: "tShape", category: "Sketching", exposure: "global", binding: tShape,
    signature: "tShape(w1, h1, w2, h2)", description: "Create a T-shaped profile.", detailLevel: "refined",
    declaration: "declare function tShape(w1: number, h1: number, w2: number, h2: number): Sketch;",
  },
  {
    name: "assembly", category: "Assemblies", exposure: "global", binding: assembly,
    signature: "assembly(name)", description: "Create a named multi-part assembly.", detailLevel: "broad",
    example: 'const top = box(120, 60, 18);\nconst leg = cylinder(700, 25).translate(0, 0, 350);\nreturn assembly("Table").add("Top", top).add("Leg", leg);',
    declaration: "declare function assembly(name: string): Assembly;",
  },
  {
    name: "Solid", category: "Types", exposure: "global", binding: Solid,
    signature: "Solid", description: "The solid value and method type returned by constructors.", detailLevel: "broad",
  },
  {
    name: "Assembly", category: "Types", exposure: "global", binding: Assembly,
    signature: "Assembly", description: "The multi-part assembly value type.", detailLevel: "broad",
  },
  {
    name: "defineScene", category: "Scenes", exposure: "global", binding: defineScene,
    signature: "defineScene({ model, params?, validators?, tests?, constraints? })", description: "Declare model intent, parameters, and validation hooks.", detailLevel: "refined",
    declaration: "declare function defineScene<TModel>(scene: { model: TModel | ((context: { params: Record<string, number | string | boolean> }) => TModel); params?: Record<string, { value: number | string | boolean; label?: string; min?: number; max?: number; step?: number; unit?: string }>; validators?: unknown[]; tests?: unknown[]; geometry?: unknown; constraints?: unknown[] }): { model: TModel };",
  },
  {
    name: "mm", category: "Scenes", exposure: "global", binding: mm,
    signature: "mm(value)", description: "Mark a numeric value as millimeters in scene definitions.", detailLevel: "refined",
    declaration: "declare function mm(value: number): number;",
  },
  {
    name: "constraint", category: "Scenes", exposure: "global", binding: constraint,
    signature: "constraint(kind, config)", description: "Declare a scene-level design constraint.", detailLevel: "refined",
    declaration: "declare function constraint(kind: 'wall_thickness' | 'symmetry' | 'clearance' | 'max_overhang', config: Record<string, unknown>): unknown;",
  },
  {
    name: "paramSweepTest", category: "Scenes", exposure: "global", binding: paramSweepTest,
    signature: "paramSweepTest(paramName, values)", description: "Test model stability across selected parameter values.", detailLevel: "refined",
    declaration: "declare function paramSweepTest(paramName: string, values: readonly number[]): unknown;",
  },
  {
    name: "plane", category: "Reference geometry", exposure: "global", binding: plane,
    signature: "plane.XY(zOffset), plane.XZ(yOffset), plane.YZ(xOffset), plane.midplane(solid, axis)", description: "Reference planes for placement and transforms.", detailLevel: "refined",
    declaration: "declare const plane: { XY(zOffset?: number): Plane; XZ(yOffset?: number): Plane; YZ(xOffset?: number): Plane; midplane(solid: Solid, axis: 'x' | 'y' | 'z'): Plane };",
  },
  {
    name: "axis", category: "Reference geometry", exposure: "global", binding: axis,
    signature: "axis.X(origin?), axis.Y(origin?), axis.Z(origin?)", description: "Reference axes for patterns and layout.", detailLevel: "refined",
    declaration: "declare const axis: { X(origin?: Vec3): Axis; Y(origin?: Vec3): Axis; Z(origin?: Vec3): Axis };",
  },
  {
    name: "datum", category: "Reference geometry", exposure: "global", binding: datum,
    signature: "datum.point(point, name?), datum.fromBBox(solid, anchor, name?)", description: "Named points for assembly layout and constraints.", detailLevel: "refined",
    declaration: "declare const datum: { point(point: Vec3, name?: string): Datum; fromBBox(solid: Solid, anchor: BBoxAnchor, name?: string): Datum };",
  },
  {
    name: "toolBody", category: "Construction geometry", exposure: "global", binding: toolBody,
    signature: "toolBody(name, solid)", description: "Mark a solid as construction geometry for boolean tools and debug rendering.", detailLevel: "refined",
    declaration: "declare function toolBody(name: string, solid: Solid): ToolBody;",
  },
];

const methodCapabilities: CapabilityDescriptor[] = [
  ["union", "union(other)", "Combine overlapping solids.", "broad"],
  ["unionAll", "unionAll(...parts)", "Combine multiple solids.", "broad"],
  ["subtract", "subtract(other)", "Cut one solid with another.", "broad"],
  ["subtractAll", "subtractAll(...tools)", "Cut a solid with several tools.", "refined"],
  ["intersect", "intersect(other)", "Keep the overlap between solids.", "refined"],
  ["intersectAll", "intersectAll(...parts)", "Keep the common overlap of several solids.", "refined"],
  ["translate", "translate(x, y, z)", "Move a solid in world coordinates.", "broad"],
  ["translateTo", "translateTo(plane, offsets?)", "Move a solid relative to a reference plane.", "refined"],
  ["rotate", "rotate(x, y, z)", "Rotate a solid in degrees.", "broad"],
  ["scale", "scale(x, y?, z?)", "Scale a solid.", "refined"],
  ["mirror", "mirror(normal)", "Return a mirrored solid.", "refined"],
  ["mirrorUnion", "mirrorUnion(normal)", "Union a solid with its mirror.", "refined"],
  ["mirrorAssembly", "mirrorAssembly(normal, namePrefix?)", "Mirror into an assembly.", "refined"],
  ["quarterUnion", "quarterUnion(normal1, normal2)", "Mirror across two planes and union.", "refined"],
  ["linearPattern", "linearPattern(count, stepX?, stepY?, stepZ?)", "Repeat a solid on a linear grid.", "refined"],
  ["linearPatternAssembly", "linearPatternAssembly(count, step?, namePrefix?)", "Repeat parts as an assembly.", "refined"],
  ["circularPattern", "circularPattern(count, axis?, totalAngleDeg?, center?)", "Repeat a solid around an axis.", "refined"],
  ["circularPatternAssembly", "circularPatternAssembly(count, axis?, totalAngleDeg?, center?, namePrefix?)", "Repeat parts around an axis as an assembly.", "refined"],
  ["shell", "shell(thickness)", "Hollow a solid while preserving a wall.", "refined"],
  ["draft", "draft(angleDeg)", "Apply a draft angle.", "refined"],
  ["fillet", "fillet(subdivisions?)", "Round solid edges.", "refined"],
  ["chamfer", "chamfer(subdivisions?)", "Bevel solid edges.", "refined"],
  ["smooth", "smooth(subdivisions?, minSharpAngle?)", "Smooth mesh facets.", "refined"],
  ["color", "color(value)", "Assign display color metadata.", "refined"],
  ["named", "named(name)", "Assign a part name.", "broad"],
  ["extrude", "extrude(height)", "Extrude a sketch along Z.", "broad"],
  ["extrudeAlong", "extrudeAlong(direction, height)", "Extrude a sketch along a direction.", "refined"],
  ["revolve", "revolve(segments?)", "Revolve a sketch around the Y axis.", "refined"],
  ["sweep", "sweep(path)", "Sweep a sketch along a path.", "refined"],
].map(([name, signature, description, detailLevel]) => ({
  name,
  category: "Solid and sketch methods",
  exposure: "method" as const,
  signature,
  description,
  detailLevel: detailLevel as CapabilityDetailLevel,
}));

export const CAPABILITIES: readonly CapabilityDescriptor[] = [
  ...globalCapabilities,
  ...methodCapabilities,
];

export const CAPABILITY_BINDINGS: Readonly<Record<string, unknown>> = Object.fromEntries(
  globalCapabilities.map(({ name, binding }) => [name, binding]),
);

export function getRuntimeCapabilityNames(): string[] {
  return Object.keys(CAPABILITY_BINDINGS);
}

export function buildCapabilityReference(): string {
  return CAPABILITIES
    .map((capability) => `- ${capability.name}: ${capability.signature} -> ${capability.description}`)
    .join("\n");
}

export function buildCapabilityExamples(): string {
  return globalCapabilities
    .filter((capability) => capability.example)
    .map((capability) => `Example (${capability.name}):\n\`\`\`typescript\n${capability.example}\n\`\`\``)
    .join("\n");
}

export function buildCapabilityDeclarations(): string {
  return [
    "type Vec2 = [number, number];",
    "type Vec3 = [number, number, number];",
    "type CameraView = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' | 'iso';",
    "type Body = { mesh: { positions: Float32Array; indices: Uint32Array } };",
    "type Plane = { origin: Vec3; normal: Vec3 };",
    "type Axis = { origin: Vec3; direction: Vec3 };",
    "type Datum = { name?: string; point: Vec3 };",
    "type BBoxAnchor = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back' | 'top-front-right' | 'top-front-left' | 'top-back-right' | 'top-back-left' | 'bottom-front-right' | 'bottom-front-left' | 'bottom-back-right' | 'bottom-back-left';",
    "type BooleanOperand = Solid | ToolBody;",
    "declare type ToolBody = { _isToolBody: true; name: string; solid: Solid };",
    "declare class Assembly { add(name: string, solid: Solid, position?: Vec3): Assembly; toSolid(): Solid; toBodies(): Body[]; }",
    "declare class Solid { union(other: Solid): Solid; unionAll(...parts: Solid[]): Solid; subtract(other: Solid): Solid; subtractAll(...tools: BooleanOperand[]): Solid; intersect(other: Solid): Solid; intersectAll(...parts: BooleanOperand[]): Solid; translate(x: number, y: number, z: number): Solid; translateTo(plane: Plane, offsets?: Vec3): Solid; rotate(x: number, y: number, z: number): Solid; scale(x: number, y?: number, z?: number): Solid; mirror(normal: Vec3): Solid; mirrorUnion(normal: Vec3): Solid; mirrorAssembly(normal: Vec3, namePrefix?: string): Assembly; quarterUnion(normal1: Vec3, normal2: Vec3): Solid; linearPattern(count: number, stepX?: number, stepY?: number, stepZ?: number): Solid; linearPatternAssembly(count: number, step?: Vec3, namePrefix?: string): Assembly; circularPattern(count: number, axis?: 'x' | 'y' | 'z', totalAngleDeg?: number, center?: Vec3): Solid; circularPatternAssembly(count: number, axis?: 'x' | 'y' | 'z', totalAngleDeg?: number, center?: Vec3, namePrefix?: string): Assembly; shell(thickness: number): Solid; draft(angleDeg: number): Solid; fillet(subdivisions?: number): Solid; chamfer(subdivisions?: number): Solid; smooth(subdivisions?: number, minSharpAngle?: number): Solid; color(value: string | [number, number, number, number]): Solid; named(name: string): Solid; boundingBox(): { min: Vec3; max: Vec3 }; volume(): number; surfaceArea(): number; }",
    ...globalCapabilities.filter((capability) => capability.declaration).map((capability) => capability.declaration as string),
  ].join("\n");
}
