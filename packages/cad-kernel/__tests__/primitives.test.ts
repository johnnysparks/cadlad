import { describe, it, expect, beforeAll } from "vitest";
import { initManifold } from "../manifold-backend.js";
import { box, cylinder, sphere, roundedRect, roundedBox, taperedBox, extrudePolygon } from "../primitives.js";

beforeAll(async () => {
  await initManifold();
});

describe("box", () => {
  it("creates geometry with correct volume", () => {
    const s = box(10, 20, 30);
    expect(s.volume()).toBeCloseTo(6000, 0);
  });

  it("has correct bounding box", () => {
    const bb = box(10, 20, 30).boundingBox();
    expect(bb.min[0]).toBeCloseTo(-5);
    expect(bb.max[0]).toBeCloseTo(5);
    expect(bb.min[1]).toBeCloseTo(-10);
    expect(bb.max[1]).toBeCloseTo(10);
    expect(bb.min[2]).toBeCloseTo(-15);
    expect(bb.max[2]).toBeCloseTo(15);
  });

  it("produces a valid mesh", () => {
    const mesh = box(10, 10, 10).toTriMesh();
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.indices.length).toBeGreaterThan(0);
  });
});

describe("cylinder", () => {
  it("creates geometry with expected volume", () => {
    const s = cylinder(20, 5);
    const expected = Math.PI * 25 * 20;
    // 32-segment polygon approximation is ~0.6% less than a true circle
    expect(Math.abs(s.volume() - expected) / expected).toBeLessThan(0.01);
  });

  it("supports tapered cylinder (cone)", () => {
    const s = cylinder(20, 10, 5);
    expect(s.volume()).toBeGreaterThan(0);
  });
});

describe("sphere", () => {
  it("creates geometry with expected volume", () => {
    const s = sphere(10);
    const expected = (4 / 3) * Math.PI * 1000;
    // Geodesic approximation is within ~3% of true sphere
    expect(Math.abs(s.volume() - expected) / expected).toBeLessThan(0.03);
  });
});

describe("roundedRect", () => {
  it("creates geometry with positive volume", () => {
    const s = roundedRect(20, 10, 2, 5);
    expect(s.volume()).toBeGreaterThan(0);
  });
});

describe("extrudePolygon", () => {
  it("extrudes a CCW square correctly", () => {
    const pts: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const s = extrudePolygon(pts, 5);
    expect(s.volume()).toBeCloseTo(500, 0);
  });

  it("auto-corrects CW winding", () => {
    // CW square — would produce empty geometry without auto-correction
    const pts: [number, number][] = [[0, 0], [0, 10], [10, 10], [10, 0]];
    const s = extrudePolygon(pts, 5);
    expect(s.volume()).toBeCloseTo(500, 0);
  });
});

describe("roundedBox", () => {
  it("creates geometry with positive volume", () => {
    const s = roundedBox(20, 20, 20, 3);
    expect(s.volume()).toBeGreaterThan(0);
  });

  it("volume is less than a sharp box (corners/edges are rounded)", () => {
    const sharp = box(20, 20, 20).volume();
    const rounded = roundedBox(20, 20, 20, 3).volume();
    expect(rounded).toBeLessThan(sharp);
    // But not drastically less — most of the volume is preserved
    expect(rounded).toBeGreaterThan(sharp * 0.7);
  });

  it("is centered at origin", () => {
    const bb = roundedBox(20, 30, 10, 2).boundingBox();
    expect(bb.min[0]).toBeCloseTo(-10, 0);
    expect(bb.max[0]).toBeCloseTo(10, 0);
    expect(bb.min[1]).toBeCloseTo(-15, 0);
    expect(bb.max[1]).toBeCloseTo(15, 0);
    expect(bb.min[2]).toBeCloseTo(-5, 0);
    expect(bb.max[2]).toBeCloseTo(5, 0);
  });

  it("clamps radius to half of smallest dimension", () => {
    // Radius 20 is larger than 10/2=5, should clamp
    const s = roundedBox(10, 20, 30, 20);
    expect(s.volume()).toBeGreaterThan(0);
  });
});

describe("taperedBox", () => {
  it("creates geometry with positive volume", () => {
    const s = taperedBox(10, 20, 20, 10, 10);
    expect(s.volume()).toBeGreaterThan(0);
  });

  it("identical top and bottom approximates a box", () => {
    const s = taperedBox(10, 20, 20, 20, 20);
    const expected = 20 * 20 * 10;
    // Hull-based loft is close but not exact
    expect(s.volume()).toBeGreaterThan(expected * 0.8);
    expect(s.volume()).toBeLessThan(expected * 1.2);
  });

  it("tapered box has less volume than full box", () => {
    const tapered = taperedBox(10, 20, 20, 10, 10);
    const full = 20 * 20 * 10;
    expect(tapered.volume()).toBeLessThan(full);
    expect(tapered.volume()).toBeGreaterThan(0);
  });

  it("has correct height", () => {
    const bb = taperedBox(15, 20, 20, 10, 10).boundingBox();
    expect(bb.max[2] - bb.min[2]).toBeCloseTo(15, 0);
  });
});
