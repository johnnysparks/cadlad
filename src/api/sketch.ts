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

type ConstraintKind = "coincident" | "fixed-distance" | "perpendicular" | "equal-length" | "tangent";

interface BaseConstraint {
  kind: ConstraintKind;
}

interface CoincidentConstraint extends BaseConstraint {
  kind: "coincident";
  pointA: string;
  pointB: string;
}

interface FixedDistanceConstraint extends BaseConstraint {
  kind: "fixed-distance";
  pointA: string;
  pointB: string;
  distance: number;
}

interface PerpendicularConstraint extends BaseConstraint {
  kind: "perpendicular";
  lineA: string;
  lineB: string;
}

interface EqualLengthConstraint extends BaseConstraint {
  kind: "equal-length";
  lineA: string;
  lineB: string;
}

interface TangentConstraint extends BaseConstraint {
  kind: "tangent";
  lineId: string;
  circleId: string;
}

type SketchConstraint =
  | CoincidentConstraint
  | FixedDistanceConstraint
  | PerpendicularConstraint
  | EqualLengthConstraint
  | TangentConstraint;

interface ConstraintPoint {
  id: string;
  x: number;
  y: number;
  fixed: boolean;
}

interface ConstraintLine {
  id: string;
  start: string;
  end: string;
}

interface ConstraintCircle {
  id: string;
  center: string;
  radius: number;
}

function normalize2(v: Vec2): Vec2 {
  const length = Math.hypot(v[0], v[1]);
  if (length < 1e-10) return [1, 0];
  return [v[0] / length, v[1] / length];
}

export interface ConstraintSolveOptions {
  iterations?: number;
  tolerance?: number;
}

/**
 * Lightweight iterative 2D sketch constraint solver.
 *
 * This is intentionally minimal and deterministic: it solves practical
 * geometric constraints (coincident, fixed-distance, perpendicular,
 * equal-length, tangent) for line-and-point based sketches without adding a
 * heavyweight symbolic math dependency.
 */
export class ConstrainedSketch {
  private readonly points = new Map<string, ConstraintPoint>();
  private readonly pointOrder: string[] = [];
  private readonly lines = new Map<string, ConstraintLine>();
  private readonly circles = new Map<string, ConstraintCircle>();
  private readonly constraints: SketchConstraint[] = [];

  point(id: string, x: number, y: number, opts?: { fixed?: boolean }): this {
    if (this.points.has(id)) throw new Error(`ConstrainedSketch.point: duplicate point id "${id}"`);
    this.points.set(id, { id, x, y, fixed: opts?.fixed ?? false });
    this.pointOrder.push(id);
    return this;
  }

  line(id: string, start: string, end: string): this {
    if (this.lines.has(id)) throw new Error(`ConstrainedSketch.line: duplicate line id "${id}"`);
    this.requirePoint(start);
    this.requirePoint(end);
    this.lines.set(id, { id, start, end });
    return this;
  }

  circle(id: string, center: string, radius: number): this {
    if (this.circles.has(id)) throw new Error(`ConstrainedSketch.circle: duplicate circle id "${id}"`);
    this.requirePoint(center);
    if (radius <= 0) throw new Error("ConstrainedSketch.circle: radius must be positive");
    this.circles.set(id, { id, center, radius });
    return this;
  }

  coincident(pointA: string, pointB: string): this {
    this.requirePoint(pointA);
    this.requirePoint(pointB);
    this.constraints.push({ kind: "coincident", pointA, pointB });
    return this;
  }

  fixedDistance(pointA: string, pointB: string, distance: number): this {
    this.requirePoint(pointA);
    this.requirePoint(pointB);
    if (distance <= 0) throw new Error("ConstrainedSketch.fixedDistance: distance must be positive");
    this.constraints.push({ kind: "fixed-distance", pointA, pointB, distance });
    return this;
  }

  perpendicular(lineA: string, lineB: string): this {
    this.requireLine(lineA);
    this.requireLine(lineB);
    this.constraints.push({ kind: "perpendicular", lineA, lineB });
    return this;
  }

  equalLength(lineA: string, lineB: string): this {
    this.requireLine(lineA);
    this.requireLine(lineB);
    this.constraints.push({ kind: "equal-length", lineA, lineB });
    return this;
  }

  tangent(lineId: string, circleId: string): this {
    this.requireLine(lineId);
    this.requireCircle(circleId);
    this.constraints.push({ kind: "tangent", lineId, circleId });
    return this;
  }

  solve(options?: ConstraintSolveOptions): this {
    const iterations = options?.iterations ?? 60;
    const tolerance = options?.tolerance ?? 1e-4;
    if (this.points.size < 2) {
      throw new Error("ConstrainedSketch.solve: define at least two points before solving");
    }

    for (let i = 0; i < iterations; i++) {
      let maxDelta = 0;
      for (const constraint of this.constraints) {
        const delta = this.applyConstraint(constraint);
        if (delta > maxDelta) maxDelta = delta;
      }
      if (maxDelta < tolerance) return this;
    }
    return this;
  }

  pointsSnapshot(): Record<string, Vec2> {
    const snapshot: Record<string, Vec2> = {};
    for (const [id, pt] of this.points.entries()) {
      snapshot[id] = [pt.x, pt.y];
    }
    return snapshot;
  }

  toSketch(pointOrder?: string[], close = true): Sketch {
    const order = pointOrder ?? this.pointOrder;
    if (order.length < 2) {
      throw new Error("ConstrainedSketch.toSketch: need at least two points");
    }
    const first = this.getPoint(order[0]);
    const sketch = Sketch.begin(first.x, first.y);
    for (let i = 1; i < order.length; i++) {
      const pt = this.getPoint(order[i]);
      sketch.lineTo(pt.x, pt.y);
    }
    if (close) sketch.close();
    return sketch;
  }

  private applyConstraint(constraint: SketchConstraint): number {
    switch (constraint.kind) {
      case "coincident":
        return this.applyCoincident(constraint);
      case "fixed-distance":
        return this.applyFixedDistance(constraint);
      case "perpendicular":
        return this.applyPerpendicular(constraint);
      case "equal-length":
        return this.applyEqualLength(constraint);
      case "tangent":
        return this.applyTangent(constraint);
      default:
        return 0;
    }
  }

  private applyCoincident(c: CoincidentConstraint): number {
    const a = this.getPoint(c.pointA);
    const b = this.getPoint(c.pointB);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (Math.abs(dx) < 1e-10 && Math.abs(dy) < 1e-10) return 0;
    if (a.fixed && b.fixed) return 0;
    if (a.fixed) return this.movePoint(b, -dx, -dy);
    if (b.fixed) return this.movePoint(a, dx, dy);
    const mx = dx * 0.5;
    const my = dy * 0.5;
    return Math.max(this.movePoint(a, mx, my), this.movePoint(b, -mx, -my));
  }

  private applyFixedDistance(c: FixedDistanceConstraint): number {
    const a = this.getPoint(c.pointA);
    const b = this.getPoint(c.pointB);
    const current = Math.hypot(b.x - a.x, b.y - a.y);
    const err = current - c.distance;
    if (Math.abs(err) < 1e-10) return 0;

    const direction = current < 1e-10 ? [1, 0] as Vec2 : normalize2([b.x - a.x, b.y - a.y]);
    const adjust = err;
    if (a.fixed && b.fixed) return Math.abs(err);
    if (a.fixed) return this.movePoint(b, -direction[0] * adjust, -direction[1] * adjust);
    if (b.fixed) return this.movePoint(a, direction[0] * adjust, direction[1] * adjust);

    const half = adjust * 0.5;
    return Math.max(
      this.movePoint(a, direction[0] * half, direction[1] * half),
      this.movePoint(b, -direction[0] * half, -direction[1] * half),
    );
  }

  private applyPerpendicular(c: PerpendicularConstraint): number {
    const lineA = this.getLine(c.lineA);
    const lineB = this.getLine(c.lineB);
    const a0 = this.getPoint(lineA.start);
    const a1 = this.getPoint(lineA.end);
    const b0 = this.getPoint(lineB.start);
    const b1 = this.getPoint(lineB.end);

    const va = normalize2([a1.x - a0.x, a1.y - a0.y]);
    const vb = [b1.x - b0.x, b1.y - b0.y] as Vec2;
    const lenB = Math.hypot(vb[0], vb[1]);
    if (lenB < 1e-10) return 0;

    const perpA = [-va[1], va[0]] as Vec2;
    const target = [perpA[0] * lenB, perpA[1] * lenB] as Vec2;
    const desiredB1 = [b0.x + target[0], b0.y + target[1]] as Vec2;
    if (!b1.fixed) {
      return this.movePoint(b1, desiredB1[0] - b1.x, desiredB1[1] - b1.y);
    }
    if (!b0.fixed) {
      const desiredB0 = [b1.x - target[0], b1.y - target[1]] as Vec2;
      return this.movePoint(b0, desiredB0[0] - b0.x, desiredB0[1] - b0.y);
    }
    return Math.abs(va[0] * vb[0] + va[1] * vb[1]);
  }

  private applyEqualLength(c: EqualLengthConstraint): number {
    const lineA = this.getLine(c.lineA);
    const lineB = this.getLine(c.lineB);
    const a0 = this.getPoint(lineA.start);
    const a1 = this.getPoint(lineA.end);
    const b0 = this.getPoint(lineB.start);
    const b1 = this.getPoint(lineB.end);

    const lenA = Math.hypot(a1.x - a0.x, a1.y - a0.y);
    const vb = [b1.x - b0.x, b1.y - b0.y] as Vec2;
    const lenB = Math.hypot(vb[0], vb[1]);
    if (lenB < 1e-10 || lenA < 1e-10) return 0;

    const dirB = normalize2(vb);
    const desired = [b0.x + dirB[0] * lenA, b0.y + dirB[1] * lenA] as Vec2;
    if (!b1.fixed) {
      return this.movePoint(b1, desired[0] - b1.x, desired[1] - b1.y);
    }
    if (!b0.fixed) {
      const desiredStart = [b1.x - dirB[0] * lenA, b1.y - dirB[1] * lenA] as Vec2;
      return this.movePoint(b0, desiredStart[0] - b0.x, desiredStart[1] - b0.y);
    }
    return Math.abs(lenA - lenB);
  }

  private applyTangent(c: TangentConstraint): number {
    const line = this.getLine(c.lineId);
    const circle = this.getCircle(c.circleId);
    const center = this.getPoint(circle.center);
    const p0 = this.getPoint(line.start);
    const p1 = this.getPoint(line.end);

    const lx = p1.x - p0.x;
    const ly = p1.y - p0.y;
    const lineLength = Math.hypot(lx, ly);
    if (lineLength < 1e-10) return 0;

    const nx = -ly / lineLength;
    const ny = lx / lineLength;
    const distToLine = Math.abs((center.x - p0.x) * nx + (center.y - p0.y) * ny);
    const error = distToLine - circle.radius;
    if (Math.abs(error) < 1e-10) return 0;

    // Shift the line along its normal to satisfy tangency.
    const direction = ((center.x - p0.x) * nx + (center.y - p0.y) * ny) >= 0 ? 1 : -1;
    const shiftX = nx * error * direction;
    const shiftY = ny * error * direction;

    if (!p0.fixed && !p1.fixed) {
      return Math.max(this.movePoint(p0, shiftX, shiftY), this.movePoint(p1, shiftX, shiftY));
    }
    if (!p0.fixed) return this.movePoint(p0, shiftX, shiftY);
    if (!p1.fixed) return this.movePoint(p1, shiftX, shiftY);
    return Math.abs(error);
  }

  private movePoint(point: ConstraintPoint, dx: number, dy: number): number {
    if (point.fixed) return 0;
    point.x += dx;
    point.y += dy;
    return Math.hypot(dx, dy);
  }

  private requirePoint(id: string): void {
    if (!this.points.has(id)) throw new Error(`ConstrainedSketch: unknown point "${id}"`);
  }

  private requireLine(id: string): void {
    if (!this.lines.has(id)) throw new Error(`ConstrainedSketch: unknown line "${id}"`);
  }

  private requireCircle(id: string): void {
    if (!this.circles.has(id)) throw new Error(`ConstrainedSketch: unknown circle "${id}"`);
  }

  private getPoint(id: string): ConstraintPoint {
    const point = this.points.get(id);
    if (!point) throw new Error(`ConstrainedSketch: unknown point "${id}"`);
    return point;
  }

  private getLine(id: string): ConstraintLine {
    const line = this.lines.get(id);
    if (!line) throw new Error(`ConstrainedSketch: unknown line "${id}"`);
    return line;
  }

  private getCircle(id: string): ConstraintCircle {
    const circle = this.circles.get(id);
    if (!circle) throw new Error(`ConstrainedSketch: unknown circle "${id}"`);
    return circle;
  }
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

  /** Create a stadium/slot sketch centred at origin. */
  static slot(width: number, height: number, endRadius: number): Sketch {
    return slot(width, height, endRadius);
  }

  /** Create an L-profile sketch centred at origin. */
  static lShape(w1: number, h1: number, w2: number, h2: number): Sketch {
    return lShape(w1, h1, w2, h2);
  }

  /** Create a C-channel sketch centred at origin. */
  static channel(width: number, height: number, flangeWidth: number): Sketch {
    return channel(width, height, flangeWidth);
  }

  /** Create a T-profile sketch centred at origin. */
  static tShape(w1: number, h1: number, w2: number, h2: number): Sketch {
    return tShape(w1, h1, w2, h2);
  }

  /** Create a constrained sketch builder with a lightweight geometric solver. */
  static constrained(): ConstrainedSketch {
    return new ConstrainedSketch();
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

function appendArc(
  sketch: Sketch,
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number,
): void {
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const a = startAngle + (endAngle - startAngle) * t;
    sketch.lineTo(centerX + radius * Math.cos(a), centerY + radius * Math.sin(a));
  }
}

/** Create a slot/stadium profile with rounded ends, centred at origin. */
export function slot(width: number, height: number, endRadius: number): Sketch {
  if (width <= 0 || height <= 0 || endRadius <= 0) {
    throw new Error("slot: width, height, and endRadius must be positive");
  }
  if (width < endRadius * 2) {
    throw new Error("slot: width must be at least 2 * endRadius");
  }
  if (height < endRadius * 2) {
    throw new Error("slot: height must be at least 2 * endRadius");
  }

  const hw = width / 2;
  const hh = height / 2;
  const segments = 12;
  const rightCenterX = hw - endRadius;
  const leftCenterX = -hw + endRadius;

  const s = Sketch.begin(rightCenterX, hh);
  appendArc(s, rightCenterX, 0, endRadius, Math.PI / 2, -Math.PI / 2, segments);
  s.lineTo(leftCenterX, -hh);
  appendArc(s, leftCenterX, 0, endRadius, -Math.PI / 2, -3 * Math.PI / 2, segments);
  s.close();
  return s;
}

/** Create an L-profile (angle) centred at origin. */
export function lShape(w1: number, h1: number, w2: number, h2: number): Sketch {
  if (w1 <= 0 || h1 <= 0 || w2 <= 0 || h2 <= 0) {
    throw new Error("lShape: all dimensions must be positive");
  }
  if (w2 >= w1 || h2 >= h1) {
    throw new Error("lShape: w2 < w1 and h2 < h1 are required");
  }

  const hw = w1 / 2;
  const hh = h1 / 2;
  const ix = -hw + w2;
  const iy = hh - h2;

  return Sketch.begin(-hw, -hh)
    .lineTo(hw, -hh)
    .lineTo(hw, iy)
    .lineTo(ix, iy)
    .lineTo(ix, hh)
    .lineTo(-hw, hh)
    .close();
}

/** Create a C-channel profile centred at origin. */
export function channel(width: number, height: number, flangeWidth: number): Sketch {
  if (width <= 0 || height <= 0 || flangeWidth <= 0) {
    throw new Error("channel: width, height, and flangeWidth must be positive");
  }
  if (flangeWidth >= width / 2 || flangeWidth >= height / 2) {
    throw new Error("channel: flangeWidth must be less than half of width and height");
  }

  const hw = width / 2;
  const hh = height / 2;
  const t = flangeWidth;
  const innerLeftX = -hw + t;
  const innerBottomY = -hh + t;
  const innerTopY = hh - t;

  return Sketch.begin(-hw, -hh)
    .lineTo(hw, -hh)
    .lineTo(hw, innerBottomY)
    .lineTo(innerLeftX, innerBottomY)
    .lineTo(innerLeftX, innerTopY)
    .lineTo(hw, innerTopY)
    .lineTo(hw, hh)
    .lineTo(-hw, hh)
    .close();
}

/** Create a T-profile centred at origin. */
export function tShape(w1: number, h1: number, w2: number, h2: number): Sketch {
  if (w1 <= 0 || h1 <= 0 || w2 <= 0 || h2 <= 0) {
    throw new Error("tShape: all dimensions must be positive");
  }
  if (w2 > w1) {
    throw new Error("tShape: w2 must be <= w1");
  }
  if (h2 >= h1) {
    throw new Error("tShape: h2 must be < h1");
  }

  const hw1 = w1 / 2;
  const hw2 = w2 / 2;
  const hh = h1 / 2;
  const stemTopY = hh - h2;

  return Sketch.begin(-hw1, stemTopY)
    .lineTo(-hw2, stemTopY)
    .lineTo(-hw2, -hh)
    .lineTo(hw2, -hh)
    .lineTo(hw2, stemTopY)
    .lineTo(hw1, stemTopY)
    .lineTo(hw1, hh)
    .lineTo(-hw1, hh)
    .close();
}
