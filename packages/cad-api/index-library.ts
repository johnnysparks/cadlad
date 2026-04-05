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
} from "./index.js";

export { evaluateModel } from "./runtime.js";
export { initManifold } from "@cadlad/kernel/manifold-backend.js";

export type {
  Vec2, Vec3, Color,
  ParamDef, Body, TriMesh, ModelResult, EvaluationBundle, BBox,
} from "@cadlad/kernel/types.js";
