/**
 * Primitive solid constructors.
 *
 * Each function creates a Solid from the Manifold WASM module.
 */

import { getManifold } from "./manifold-backend.js";
import { Solid } from "./solid.js";
import type { Vec2 } from "./types.js";

/** Axis-aligned box centred at origin. */
export function box(x: number, y: number, z: number): Solid {
  const M = getManifold();
  return new Solid(M.Manifold.cube([x, y, z], true));
}

/** Cylinder along Z, centred at origin. */
export function cylinder(
  height: number,
  radiusBottom: number,
  radiusTop?: number,
  segments?: number,
): Solid {
  const M = getManifold();
  const rTop = radiusTop ?? radiusBottom;
  const n = segments ?? 32;
  return new Solid(
    M.Manifold.cylinder(height, radiusBottom, rTop, n, true),
  );
}

/** Sphere centred at origin. */
export function sphere(radius: number, segments?: number): Solid {
  const M = getManifold();
  const n = segments ?? 32;
  return new Solid(M.Manifold.sphere(radius, n));
}

/**
 * Extrude a 2D polygon along Z.
 * Points should be in counter-clockwise order for a solid facing +Z.
 */
export function extrudePolygon(
  points: Vec2[],
  height: number,
): Solid {
  const M = getManifold();
  const cross = M.CrossSection.ofPolygons([points]);
  return new Solid(M.Manifold.extrude(cross, height));
}

/**
 * Revolve a 2D polygon around the Y axis.
 */
export function revolve(
  points: Vec2[],
  segments?: number,
): Solid {
  const M = getManifold();
  const cross = M.CrossSection.ofPolygons([points]);
  return new Solid(M.Manifold.revolve(cross, segments ?? 32));
}

/**
 * Rounded rectangle extruded along Z.
 */
export function roundedRect(
  width: number,
  depth: number,
  radius: number,
  height?: number,
): Solid {
  // Approximate rounded rectangle as polygon
  const r = Math.min(radius, width / 2, depth / 2);
  const segs = 8;
  const pts: Vec2[] = [];
  const hw = width / 2;
  const hd = depth / 2;

  // Corner centres
  const corners: Vec2[] = [
    [hw - r, hd - r],
    [-(hw - r), hd - r],
    [-(hw - r), -(hd - r)],
    [hw - r, -(hd - r)],
  ];

  for (let ci = 0; ci < 4; ci++) {
    const [cx, cy] = corners[ci];
    const startAngle = (ci * Math.PI) / 2;
    for (let i = 0; i <= segs; i++) {
      const a = startAngle + (i / segs) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }

  if (height != null && height > 0) {
    return extrudePolygon(pts, height);
  }

  // Return a thin slab if no height given
  return extrudePolygon(pts, 1);
}
