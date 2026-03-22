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

describe("validate", () => {
  it("passes for a valid closed polygon", () => {
    const issues = rect(10, 20).validate();
    expect(issues.filter(i => i.type === "error")).toHaveLength(0);
  });

  it("errors on fewer than 3 points", () => {
    const s = Sketch.begin(0, 0).lineTo(10, 0);
    const issues = s.validate();
    expect(issues.some(i => i.type === "error" && i.message.includes("2 point"))).toBe(true);
  });

  it("warns on unclosed profile", () => {
    const s = Sketch.begin(0, 0).lineTo(10, 0).lineTo(10, 10);
    const issues = s.validate();
    expect(issues.some(i => i.message.includes("not closed"))).toBe(true);
  });

  it("warns on degenerate edge", () => {
    const s = Sketch.begin(0, 0).lineTo(0, 0).lineTo(10, 0).lineTo(10, 10).close();
    const issues = s.validate();
    expect(issues.some(i => i.message.includes("Degenerate"))).toBe(true);
  });

  it("errors on self-intersection", () => {
    // Bowtie shape: crosses itself
    const s = Sketch.begin(0, 0).lineTo(10, 10).lineTo(10, 0).lineTo(0, 10).close();
    const issues = s.validate();
    expect(issues.some(i => i.type === "error" && i.message.includes("Self-intersection"))).toBe(true);
  });
});

describe("tangentArcTo", () => {
  it("produces more points than a straight line", () => {
    const s = Sketch.begin(0, 0).lineTo(10, 0).tangentArcTo(20, 10);
    expect(s.points().length).toBeGreaterThan(3);
  });

  it("starts from the current cursor", () => {
    const pts = Sketch.begin(0, 0).lineTo(10, 0).tangentArcTo(20, 10).points();
    const last = pts[pts.length - 1];
    expect(last[0]).toBeCloseTo(20, 0);
    expect(last[1]).toBeCloseTo(10, 0);
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
