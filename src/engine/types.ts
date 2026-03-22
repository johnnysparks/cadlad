/** Core geometry types used throughout the engine. */

/** 3D vector / point */
export type Vec3 = [number, number, number];

/** 2D vector / point */
export type Vec2 = [number, number];

/** RGBA color as [r, g, b, a] with values 0–1 */
export type Color = [number, number, number, number];

/** Named parameter definition */
export interface ParamDef {
  name: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

/** Triangle mesh for rendering */
export interface TriMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/** A solid body with optional color and name */
export interface Body {
  name?: string;
  color?: Color;
  mesh: TriMesh;
}

/** An advisory hint from the hint engine */
export interface Hint {
  id: string;
  message: string;
  severity: "tip" | "warning";
}

/** Result of evaluating a model script */
export interface ModelResult {
  bodies: Body[];
  params: ParamDef[];
  errors: string[];
  hints: Hint[];
}

/** Bounding box */
export interface BBox {
  min: Vec3;
  max: Vec3;
}
