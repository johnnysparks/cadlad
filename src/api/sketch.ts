/**
 * 2D Sketch API.
 *
 * Provides a path-builder for creating 2D profiles that can be
 * extruded, revolved, or used for boolean operations.
 */

import type { Vec2 } from "../engine/types.js";
import { extrudePolygon, revolve as revolveEngine } from "../engine/primitives.js";
import type { Solid } from "../engine/solid.js";

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

  /** Arc approximation: quarter-circle segments toward target. */
  arcTo(x: number, y: number, radius: number, segments = 8): this {
    const [sx, sy] = this._cursor;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      // Simple parametric interpolation with bulge
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

  /** Extrude this sketch into a solid along Z. */
  extrude(height: number): Solid {
    return extrudePolygon(this._points, height);
  }

  /** Revolve this sketch around Y axis. */
  revolve(segments?: number): Solid {
    return revolveEngine(this._points, segments);
  }
}

/**
 * Create a rectangular sketch centred at origin.
 */
export function rect(width: number, height: number): Sketch {
  const hw = width / 2;
  const hh = height / 2;
  return Sketch.begin(-hw, -hh)
    .lineTo(hw, -hh)
    .lineTo(hw, hh)
    .lineTo(-hw, hh)
    .close();
}

/**
 * Create a circular sketch centred at origin (polygon approximation).
 */
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
