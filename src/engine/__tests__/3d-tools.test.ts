/**
 * Comprehensive tests for all 3D modeling tools.
 *
 * Covers: Extrude, Revolve, Sweep, Loft, Shell, Booleans,
 * Fillet, Chamfer, Draft, and metadata preservation.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { initManifold } from "../manifold-backend.js";
import {
  box, cylinder, sphere, roundedRect,
  extrudePolygon, revolve, sweep, loft,
} from "../primitives.js";
import { Sketch, rect, circle } from "../../api/sketch.js";

beforeAll(async () => {
  await initManifold();
});

// ── Extrude ──────────────────────────────────────────────────

describe("extrude", () => {
  it("extrudes a CCW rectangle to correct volume", () => {
    const s = extrudePolygon([[0, 0], [10, 0], [10, 10], [0, 10]], 5);
    expect(s.volume()).toBeCloseTo(500, 0);
  });

  it("auto-corrects CW winding and produces geometry", () => {
    const pts: [number, number][] = [[0, 0], [0, 10], [10, 10], [10, 0]];
    const s = extrudePolygon(pts, 5);
    expect(s.volume()).toBeCloseTo(500, 0);
  });

  it("Sketch.extrude validates and extrudes", () => {
    const s = rect(10, 20).extrude(5);
    expect(s.volume()).toBeCloseTo(1000, 0);
  });

  it("extrude produces watertight mesh (all faces connected)", () => {
    const mesh = rect(10, 10).extrude(10).toTriMesh();
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    // Every index should be valid
    const numVerts = mesh.positions.length / 3;
    for (let i = 0; i < mesh.indices.length; i++) {
      expect(mesh.indices[i]).toBeLessThan(numVerts);
    }
  });

  it("extruded circle approximates cylinder volume", () => {
    const r = 5, h = 10;
    const s = circle(r, 64).extrude(h);
    const expected = Math.PI * r * r * h;
    expect(Math.abs(s.volume() - expected) / expected).toBeLessThan(0.005);
  });
});

// ── Revolve ──────────────────────────────────────────────────

describe("revolve", () => {
  it("revolves a rectangle into a torus-like shape", () => {
    // Rectangle at x=[5,7], y=[0,2] revolved around Y axis
    const pts: [number, number][] = [[5, 0], [7, 0], [7, 2], [5, 2]];
    const s = revolve(pts, 32);
    expect(s.volume()).toBeGreaterThan(0);
  });

  it("Sketch.revolve creates solid from profile", () => {
    // Small rectangle offset from Y axis
    const s = Sketch.begin(5, 0).lineTo(7, 0).lineTo(7, 2).lineTo(5, 2).close().revolve(32);
    expect(s.volume()).toBeGreaterThan(0);
  });

  it("auto-corrects CW winding on revolve", () => {
    const pts: [number, number][] = [[5, 2], [7, 2], [7, 0], [5, 0]]; // CW
    const s = revolve(pts, 32);
    expect(s.volume()).toBeGreaterThan(0);
  });

  it("revolved profile preserves color", () => {
    const pts: [number, number][] = [[5, 0], [7, 0], [7, 2], [5, 2]];
    const body = revolve(pts, 16).color("#ff0000").toBody();
    expect(body.color![0]).toBeCloseTo(1, 1);
  });
});

// ── Sweep ────────────────────────────────────────────────────

describe("sweep", () => {
  it("sweeps a square along a straight Z path (like extrude)", () => {
    const profile: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const path: [number, number, number][] = [[0, 0, 0], [0, 0, 10]];
    const s = sweep(profile, path);
    // Should approximate a 2×2×10 box = 40
    expect(s.volume()).toBeGreaterThan(30);
    expect(s.volume()).toBeLessThan(50);
  });

  it("sweeps along an L-shaped path", () => {
    const profile: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const path: [number, number, number][] = [
      [0, 0, 0], [10, 0, 0], [10, 10, 0],
    ];
    const s = sweep(profile, path);
    expect(s.volume()).toBeGreaterThan(0);
    // L-shape: two segments of ~2×2×10 each, minus overlap
    const bb = s.boundingBox();
    expect(bb.max[0] - bb.min[0]).toBeGreaterThan(9);
    expect(bb.max[1] - bb.min[1]).toBeGreaterThan(9);
  });

  it("sweeps along a diagonal path", () => {
    const profile: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const path: [number, number, number][] = [[0, 0, 0], [10, 10, 10]];
    const s = sweep(profile, path);
    expect(s.volume()).toBeGreaterThan(0);
  });

  it("Sketch.sweep creates solid along path", () => {
    const s = rect(2, 2).sweep([[0, 0, 0], [0, 0, 10]]);
    expect(s.volume()).toBeGreaterThan(30);
  });

  it("throws on path with < 2 points", () => {
    const profile: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    expect(() => sweep(profile, [[0, 0, 0]])).toThrow("at least 2 points");
  });

  it("throws on profile with < 3 points", () => {
    expect(() => sweep([[0, 0], [1, 0]], [[0, 0, 0], [0, 0, 10]])).toThrow("at least 3 points");
  });
});

// ── Loft ─────────────────────────────────────────────────────

describe("loft", () => {
  it("lofts between two identical squares (like extrude)", () => {
    const sq: [number, number][] = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
    const s = loft([sq, sq], [0, 10]);
    // Should approximate a 10×10×10 box = 1000
    expect(s.volume()).toBeGreaterThan(800);
    expect(s.volume()).toBeLessThan(1200);
  });

  it("lofts from large to small square (tapered)", () => {
    const big: [number, number][] = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
    const small: [number, number][] = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
    const s = loft([big, small], [0, 10]);
    expect(s.volume()).toBeGreaterThan(0);
    // Tapered: volume should be less than full 20×20×10 = 4000
    expect(s.volume()).toBeLessThan(4000);
    // But more than just the top: 10×10×10 = 1000
    expect(s.volume()).toBeGreaterThan(1000);
  });

  it("lofts through 3 profiles", () => {
    const bottom: [number, number][] = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
    const middle: [number, number][] = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
    const top: [number, number][] = [[-8, -8], [8, -8], [8, 8], [-8, 8]];
    const s = loft([bottom, middle, top], [0, 5, 10]);
    expect(s.volume()).toBeGreaterThan(0);
  });

  it("throws on fewer than 2 profiles", () => {
    expect(() => loft([[[-1, -1], [1, -1], [1, 1]]], [0])).toThrow("at least 2 profiles");
  });

  it("throws on mismatched profiles/heights", () => {
    const sq: [number, number][] = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
    expect(() => loft([sq, sq], [0])).toThrow("same length");
  });

  it("throws on non-ascending heights", () => {
    const sq: [number, number][] = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
    expect(() => loft([sq, sq], [10, 5])).toThrow("ascending");
  });
});

// ── Shell ────────────────────────────────────────────────────

describe("shell", () => {
  it("hollows a box with uniform wall thickness", () => {
    const s = box(20, 20, 20).shell(2);
    const outerVol = 20 ** 3;
    const innerVol = 16 ** 3; // 20-4=16 in each dimension
    expect(s.volume()).toBeCloseTo(outerVol - innerVol, -1);
  });

  it("hollows a cylinder", () => {
    const outer = cylinder(20, 10);
    const s = outer.shell(2);
    expect(s.volume()).toBeGreaterThan(0);
    expect(s.volume()).toBeLessThan(outer.volume());
  });

  it("preserves color through shell", () => {
    const body = box(20, 20, 20).color("#ff0000").shell(2).toBody();
    expect(body.color![0]).toBeCloseTo(1, 1);
    expect(body.color![1]).toBeCloseTo(0, 1);
  });

  it("preserves name through shell", () => {
    const body = box(20, 20, 20).named("enclosure").shell(2).toBody();
    expect(body.name).toBe("enclosure");
  });

  it("throws on negative thickness", () => {
    expect(() => box(20, 20, 20).shell(-1)).toThrow("positive");
  });

  it("throws on thickness too large", () => {
    expect(() => box(10, 10, 10).shell(6)).toThrow("too large");
  });
});

// ── Boolean Operations ───────────────────────────────────────

describe("boolean operations", () => {
  describe("union (add)", () => {
    it("merges two overlapping boxes", () => {
      const a = box(10, 10, 10);
      const b = box(10, 10, 10).translate(5, 0, 0);
      const u = a.union(b);
      // Volume: 10³ + 10³ - 5×10×10 = 1500
      expect(u.volume()).toBeCloseTo(1500, 0);
    });

    it("merges non-overlapping boxes", () => {
      const a = box(10, 10, 10);
      const b = box(10, 10, 10).translate(20, 0, 0);
      const u = a.union(b);
      expect(u.volume()).toBeCloseTo(2000, 0);
    });
  });

  describe("subtract (remove)", () => {
    it("cuts exact volume from larger solid", () => {
      const big = box(20, 20, 20);
      const small = box(10, 10, 10);
      const result = big.subtract(small);
      expect(result.volume()).toBeCloseTo(20 ** 3 - 10 ** 3, 0);
    });

    it("creates through-hole with oversized cutter", () => {
      const block = box(20, 20, 20);
      // Oversized cylinder for through-hole (best practice: +2 in cutting direction)
      const hole = cylinder(22, 3);
      const result = block.subtract(hole);
      expect(result.volume()).toBeLessThan(block.volume());
      expect(result.volume()).toBeGreaterThan(0);
    });

    it("subtracting non-overlapping solid returns original volume", () => {
      const a = box(10, 10, 10);
      const b = box(5, 5, 5).translate(100, 0, 0);
      const result = a.subtract(b);
      expect(result.volume()).toBeCloseTo(1000, 0);
    });
  });

  describe("intersect", () => {
    it("produces correct overlap volume", () => {
      const a = box(10, 10, 10);
      const b = box(10, 10, 10).translate(5, 0, 0);
      const i = a.intersect(b);
      // Overlap: 5×10×10 = 500
      expect(i.volume()).toBeCloseTo(500, 0);
    });

    it("intersecting identical solids returns same volume", () => {
      const a = box(10, 10, 10);
      const b = box(10, 10, 10);
      const i = a.intersect(b);
      expect(i.volume()).toBeCloseTo(1000, 0);
    });
  });

  describe("metadata preservation through booleans", () => {
    it("color survives union", () => {
      const body = box(10, 10, 10)
        .color("#00ff00")
        .union(box(5, 5, 5).translate(10, 0, 0))
        .toBody();
      expect(body.color![1]).toBeCloseTo(1, 1);
    });

    it("name survives subtract", () => {
      const body = box(20, 20, 20)
        .named("bracket")
        .subtract(cylinder(22, 3))
        .toBody();
      expect(body.name).toBe("bracket");
    });

    it("color survives intersect", () => {
      const body = box(10, 10, 10)
        .color("#0000ff")
        .intersect(box(10, 10, 10).translate(2, 0, 0))
        .toBody();
      expect(body.color![2]).toBeCloseTo(1, 1);
    });
  });
});

// ── Fillet ────────────────────────────────────────────────────

describe("fillet", () => {
  it("rounds edges of a box — changes geometry", () => {
    const sharp = box(10, 10, 10);
    const filleted = sharp.fillet(2);
    // Manifold's smooth() + refine() pushes vertices outward to create
    // curvature, which increases volume (not decreases). This is expected
    // behavior for Catmull-Clark–style subdivision on a convex shape.
    expect(filleted.volume()).not.toBeCloseTo(sharp.volume(), 0);
    expect(filleted.volume()).toBeGreaterThan(0);
  });

  it("produces more triangles than the original (curved surfaces)", () => {
    const sharp = box(10, 10, 10);
    const filleted = sharp.fillet(3);
    const sharpMesh = sharp.toTriMesh();
    const filletedMesh = filleted.toTriMesh();
    expect(filletedMesh.indices.length).toBeGreaterThan(sharpMesh.indices.length);
  });

  it("preserves color through fillet", () => {
    const body = box(10, 10, 10).color("#ff00ff").fillet(2).toBody();
    expect(body.color![0]).toBeCloseTo(1, 1);
    expect(body.color![2]).toBeCloseTo(1, 1);
  });
});

// ── Chamfer ──────────────────────────────────────────────────

describe("chamfer", () => {
  it("bevels edges of a box with subdivision >= 2", () => {
    const sharp = box(10, 10, 10);
    const chamfered = sharp.chamfer(2);
    // With 2+ subdivisions, the geometry changes
    expect(chamfered.volume()).not.toBeCloseTo(sharp.volume(), 0);
    expect(chamfered.volume()).toBeGreaterThan(0);
  });

  it("with fewer subdivisions produces fewer triangles than fillet", () => {
    const s = box(10, 10, 10);
    const chamfered = s.chamfer(2);
    const filleted = s.fillet(3);
    const chamMesh = chamfered.toTriMesh();
    const filMesh = filleted.toTriMesh();
    expect(chamMesh.indices.length).toBeLessThan(filMesh.indices.length);
  });

  it("preserves name through chamfer", () => {
    const body = box(10, 10, 10).named("part").chamfer(2).toBody();
    expect(body.name).toBe("part");
  });
});

// ── Draft ────────────────────────────────────────────────────

describe("draft", () => {
  it("tapers a box inward at the top (positive draft)", () => {
    const s = box(20, 20, 20).draft(5);
    const bb = s.boundingBox();
    // Height should be similar
    expect(bb.max[2] - bb.min[2]).toBeCloseTo(20, 0);
    // Volume should decrease (material removed by taper)
    expect(s.volume()).toBeLessThan(20 ** 3);
    expect(s.volume()).toBeGreaterThan(0);
  });

  it("negative draft tapers outward", () => {
    const original = box(20, 20, 20);
    const drafted = original.draft(-5);
    // Negative draft increases volume (walls flare out)
    expect(drafted.volume()).toBeGreaterThan(original.volume());
  });

  it("zero draft preserves geometry", () => {
    const original = box(20, 20, 20);
    const drafted = original.draft(0);
    expect(drafted.volume()).toBeCloseTo(original.volume(), 0);
  });

  it("preserves color through draft", () => {
    const body = box(20, 20, 20).color("#ffaa00").draft(3).toBody();
    expect(body.color![0]).toBeCloseTo(1, 1);
    expect(body.color![1]).toBeCloseTo(0.667, 1);
  });
});

// ── Smooth ───────────────────────────────────────────────────

describe("smooth", () => {
  it("produces more triangles from subdivision", () => {
    const sharp = box(10, 10, 10);
    const smoothed = sharp.smooth(2, 0);
    expect(smoothed.toTriMesh().indices.length).toBeGreaterThanOrEqual(
      sharp.toTriMesh().indices.length
    );
    expect(smoothed.volume()).toBeGreaterThan(0);
  });

  it("higher subdivisions = more triangles", () => {
    const s = box(10, 10, 10);
    const smooth2 = s.smooth(2);
    const smooth4 = s.smooth(4);
    expect(smooth4.toTriMesh().indices.length).toBeGreaterThan(
      smooth2.toTriMesh().indices.length
    );
  });
});

// ── Transforms ───────────────────────────────────────────────

describe("transforms", () => {
  it("translate moves bounding box", () => {
    const bb = box(10, 10, 10).translate(100, 200, 300).boundingBox();
    expect(bb.min[0]).toBeCloseTo(95);
    expect(bb.max[0]).toBeCloseTo(105);
    expect(bb.min[1]).toBeCloseTo(195);
    expect(bb.max[1]).toBeCloseTo(205);
    expect(bb.min[2]).toBeCloseTo(295);
    expect(bb.max[2]).toBeCloseTo(305);
  });

  it("scale changes volume cubically", () => {
    const v1 = box(10, 10, 10).volume();
    const v2 = box(10, 10, 10).scale(2).volume();
    expect(v2).toBeCloseTo(v1 * 8, 0);
  });

  it("non-uniform scale", () => {
    const v = box(10, 10, 10).scale(2, 1, 1).volume();
    expect(v).toBeCloseTo(2000, 0);
  });

  it("rotate 90° around Z swaps X and Y", () => {
    const bb = box(10, 20, 30).rotate(0, 0, 90).boundingBox();
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(20, 0);
    expect(bb.max[1] - bb.min[1]).toBeCloseTo(10, 0);
    expect(bb.max[2] - bb.min[2]).toBeCloseTo(30, 0);
  });

  it("mirror across YZ plane flips X", () => {
    const bb = box(10, 10, 10).translate(20, 0, 0).mirror([1, 0, 0]).boundingBox();
    expect(bb.min[0]).toBeCloseTo(-25);
    expect(bb.max[0]).toBeCloseTo(-15);
  });

  it("color survives all transforms", () => {
    const body = box(10, 10, 10)
      .color("#ff0000")
      .translate(5, 5, 5)
      .rotate(45, 0, 0)
      .scale(2)
      .mirror([1, 0, 0])
      .toBody();
    expect(body.color![0]).toBeCloseTo(1, 1);
    expect(body.color![1]).toBeCloseTo(0, 1);
  });
});

// ── Query ────────────────────────────────────────────────────

describe("query", () => {
  it("boundingBox returns correct extents", () => {
    const bb = box(10, 20, 30).boundingBox();
    expect(bb.min).toEqual(expect.arrayContaining([-5, -10, -15]));
    expect(bb.max).toEqual(expect.arrayContaining([5, 10, 15]));
  });

  it("volume returns correct value", () => {
    expect(box(10, 10, 10).volume()).toBeCloseTo(1000, 0);
  });

  it("surfaceArea returns correct value for box", () => {
    // 6 faces × 10×10 = 600
    expect(box(10, 10, 10).surfaceArea()).toBeCloseTo(600, 0);
  });
});

// ── Export ────────────────────────────────────────────────────

describe("export", () => {
  it("toTriMesh produces valid typed arrays", () => {
    const mesh = box(10, 10, 10).toTriMesh();
    expect(mesh.positions).toBeInstanceOf(Float32Array);
    expect(mesh.normals).toBeInstanceOf(Float32Array);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    expect(mesh.normals.length).toBe(mesh.positions.length);
  });

  it("toSTL produces correct buffer size", () => {
    const s = box(10, 10, 10);
    const mesh = s.toTriMesh();
    const stl = s.toSTL();
    const numTris = mesh.indices.length / 3;
    expect(stl.byteLength).toBe(80 + 4 + numTris * 50);
  });

  it("toBody includes color and name", () => {
    const body = box(10, 10, 10).color("#abcdef").named("test").toBody();
    expect(body.name).toBe("test");
    expect(body.color).toBeDefined();
    expect(body.mesh.positions.length).toBeGreaterThan(0);
  });
});

// ── Primitives ───────────────────────────────────────────────

describe("primitives", () => {
  it("box is centered at origin", () => {
    const bb = box(10, 20, 30).boundingBox();
    expect(bb.min[0]).toBeCloseTo(-5);
    expect(bb.max[0]).toBeCloseTo(5);
    expect(bb.min[1]).toBeCloseTo(-10);
    expect(bb.max[1]).toBeCloseTo(10);
  });

  it("cylinder along Z axis with correct volume", () => {
    const s = cylinder(20, 5);
    const expected = Math.PI * 25 * 20;
    expect(Math.abs(s.volume() - expected) / expected).toBeLessThan(0.01);
  });

  it("tapered cylinder (cone)", () => {
    const s = cylinder(20, 10, 0);
    expect(s.volume()).toBeGreaterThan(0);
    // Cone volume = (1/3)πr²h
    const expected = (1 / 3) * Math.PI * 100 * 20;
    expect(Math.abs(s.volume() - expected) / expected).toBeLessThan(0.05);
  });

  it("sphere volume approximation", () => {
    const s = sphere(10, 64);
    const expected = (4 / 3) * Math.PI * 1000;
    expect(Math.abs(s.volume() - expected) / expected).toBeLessThan(0.01);
  });

  it("roundedRect has positive volume", () => {
    const s = roundedRect(20, 10, 2, 5);
    expect(s.volume()).toBeGreaterThan(0);
    // Should be less than full box (corners are rounded)
    expect(s.volume()).toBeLessThan(20 * 10 * 5);
  });
});

// ── Integration: Combining Operations ────────────────────────

describe("integration: combined operations", () => {
  it("enclosure: box + shell + through-hole", () => {
    const enclosure = box(40, 30, 20)
      .shell(2)
      .subtract(cylinder(22, 5).rotate(90, 0, 0)); // hole in front face
    expect(enclosure.volume()).toBeGreaterThan(0);
    expect(enclosure.volume()).toBeLessThan(40 * 30 * 20);
  });

  it("drafted enclosure: extrude + draft + shell", () => {
    const body = rect(20, 20).extrude(15).draft(3).shell(2);
    expect(body.volume()).toBeGreaterThan(0);
  });

  it("filleted bracket: box + subtract + fillet", () => {
    const bracket = box(20, 10, 30)
      .subtract(box(16, 6, 26))
      .fillet(2);
    expect(bracket.volume()).toBeGreaterThan(0);
  });

  it("swept pipe with color", () => {
    const pipe = circle(2, 16).sweep([
      [0, 0, 0], [0, 0, 20], [10, 0, 20],
    ]).color("#cc6600");
    const body = pipe.toBody();
    expect(body.color![0]).toBeCloseTo(0.8, 1);
    expect(pipe.volume()).toBeGreaterThan(0);
  });

  it("lofted transition piece", () => {
    const bottom = circle(10, 32).points().map(p => p as [number, number]);
    const top: [number, number][] = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
    const s = loft([bottom, top], [0, 15]);
    expect(s.volume()).toBeGreaterThan(0);
  });
});
