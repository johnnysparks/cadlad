/**
 * Engine barrel export.
 */
export { initManifold, getManifold } from "./manifold-backend.js";
export { Solid } from "./solid.js";
export { box, cylinder, sphere, extrudePolygon, revolve, roundedRect } from "./primitives.js";
export type {
  Vec2,
  Vec3,
  Color,
  ParamDef,
  TriMesh,
  Body,
  ModelResult,
  BBox,
} from "./types.js";
