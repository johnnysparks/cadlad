/**
 * CadLad Public Modeling API.
 *
 * This is what model scripts import. It re-exports everything
 * a .forge.ts file needs.
 */

// Parameters
export { param } from "./params.js";

// 2D Sketch
export { Sketch, rect, circle, slot, lShape, channel, tShape } from "./sketch.js";

// 3D Primitives
export { box, cylinder, sphere, roundedRect, sweep, loft } from "../engine/primitives.js";

// Solid class (for type annotations in user scripts)
export { Solid } from "../engine/solid.js";

// Assembly
export { Assembly, assembly } from "./assembly.js";

// Typed scene contract
export { defineScene } from "./scene-contract.js";
export { mm } from "./scene-contract.js";
export type {
  SceneEnvelope,
  SceneFeatureDeclaration,
  SceneMeta,
  SceneParamDefinition,
  SceneParamsShape,
  SceneTest,
  SceneValidator,
  Millimeters,
} from "./scene-contract.js";

// Types
export type { Vec2, Vec3, Color, ParamDef, Body } from "../engine/types.js";
