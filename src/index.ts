/**
 * CadLad — Code-first parametric CAD for TypeScript.
 *
 * Public library entry point.
 */

export {
  param,
  box, cylinder, sphere, roundedRect,
  Sketch, rect, circle,
  Solid,
  Assembly, assembly,
} from "./api/index.js";

export { evaluateModel } from "./api/runtime.js";
export { initManifold } from "./engine/manifold-backend.js";

export type {
  Vec2, Vec3, Color,
  ParamDef, Body, TriMesh, ModelResult, EvaluationBundle, BBox,
} from "./engine/types.js";
