/**
 * CadLad Public Modeling API.
 *
 * This is what model scripts import. It re-exports everything
 * a .forge.ts file needs.
 */

// Parameters
export { param } from "./params.js";

// 2D Sketch
export { Sketch, ConstrainedSketch, rect, circle, slot, lShape, channel, tShape } from "./sketch.js";
export type { ConstraintSolveOptions } from "./sketch.js";

// 3D Primitives
export { box, cylinder, sphere, roundedRect, sweep, loft } from "@cadlad/kernel/primitives.js";

// Solid class (for type annotations in user scripts)
export { Solid } from "@cadlad/kernel/solid.js";

// Assembly
export { Assembly, assembly } from "./assembly.js";

// Typed scene contract
export { defineScene } from "./scene-contract.js";
export { mm } from "./scene-contract.js";
export { paramSweepTest } from "./scene-contract.js";
export { constraint } from "./constraints.js";
export type {
  SceneEnvelope,
  SceneMeta,
  SceneParamDefinition,
  SceneParamsShape,
  SceneTest,
  SceneValidator,
  Millimeters,
} from "./scene-contract.js";
export type {
  SceneConstraint,
  WallThicknessConstraint,
  SymmetryConstraint,
  ClearanceConstraint,
  MaxOverhangConstraint,
} from "./constraints.js";

// Types
export type { Vec2, Vec3, Color, ParamDef, Body } from "@cadlad/kernel/types.js";

// Reference geometry
export { plane, axis, datum } from "./reference.js";
export type { Plane, Axis, Datum, MidplaneAxis, BBoxAnchor } from "./reference.js";

// Tool bodies (construction geometry)
export { toolBody } from "./toolbody.js";
export { ToolBody } from "./toolbody.js";
