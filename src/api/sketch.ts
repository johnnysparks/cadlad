/**
 * 2D Sketch API with geometric constraint validation.
 *
 * Catches broken geometry at the 2D stage — before it becomes
 * a silent empty 3D solid. Validates profiles on extrude/revolve.
 */

import type { Vec2, Vec3 } from "../engine/types.js";
import { extrudePolygon, revolve as revolveEngine, sweep as sweepEngine, alignZToDirection } from "../engine/primitives.js";
import { Solid } from "../engine/solid.js";

// ── Geometry helpers ──────────────────────────────────────────

function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
}

function segmentDirection(a: Vec2, b: Vec2): Vec2 {
  const d = dist(a, b);
  if (d < 1e-10) return [0, 0];
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
}

/** Signed area — positive = CCW, negative = CW */
function signedArea(pts: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return area / 2;
}

/** Check if two segments intersect (excluding shared endpoints). */
function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const d1x = a2[0] - a1[0], d1y = a2[1] - a1[1];
  const d2x = b2[0] - b1[0], d2y = b2[1] - b1[1];
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-10) return false; // parallel
  const t = ((b1[0] - a1[0]) * d2y - (b1[1] - a1[1]) * d2x) / cross;
  const u = ((b1[0] - a1[0]) * d1y - (b1[1] - a1[1]) * d1x) / cross;
  // Strict interior intersection (not at endpoints)
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
}

// ── Constraint types ──────────────────────────────────────────

export interface SketchWarning {
  type: "error" | "warning";
  message: string;
}

// ── Sketch class ──────────────────────────────────────────────

export class Sketch {
  private _points: Vec2[] = [];
  private _cursor: Vec2 = [0, 0];
  private _closed = false;

  /** Start a new sketch at origin or given point. */
  static begin(x = 0, y = 0): Sketch {
    const s = new Sketch();
    s._cursor = [x, y];
    s._points.push([x, y]);
    return s;
  }

  /** Move to absolute position, starting a new sub-path. */
  moveTo(x: number, y: number): this {
    this._cursor = [x, y];
    this._points.push([x, y]);
    return this;
  }

  /** Line to absolute position. */
  lineTo(x: number, y: number): this {
    this._cursor = [x, y];
    this._points.push([x, y]);
    return this;
  }

  /** Line by relative offset. */
  lineBy(dx: number, dy: number): this {
    return this.lineTo(this._cursor[0] + dx, this._cursor[1] + dy);
  }

  /**
   * Tangent arc — arc that smoothly continues the direction of the
   * previous segment, ending at (x, y). This guarantees G1 continuity
   * (no sharp corner at the junction).
   *
   * @param x End point X
   * @param y End point Y
   * @param segments Number of interpolation segments (default 12)
   */
  tangentArcTo(x: number, y: number, segments = 12): this {
    const pts = this._points;
    if (pts.length < 2) {
      // No previous segment — fall back to straight line
      return this.lineTo(x, y);
    }
    const [sx, sy] = this._cursor;
    const prev = pts[pts.length - 2];
    const dir = segmentDirection(prev, [sx, sy]);

    // Compute a quadratic bezier where the control point continues
    // the tangent direction from the current point
    const chordLen = dist([sx, sy], [x, y]);
    const cx = sx + dir[0] * chordLen * 0.5;
    const cy = sy + dir[1] * chordLen * 0.5;

    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const u = 1 - t;
      // Quadratic bezier: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
      const bx = u * u * sx + 2 * u * t * cx + t * t * x;
      const by = u * u * sy + 2 * u * t * cy + t * t * y;
      this._points.push([bx, by]);
    }
    this._cursor = [x, y];
    return this;
  }

  /** Arc approximation: bulge-based arc toward target. */
  arcTo(x: number, y: number, radius: number, segments = 8): this {
    const [sx, sy] = this._cursor;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const mx = sx + (x - sx) * t;
      const my = sy + (y - sy) * t;
      const bulge = radius * Math.sin(Math.PI * t) * 0.2;
      const dx = -(y - sy);
      const dy = x - sx;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      this._points.push([mx + (dx / len) * bulge, my + (dy / len) * bulge]);
    }
    this._cursor = [x, y];
    return this;
  }

  /** Close the path back to the first point. */
  close(): this {
    this._closed = true;
    return this;
  }

  /** Get the collected points. */
  points(): Vec2[] {
    return [...this._points];
  }

  // ── Validation ──────────────────────────────────────────────

  /** Validate the profile and return any issues. */
  validate(): SketchWarning[] {
    const warnings: SketchWarning[] = [];
    const pts = this._points;

    // Must have at least 3 points for a valid polygon
    if (pts.length < 3) {
      warnings.push({ type: "error", message: `Profile has only ${pts.length} point(s) — need at least 3 for a polygon.` });
      return warnings;
    }

    // Check for degenerate edges (zero-length segments)
    for (let i = 0; i < pts.length - 1; i++) {
      if (dist(pts[i], pts[i + 1]) < 1e-6) {
        warnings.push({ type: "warning", message: `Degenerate edge at point ${i} — two coincident points. This may cause manifold errors.` });
      }
    }

    // Check if profile is closed (first ≈ last, or .close() was called)
    if (!this._closed && dist(pts[0], pts[pts.length - 1]) > 0.1) {
      warnings.push({ type: "warning", message: "Profile is not closed — first and last points are not coincident. Manifold will close it implicitly, which may produce unexpected geometry." });
    }

    // Check for self-intersections
    for (let i = 0; i < pts.length; i++) {
      const i2 = (i + 1) % pts.length;
      for (let j = i + 2; j < pts.length; j++) {
        if (j === pts.length - 1 && i === 0) continue; // skip adjacent closing edge
        const j2 = (j + 1) % pts.length;
        if (segmentsIntersect(pts[i], pts[i2], pts[j], pts[j2])) {
          warnings.push({ type: "error", message: `Self-intersection between edges ${i}-${i + 1} and ${j}-${j + 1}. This will produce unpredictable 3D geometry.` });
          break; // one is enough
        }
      }
      if (warnings.some(w => w.type === "error" && w.message.includes("Self-intersection"))) break;
    }

    // Check area — too small profiles produce invisible geometry
    const area = Math.abs(signedArea(pts));
    if (area < 0.01) {
      warnings.push({ type: "error", message: `Profile area is near zero (${area.toFixed(4)}). The profile may be degenerate or all points are collinear.` });
    }

    return warnings;
  }

  // ── 3D operations ───────────────────────────────────────────

  /** Extrude this sketch into a solid along Z. Validates profile first. */
  extrude(height: number): Solid {
    const issues = this.validate();
    for (const issue of issues) {
      const prefix = issue.type === "error" ? "🚫 Sketch" : "⚠️ Sketch";
      console.warn(`${prefix}: ${issue.message}`);
    }
    if (issues.some(i => i.type === "error")) {
      console.warn("Sketch has errors — extrude may produce empty or broken geometry.");
    }
    return extrudePolygon(this._points, height);
  }

  /** Revolve this sketch around Y axis. Validates profile first. */
  revolve(segments?: number): Solid {
    const issues = this.validate();
    for (const issue of issues) {
      const prefix = issue.type === "error" ? "🚫 Sketch" : "⚠️ Sketch";
      console.warn(`${prefix}: ${issue.message}`);
    }
    return revolveEngine(this._points, segments);
  }

  /**
   * Sweep this sketch profile along a 3D path. Validates profile first.
   *
   * The profile is placed perpendicular to the path direction at each point,
   * creating a tube-like solid.
   *
   * @param path Array of 3D points defining the sweep path (at least 2 points).
   */
  sweep(path: Vec3[]): Solid {
    const issues = this.validate();
    for (const issue of issues) {
      const prefix = issue.type === "error" ? "🚫 Sketch" : "⚠️ Sketch";
      console.warn(`${prefix}: ${issue.message}`);
    }
    return sweepEngine(this._points, path);
  }

  /**
   * Extrude this sketch along an arbitrary direction vector.
   *
   * Eliminates the need to extrude along Z then manually rotate into position.
   * The profile is drawn in XY as usual, then the extrusion follows the given
   * direction instead of defaulting to +Z.
   *
   * @param direction Unit-ish direction vector [x, y, z] for the extrusion axis.
   * @param height    Length of extrusion along that direction.
   */
  extrudeAlong(direction: Vec3, height: number): Solid {
    const issues = this.validate();
    for (const issue of issues) {
      const prefix = issue.type === "error" ? "🚫 Sketch" : "⚠️ Sketch";
      console.warn(`${prefix}: ${issue.message}`);
    }

    // Extrude along Z first
    const base = extrudePolygon(this._points, height);

    // Normalize the direction
    const [dx, dy, dz] = direction;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-10) {
      throw new Error("extrudeAlong: direction vector must not be zero");
    }
    const nx = dx / len, ny = dy / len, nz = dz / len;

    // If direction is already +Z, skip rotation
    if (Math.abs(nx) < 1e-6 && Math.abs(ny) < 1e-6 && nz > 0) {
      return base;
    }

    // Build rotation matrix to align Z with the target direction
    const mat = alignZToDirection(nx, ny, nz);
    return new Solid(base._manifold.transform(mat));
  }
}

// ── Convenience constructors ──────────────────────────────────

/** Create a rectangular sketch centred at origin. */
export function rect(width: number, height: number): Sketch {
  const hw = width / 2;
  const hh = height / 2;
  return Sketch.begin(-hw, -hh)
    .lineTo(hw, -hh)
    .lineTo(hw, hh)
    .lineTo(-hw, hh)
    .close();
}

/** Create a circular sketch centred at origin (polygon approximation). */
export function circle(radius: number, segments = 32): Sketch {
  const s = new Sketch();
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const pt: Vec2 = [radius * Math.cos(a), radius * Math.sin(a)];
    if (i === 0) {
      s.moveTo(pt[0], pt[1]);
    } else {
      s.lineTo(pt[0], pt[1]);
    }
  }
  s.close();
  return s;
}
