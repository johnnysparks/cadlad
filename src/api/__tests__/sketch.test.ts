import { describe, it, expect, beforeAll } from "vitest";
import { initManifold } from "../../engine/manifold-backend.js";
import { Sketch, rect, circle } from "../sketch.js";

beforeAll(async () => {
  await initManifold();
});

describe("Sketch", () => {
  it("collects points from lineTo", () => {
    const pts = Sketch.begin(0, 0).lineTo(10, 0).lineTo(10, 10).lineTo(0, 10).close().points();
    expect(pts).toHaveLength(4);
  });

  it("lineBy uses relative offsets", () => {
    const pts = Sketch.begin(5, 5).lineBy(10, 0).lineBy(0, 10).lineBy(-10, 0).close().points();
    expect(pts[0]).toEqual([5, 5]);
    expect(pts[1]).toEqual([15, 5]);
    expect(pts[2]).toEqual([15, 15]);
    expect(pts[3]).toEqual([5, 15]);
  });

  it("extrude produces correct volume", () => {
    const s = rect(10, 20).extrude(5);
    expect(s.volume()).toBeCloseTo(1000, 0);
  });
});

describe("rect", () => {
  it("creates centered rectangle", () => {
    const pts = rect(10, 20).points();
    expect(pts).toHaveLength(4);
    // Should be centered at origin
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(-5);
    expect(Math.max(...xs)).toBeCloseTo(5);
    expect(Math.min(...ys)).toBeCloseTo(-10);
    expect(Math.max(...ys)).toBeCloseTo(10);
  });
});

describe("circle", () => {
  it("creates polygon with correct radius", () => {
    const pts = circle(10, 8).points();
    expect(pts).toHaveLength(8);
    for (const [x, y] of pts) {
      const dist = Math.sqrt(x * x + y * y);
      expect(dist).toBeCloseTo(10, 0);
    }
  });
});
