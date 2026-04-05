/**
 * Solid – the core wrapper around a Manifold solid.
 *
 * Provides a fluent, chainable API for booleans, transforms, and
 * color/naming metadata. The mesh is extracted lazily for rendering.
 */

import { getManifold } from "./manifold-backend.js";
import type { Color, TriMesh, Vec3, Body, BBox } from "./types.js";
import type { Manifold } from "manifold-3d";

type ManifoldInstance = Manifold;

export type PlaneLike = {
  origin: Vec3;
  normal: Vec3;
};

type BooleanOperand = Solid | { solid: Solid; _isToolBody?: true };

export class Solid {
  /** @internal raw Manifold handle */
  _manifold: ManifoldInstance;
  private _color: Color = [0.6, 0.6, 0.65, 1.0];
  private _name: string | undefined;

  constructor(manifold: ManifoldInstance) {
    this._manifold = manifold;
  }

  /** Create a new Solid carrying forward this one's color and name. */
  private _withManifold(manifold: ManifoldInstance): Solid {
    const s = new Solid(manifold);
    s._color = this._color;
    s._name = this._name;
    return s;
  }

  // ── Booleans ───────────────────────────────────────────────

  union(other: Solid): Solid {
    return this._withManifold(this._manifold.add(other._manifold));
  }

  /**
   * Union this solid with multiple parts in one call.
   * Preserves this solid's metadata (color/name).
   */
  unionAll(...parts: Solid[]): Solid {
    if (parts.length === 0) return this;
    const manifold = parts.reduce(
      (result, part) => result.add(part._manifold),
      this._manifold,
    );
    return this._withManifold(manifold);
  }

  subtract(other: Solid): Solid {
    return this._withManifold(this._manifold.subtract(other._manifold));
  }

  /**
   * Subtract multiple tool solids from this solid in one call.
   * Preserves this solid's metadata (color/name).
   */
  subtractAll(...tools: BooleanOperand[]): Solid {
    if (tools.length === 0) return this;
    const manifold = tools.reduce(
      (result, tool) => result.subtract(this._asSolid(tool)._manifold),
      this._manifold,
    );
    return this._withManifold(manifold);
  }

  intersect(other: Solid): Solid {
    return this._withManifold(this._manifold.intersect(other._manifold));
  }

  /**
   * Intersect this solid with multiple parts in one call.
   * Preserves this solid's metadata (color/name).
   */
  intersectAll(...parts: BooleanOperand[]): Solid {
    if (parts.length === 0) return this;
    const manifold = parts.reduce(
      (result, part) => result.intersect(this._asSolid(part)._manifold),
      this._manifold,
    );
    return this._withManifold(manifold);
  }

  private _asSolid(operand: BooleanOperand): Solid {
    if (operand instanceof Solid) return operand;
    if (
      operand &&
      typeof operand === "object" &&
      "solid" in operand &&
      operand.solid instanceof Solid &&
      (!("_isToolBody" in operand) || operand._isToolBody === true)
    ) {
      return operand.solid;
    }
    throw new Error("Boolean operands must be Solid or ToolBody");
  }

  // ── Transforms ─────────────────────────────────────────────

  translate(x: number, y: number, z: number): Solid {
    return this._withManifold(this._manifold.translate(x, y, z));
  }

  /**
   * Move this solid so its bbox center sits on a reference plane.
   *
   * The solid is translated along the plane normal to land on the plane,
   * then optional XYZ offsets are applied.
   */
  translateTo(plane: PlaneLike, offsets: Vec3 = [0, 0, 0]): Solid {
    const bb = this.boundingBox();
    const center: Vec3 = [
      (bb.min[0] + bb.max[0]) / 2,
      (bb.min[1] + bb.max[1]) / 2,
      (bb.min[2] + bb.max[2]) / 2,
    ];
    const normal = plane.normal;
    const normalLen = Math.hypot(normal[0], normal[1], normal[2]);
    if (normalLen < 1e-10) {
      throw new Error("translateTo requires a plane with a non-zero normal");
    }

    const nx = normal[0] / normalLen;
    const ny = normal[1] / normalLen;
    const nz = normal[2] / normalLen;

    const signedDistance =
      (center[0] - plane.origin[0]) * nx +
      (center[1] - plane.origin[1]) * ny +
      (center[2] - plane.origin[2]) * nz;

    return this.translate(
      -signedDistance * nx + offsets[0],
      -signedDistance * ny + offsets[1],
      -signedDistance * nz + offsets[2],
    );
  }

  rotate(x: number, y: number, z: number): Solid {
    return this._withManifold(this._manifold.rotate([x, y, z]));
  }

  scale(x: number, y?: number, z?: number): Solid {
    const sy = y ?? x;
    const sz = z ?? x;
    return this._withManifold(this._manifold.scale([x, sy, sz]));
  }

  mirror(normal: Vec3): Solid {
    return this._withManifold(this._manifold.mirror(normal));
  }

  /**
   * Create a union of this solid and its mirrored counterpart.
   * Useful for symmetry-first workflows where only half (or quarter) is modeled directly.
   */
  mirrorUnion(normal: Vec3): Solid {
    return this.union(this.mirror(normal));
  }

  /**
   * Model one quadrant, then mirror-union across two planes.
   * Equivalent to: mirrorUnion(normal1).mirrorUnion(normal2)
   */
  quarterUnion(normal1: Vec3, normal2: Vec3): Solid {
    return this.mirrorUnion(normal1).mirrorUnion(normal2);
  }

  /**
   * Pattern this solid linearly and union all instances into one result.
   *
   * @param count Number of total instances, including the original.
   * @param stepX X offset between consecutive instances.
   * @param stepY Y offset between consecutive instances.
   * @param stepZ Z offset between consecutive instances.
   */
  linearPattern(count: number, stepX = 0, stepY = 0, stepZ = 0): Solid {
    if (!Number.isInteger(count) || count < 1) {
      throw new Error("linearPattern count must be an integer >= 1");
    }
    let patterned = this._manifold;
    for (let i = 1; i < count; i += 1) {
      patterned = patterned.add(
        this._manifold.translate(stepX * i, stepY * i, stepZ * i),
      );
    }
    return this._withManifold(patterned);
  }

  /**
   * Pattern this solid around a principal axis and union all instances into one result.
   *
   * @param count Number of total instances, including the original.
   * @param axis Rotation axis: "x", "y", or "z". Default "z".
   * @param totalAngleDeg Total sweep angle in degrees. Default 360 for full circular pattern.
   * @param center Pivot point for the pattern.
   */
  circularPattern(
    count: number,
    axis: "x" | "y" | "z" = "z",
    totalAngleDeg = 360,
    center: Vec3 = [0, 0, 0],
  ): Solid {
    if (!Number.isInteger(count) || count < 1) {
      throw new Error("circularPattern count must be an integer >= 1");
    }
    if (!Number.isFinite(totalAngleDeg)) {
      throw new Error("circularPattern totalAngleDeg must be finite");
    }
    const stepDeg = totalAngleDeg / count;
    let patterned = this._manifold;
    for (let i = 1; i < count; i += 1) {
      const angle = stepDeg * i;
      const rotated = this._manifold
        .translate(-center[0], -center[1], -center[2])
        .rotate([
          axis === "x" ? angle : 0,
          axis === "y" ? angle : 0,
          axis === "z" ? angle : 0,
        ])
        .translate(center[0], center[1], center[2]);
      patterned = patterned.add(rotated);
    }
    return this._withManifold(patterned);
  }

  // ── Smoothing & Edge Treatment ────────────────────────────

  /**
   * Smooth all edges, then subdivide to produce rounded geometry.
   *
   * @param subdivisions How many times to subdivide (2-4 typical). Higher = smoother + more polys.
   * @param minSharpAngle Edges sharper than this (degrees) get smoothed. Default 0 = smooth all.
   *   Use 60 to only smooth hard edges while keeping flat faces flat.
   */
  smooth(subdivisions = 3, minSharpAngle = 0): Solid {
    const smoothed = this._manifold.smoothOut(minSharpAngle).refine(subdivisions);
    return this._withManifold(smoothed);
  }

  /**
   * Full fillet — rounds all edges by converting to a smooth manifold
   * with tangent data, then subdividing. Produces visibly curved geometry.
   *
   * @param subdivisions How many times to subdivide (2-4 typical).
   */
  fillet(subdivisions = 3): Solid {
    const M = getManifold();
    const mesh = this._manifold.getMesh();
    const smoothManifold = M.Manifold.smooth(mesh);
    const refined = smoothManifold.refine(subdivisions);
    return this._withManifold(refined);
  }

  /**
   * Chamfer — bevels all edges with a flat cut. Unlike fillet (which rounds),
   * chamfer produces angled flat faces at edges.
   *
   * Implemented as smooth + refine(1): with only 1 subdivision the interpolation
   * stays linear, producing flat bevels rather than curves.
   *
   * @param subdivisions Number of flat bevel segments (1 = single 45° cut, 2+ = multi-faceted).
   *   Default 1. Higher values approximate a fillet but with flat segments.
   */
  chamfer(subdivisions = 1): Solid {
    const M = getManifold();
    const mesh = this._manifold.getMesh();
    const smoothManifold = M.Manifold.smooth(mesh);
    const refined = smoothManifold.refine(subdivisions);
    return this._withManifold(refined);
  }

  // ── Shell ───────────────────────────────────────────────

  /**
   * Hollow out this solid, leaving walls of the given thickness.
   *
   * Creates a shell by subtracting an inward-offset version of the solid.
   * Uses bounding-box–based scaling from the centroid. Works well for
   * convex and near-convex shapes (boxes, cylinders, simple enclosures).
   *
   * For complex concave shapes, wall thickness may not be perfectly uniform —
   * consider using boolean subtract with explicit inner geometry instead.
   *
   * @param thickness Wall thickness (must be positive and less than half the smallest dimension).
   */
  shell(thickness: number): Solid {
    if (thickness <= 0) throw new Error("Shell thickness must be positive");
    const bb = this.boundingBox();
    const sx = bb.max[0] - bb.min[0];
    const sy = bb.max[1] - bb.min[1];
    const sz = bb.max[2] - bb.min[2];
    const minDim = Math.min(sx, sy, sz);
    if (thickness * 2 >= minDim) {
      throw new Error(
        `Shell thickness ${thickness} is too large for solid with smallest dimension ${minDim}. ` +
        `Must be less than ${(minDim / 2).toFixed(2)}.`
      );
    }
    const cx = (bb.min[0] + bb.max[0]) / 2;
    const cy = (bb.min[1] + bb.max[1]) / 2;
    const cz = (bb.min[2] + bb.max[2]) / 2;
    // Scale factors to shrink by thickness in each direction
    const fx = (sx - 2 * thickness) / sx;
    const fy = (sy - 2 * thickness) / sy;
    const fz = (sz - 2 * thickness) / sz;
    // Create inner void: translate to origin, scale down, translate back
    const inner = this._manifold
      .translate(-cx, -cy, -cz)
      .scale([fx, fy, fz])
      .translate(cx, cy, cz);
    return this._withManifold(this._manifold.subtract(inner));
  }

  // ── Draft ───────────────────────────────────────────────

  /**
   * Apply draft angle — tapers walls for mold release.
   *
   * Positive angle tapers inward going up (standard mold draft).
   * Negative angle tapers outward going up.
   *
   * The draft pivots around the base (minimum Z) of the solid.
   * Vertices at Z=min stay in place; vertices at Z=max move inward/outward.
   *
   * @param angleDeg Draft angle in degrees from vertical. Typical values: 1–5° for injection molding.
   */
  draft(angleDeg: number): Solid {
    const tanA = Math.tan((angleDeg * Math.PI) / 180);
    const bb = this.boundingBox();
    const baseZ = bb.min[2];
    const cx = (bb.min[0] + bb.max[0]) / 2;
    const cy = (bb.min[1] + bb.max[1]) / 2;
    const halfW = (bb.max[0] - bb.min[0]) / 2;
    const halfD = (bb.max[1] - bb.min[1]) / 2;
    const maxHalf = Math.max(halfW, halfD);
    if (maxHalf < 1e-10) return this._withManifold(this._manifold);

    const warped = this._manifold.warp((v: Vec3) => {
      const h = v[2] - baseZ;
      // Scale factor decreases with height for positive draft (inward taper)
      const scale = 1 - (h * tanA) / maxHalf;
      v[0] = cx + (v[0] - cx) * scale;
      v[1] = cy + (v[1] - cy) * scale;
    });
    return this._withManifold(warped);
  }

  // ── Metadata ───────────────────────────────────────────────

  color(c: string | Color): Solid {
    if (typeof c === "string") {
      this._color = hexToColor(c);
    } else {
      this._color = c;
    }
    return this;
  }

  named(name: string): Solid {
    this._name = name;
    return this;
  }

  // ── Query ──────────────────────────────────────────────────

  boundingBox(): BBox {
    const bb = this._manifold.boundingBox();
    return {
      min: [bb.min[0], bb.min[1], bb.min[2]],
      max: [bb.max[0], bb.max[1], bb.max[2]],
    };
  }

  volume(): number {
    return this._manifold.volume();
  }

  surfaceArea(): number {
    return this._manifold.surfaceArea();
  }

  // ── Connectivity ─────────────────────────────────────────────

  /**
   * Return the number of disconnected solid components in this mesh.
   * A single contiguous solid returns 1. Two floating parts returns 2, etc.
   * Internal voids (from shell/subtract) have negative volume and are not counted.
   */
  numComponents(): number {
    const parts = this._manifold.decompose();
    return parts.filter(p => p.volume() > 0).length;
  }

  // ── Export ─────────────────────────────────────────────────

  /** Extract a renderable triangle mesh. */
  toTriMesh(): TriMesh {
    const mesh = this._manifold.getMesh();
    return {
      positions: new Float32Array(mesh.vertProperties),
      normals: computeNormals(mesh.vertProperties, mesh.triVerts),
      indices: new Uint32Array(mesh.triVerts),
    };
  }

  /** Convert to a Body for the rendering pipeline. */
  toBody(): Body {
    return {
      name: this._name,
      color: this._color,
      mesh: this.toTriMesh(),
    };
  }

  /** Export as binary STL. */
  toSTL(): ArrayBuffer {
    const mesh = this.toTriMesh();
    return meshToSTL(mesh);
  }
}

// ── Helpers ────────────────────────────────────────────────────

function hexToColor(hex: string): Color {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const a = h.length >= 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
}

function computeNormals(
  verts: Float32Array | number[],
  tris: Uint32Array | number[],
): Float32Array {
  const numVerts = (verts.length / 3) | 0;
  const normals = new Float32Array(numVerts * 3);

  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i] * 3;
    const b = tris[i + 1] * 3;
    const c = tris[i + 2] * 3;

    const ux = verts[b] - verts[a],
      uy = verts[b + 1] - verts[a + 1],
      uz = verts[b + 2] - verts[a + 2];
    const vx = verts[c] - verts[a],
      vy = verts[c + 1] - verts[a + 1],
      vz = verts[c + 2] - verts[a + 2];

    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;

    for (const idx of [a, b, c]) {
      normals[idx] += nx;
      normals[idx + 1] += ny;
      normals[idx + 2] += nz;
    }
  }

  // Normalise
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.sqrt(
      normals[i] ** 2 + normals[i + 1] ** 2 + normals[i + 2] ** 2,
    );
    if (len > 0) {
      normals[i] /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    }
  }

  return normals;
}

function meshToSTL(mesh: TriMesh): ArrayBuffer {
  const numTris = mesh.indices.length / 3;
  // 80 header + 4 byte count + 50 bytes per triangle
  const buf = new ArrayBuffer(80 + 4 + numTris * 50);
  const view = new DataView(buf);
  let offset = 80;

  view.setUint32(offset, numTris, true);
  offset += 4;

  const pos = mesh.positions;
  const idx = mesh.indices;

  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;

    // Face normal
    const ux = pos[b] - pos[a],
      uy = pos[b + 1] - pos[a + 1],
      uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a],
      vy = pos[c + 1] - pos[a + 1],
      vz = pos[c + 2] - pos[a + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) { nx /= len; ny /= len; nz /= len; }

    view.setFloat32(offset, nx, true); offset += 4;
    view.setFloat32(offset, ny, true); offset += 4;
    view.setFloat32(offset, nz, true); offset += 4;

    for (const vi of [a, b, c]) {
      view.setFloat32(offset, pos[vi], true); offset += 4;
      view.setFloat32(offset, pos[vi + 1], true); offset += 4;
      view.setFloat32(offset, pos[vi + 2], true); offset += 4;
    }

    view.setUint16(offset, 0, true); offset += 2; // attribute byte count
  }

  return buf;
}
