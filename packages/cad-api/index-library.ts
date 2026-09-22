/**
 * CadLad — Code-first parametric CAD for TypeScript.
 *
 * Public library entry point.
 */

export {
  param,
  box, cylinder, sphere, roundedRect, roundedBox, taperedBox, sweep, loft,
  Sketch, rect, circle, slot, lShape, channel, tShape,
  Solid,
  Assembly, assembly,
  defineScene, mm, constraint, paramSweepTest,
  plane, axis, datum,
  toolBody,
} from "./index.js";

export { evaluateModel } from "./runtime.js";
export {
  CAPABILITIES,
  buildCapabilityReference,
  buildCapabilityExamples,
  buildCapabilityDeclarations,
  getRuntimeCapabilityNames,
  compileModelSource,
} from "./index.js";
export { initManifold } from "@cadlad/kernel/manifold-backend.js";

export type {
  Vec2, Vec3, Color,
  ParamDef, Body, TriMesh, ModelResult, EvaluationBundle, BBox,
} from "@cadlad/kernel/types.js";
