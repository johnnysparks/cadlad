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

  subtract(other: Solid): Solid {
    return this._withManifold(this._manifold.subtract(other._manifold));
  }

  intersect(other: Solid): Solid {
    return this._withManifold(this._manifold.intersect(other._manifold));
  }

  // ── Transforms ─────────────────────────────────────────────

  translate(x: number, y: number, z: number): Solid {
    return this._withManifold(this._manifold.translate(x, y, z));
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
