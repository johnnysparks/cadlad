/**
 * Primitive solid constructors.
 *
 * Each function creates a Solid from the Manifold WASM module.
 */

import { getManifold } from "./manifold-backend.js";
import { Solid } from "./solid.js";
import type { Vec2, Vec3 } from "./types.js";

/** Axis-aligned box centred at origin. */
export function box(x: number, y: number, z: number): Solid {
  const manifold = getManifold();
  return new Solid(manifold.Manifold.cube([x, y, z], true));
}

/** Cylinder along Z, centred at origin. */
export function cylinder(
  height: number,
  radiusBottom: number,
  radiusTop?: number,
  segments?: number,
): Solid {
  const manifold = getManifold();
  const rTop = radiusTop ?? radiusBottom;
  const n = segments ?? 32;
  return new Solid(
    manifold.Manifold.cylinder(height, radiusBottom, rTop, n, true),
  );
}

/** Sphere centred at origin. */
export function sphere(radius: number, segments?: number): Solid {
  const manifold = getManifold();
  const n = segments ?? 32;
  return new Solid(manifold.Manifold.sphere(radius, n));
}

/**
 * Compute signed area of a 2D polygon.
 * Positive = counter-clockwise, negative = clockwise.
 */
function signedArea(pts: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1];
    area -= pts[j][0] * pts[i][1];
  }
  return area / 2;
}

/**
 * Extrude a 2D polygon along Z.
 *
 * Auto-corrects clockwise winding to counter-clockwise — Manifold
 * silently produces empty geometry from CW polygons, which is a
 * common source of invisible/missing shapes.
 */
export function extrudePolygon(
  points: Vec2[],
  height: number,
): Solid {
  let pts = points;
  if (signedArea(pts) < 0) {
    // Clockwise → reverse to CCW. Log so the user learns.
    console.warn(
      "💡 Sketch winding was clockwise — auto-reversed to counter-clockwise. " +
      "Manifold requires CCW polygons; CW produces empty geometry silently.",
    );
    pts = [...pts].reverse();
  }
  const manifold = getManifold();
  const cross = manifold.CrossSection.ofPolygons([pts]);
  return new Solid(manifold.Manifold.extrude(cross, height));
}

/**
 * Revolve a 2D polygon around the Y axis.
 * Auto-corrects clockwise winding (same as extrudePolygon).
 */
export function revolve(
  points: Vec2[],
  segments?: number,
): Solid {
  let pts = points;
  if (signedArea(pts) < 0) {
    console.warn(
      "💡 Sketch winding was clockwise — auto-reversed to counter-clockwise.",
    );
    pts = [...pts].reverse();
  }
  const manifold = getManifold();
  const cross = manifold.CrossSection.ofPolygons([pts]);
  return new Solid(manifold.Manifold.revolve(cross, segments ?? 32));
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

// ── Tapered Box ───────────────────────────────────────────

/**
 * Box that tapers from one cross-section to another along Z.
 *
 * Creates a solid that transitions from (w1 × d1) at z=0 to (w2 × d2) at z=height.
 * Useful for handles, brackets, and any shape that narrows or widens.
 *
 * @param height Length of the taper along Z
 * @param w1 Width at bottom (z=0)
 * @param d1 Depth at bottom (z=0)
 * @param w2 Width at top (z=height)
 * @param d2 Depth at top (z=height)
 */
export function taperedBox(
  height: number,
  w1: number,
  d1: number,
  w2: number,
  d2: number,
): Solid {
  const bottom: Vec2[] = [
    [-w1 / 2, -d1 / 2], [w1 / 2, -d1 / 2],
    [w1 / 2, d1 / 2], [-w1 / 2, d1 / 2],
  ];
  const top: Vec2[] = [
    [-w2 / 2, -d2 / 2], [w2 / 2, -d2 / 2],
    [w2 / 2, d2 / 2], [-w2 / 2, d2 / 2],
  ];
  return loft([bottom, top], [0, height]);
}

// ── Rounded Box ───────────────────────────────────────────

/**
 * Box with all edges and corners rounded to a uniform radius.
 *
 * Built as the convex hull of 8 spheres placed at the inner corners.
 * Unlike roundedRect (which only rounds XY corners), this rounds
 * ALL 12 edges and all 8 corners uniformly.
 *
 * @param width  X dimension
 * @param depth  Y dimension
 * @param height Z dimension
 * @param radius Corner/edge radius (clamped to half of smallest dimension)
 * @param segments Sphere segments for smoothness (default 16)
 */
export function roundedBox(
  width: number,
  depth: number,
  height: number,
  radius: number,
  segments?: number,
): Solid {
  const r = Math.min(radius, width / 2, depth / 2, height / 2);
  const n = segments ?? 16;
  const manifold = getManifold();

  // Inner box corners (offset inward by radius)
  const hw = width / 2 - r;
  const hd = depth / 2 - r;
  const hh = height / 2 - r;

  const corners: Vec3[] = [
    [-hw, -hd, -hh], [hw, -hd, -hh],
    [hw, hd, -hh],   [-hw, hd, -hh],
    [-hw, -hd, hh],  [hw, -hd, hh],
    [hw, hd, hh],    [-hw, hd, hh],
  ];

  // Place a sphere at each corner and hull them all
  const spheres = corners.map(([x, y, z]) =>
    manifold.Manifold.sphere(r, n).translate(x, y, z)
  );

  return new Solid(manifold.Manifold.hull(spheres));
}

// ── Sweep ─────────────────────────────────────────────────

/**
 * Sweep a 2D profile along a 3D path to create a solid.
 *
 * The profile (in XY) is placed perpendicular to the path at each point,
 * and consecutive placements are connected via convex hull to form tube segments.
 * All segments are unioned into the final solid.
 *
 * @param profile 2D profile points (CCW winding). Auto-corrects CW.
 * @param path 3D path points (at least 2). The profile sweeps from path[0] to path[N-1].
 * @param segments Optional: circular segments for profile approximation (used internally).
 */
export function sweep(profile: Vec2[], path: Vec3[]): Solid {
  if (path.length < 2) throw new Error("Sweep path needs at least 2 points");
  if (profile.length < 3) throw new Error("Sweep profile needs at least 3 points");

  let pts = profile;
  if (signedArea(pts) < 0) {
    console.warn("💡 Sweep profile winding was clockwise — auto-reversed to CCW.");
    pts = [...pts].reverse();
  }

  const manifold = getManifold();
  const cross = manifold.CrossSection.ofPolygons([pts]);

  let result = null as ReturnType<typeof manifold.Manifold.extrude> | null;

  for (let i = 0; i < path.length - 1; i++) {
    const [x0, y0, z0] = path[i];
    const [x1, y1, z1] = path[i + 1];

    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (segLen < 1e-10) continue;

    // Extrude profile along Z by segment length
    const seg = manifold.Manifold.extrude(cross, segLen);

    // Build rotation matrix to align Z-axis with segment direction
    const nx = dx / segLen, ny = dy / segLen, nz = dz / segLen;
    const mat = alignZToDirection(nx, ny, nz);

    // Apply rotation then translate to segment start
    const placed = seg.transform(mat).translate(x0, y0, z0);

    result = result ? result.add(placed) : placed;
  }

  if (!result) throw new Error("Sweep produced no geometry");
  return new Solid(result);
}

/**
 * Build a column-major 4x4 rotation matrix that maps Z-axis to the given direction.
 * Returns a Mat4 (16 numbers) compatible with Manifold.transform().
 */
export function alignZToDirection(nx: number, ny: number, nz: number): [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
] {
  // We need an orthonormal basis where the 3rd vector is [nx, ny, nz].
  // Pick a "not parallel" reference to cross-product with.
  let refX = 0, refY = 1, refZ = 0;
  if (Math.abs(ny) > 0.9) {
    refX = 1; refY = 0; refZ = 0;
  }

  // u = ref × n (first basis vector)
  let ux = refY * nz - refZ * ny;
  let uy = refZ * nx - refX * nz;
  let uz = refX * ny - refY * nx;
  const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz);
  ux /= uLen; uy /= uLen; uz /= uLen;

  // v = n × u (second basis vector)
  const vx = ny * uz - nz * uy;
  const vy = nz * ux - nx * uz;
  const vz = nx * uy - ny * ux;

  // Column-major 4x4: columns are [u, v, n, translation=0]
  return [
    ux, uy, uz, 0,
    vx, vy, vz, 0,
    nx, ny, nz, 0,
    0,  0,  0,  1,
  ];
}

// ── Loft ──────────────────────────────────────────────────

/**
 * Loft between multiple 2D profiles at specified heights to create a solid.
 *
 * Each profile is extruded at its height, and consecutive profiles are
 * connected by hulling their thin extrusions. The result is the union of
 * all hull segments.
 *
 * @param profiles Array of 2D profile point arrays (at least 2 profiles). Auto-corrects CW winding.
 * @param heights Z-heights for each profile (must be same length as profiles, ascending).
 */
export function loft(profiles: Vec2[][], heights: number[]): Solid {
  if (profiles.length < 2) throw new Error("Loft needs at least 2 profiles");
  if (profiles.length !== heights.length) {
    throw new Error("Loft: profiles and heights arrays must have the same length");
  }
  for (let i = 1; i < heights.length; i++) {
    if (heights[i] <= heights[i - 1]) {
      throw new Error("Loft: heights must be strictly ascending");
    }
  }

  const manifold = getManifold();
  const thinThickness = 0.001; // Thin slab for hull endpoints

  // Create thin extrusions at each height
  const slabs = profiles.map((profile, i) => {
    let pts = profile;
    if (signedArea(pts) < 0) {
      pts = [...pts].reverse();
    }
    const cross = manifold.CrossSection.ofPolygons([pts]);
    return manifold.Manifold.extrude(cross, thinThickness)
      .translate(0, 0, heights[i]);
  });

  // Hull consecutive pairs and union
  let result = null as ReturnType<typeof manifold.Manifold.hull> | null;
  for (let i = 0; i < slabs.length - 1; i++) {
    const segment = manifold.Manifold.hull([slabs[i], slabs[i + 1]]);
    result = result ? result.add(segment) : segment;
  }

  if (!result) throw new Error("Loft produced no geometry");
  return new Solid(result);
}
