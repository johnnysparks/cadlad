import { describe, it, expect, beforeAll } from "vitest";
import { initManifold } from "../manifold-backend.js";
import { box, cylinder } from "../primitives.js";

beforeAll(async () => {
  await initManifold();
});

describe("transforms", () => {
  it("translate moves the bounding box", () => {
    const bb = box(10, 10, 10).translate(100, 0, 0).boundingBox();
    expect(bb.min[0]).toBeCloseTo(95);
    expect(bb.max[0]).toBeCloseTo(105);
  });

  it("scale changes volume", () => {
    const original = box(10, 10, 10).volume();
    const scaled = box(10, 10, 10).scale(2).volume();
    expect(scaled).toBeCloseTo(original * 8, 0);
  });

  it("rotate swaps dimensions", () => {
    const bb = box(10, 20, 30).rotate(0, 0, 90).boundingBox();
    // After 90° Z rotation, X and Y swap
    expect(bb.max[0] - bb.min[0]).toBeCloseTo(20, 0);
    expect(bb.max[1] - bb.min[1]).toBeCloseTo(10, 0);
  });
});

describe("booleans", () => {
  it("union increases volume", () => {
    const a = box(10, 10, 10);
    const b = box(10, 10, 10).translate(5, 0, 0);
    const u = a.union(b);
    expect(u.volume()).toBeGreaterThan(a.volume());
    expect(u.volume()).toBeLessThan(a.volume() * 2);
  });

  it("subtract decreases volume", () => {
    const big = box(20, 20, 20);
    const small = box(10, 10, 10);
    const result = big.subtract(small);
    expect(result.volume()).toBeCloseTo(20 ** 3 - 10 ** 3, 0);
  });

  it("intersect produces overlap volume", () => {
    const a = box(10, 10, 10);
    const b = box(10, 10, 10).translate(5, 0, 0);
    const i = a.intersect(b);
    // Overlap is 5×10×10 = 500
    expect(i.volume()).toBeCloseTo(500, 0);
  });
});

describe("_derive preserves metadata", () => {
  it("color survives translate", () => {
    const body = box(10, 10, 10).color("#ff0000").translate(5, 0, 0).toBody();
    expect(body.color![0]).toBeCloseTo(1, 1);
    expect(body.color![1]).toBeCloseTo(0, 1);
    expect(body.color![2]).toBeCloseTo(0, 1);
  });

  it("name survives subtract", () => {
    const body = box(20, 20, 20)
      .named("housing")
      .subtract(box(10, 10, 10))
      .toBody();
    expect(body.name).toBe("housing");
  });

  it("color survives union chain", () => {
    const body = box(10, 10, 10)
      .color("#00ff00")
      .union(box(5, 5, 5).translate(10, 0, 0))
      .toBody();
    expect(body.color![1]).toBeCloseTo(1, 1); // green channel
  });

  it("color survives rotate and scale", () => {
    const body = box(10, 10, 10)
      .color("#0000ff")
      .rotate(45, 0, 0)
      .scale(2)
      .toBody();
    expect(body.color![2]).toBeCloseTo(1, 1); // blue channel
  });
});

describe("export", () => {
  it("toTriMesh produces valid typed arrays", () => {
    const mesh = box(10, 10, 10).toTriMesh();
    expect(mesh.positions).toBeInstanceOf(Float32Array);
    expect(mesh.normals).toBeInstanceOf(Float32Array);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
  });

  it("toSTL produces correct buffer size", () => {
    const s = box(10, 10, 10);
    const mesh = s.toTriMesh();
    const stl = s.toSTL();
    const numTris = mesh.indices.length / 3;
    expect(stl.byteLength).toBe(80 + 4 + numTris * 50);
  });
});
