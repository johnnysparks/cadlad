import { describe, expect, it } from "vitest";
import { collectHints } from "../hints.js";
import type { GeometryStats } from "../../engine/types.js";

function buildStats(overrides?: Partial<GeometryStats>): GeometryStats {
  return {
    triangles: 36,
    bodies: 3,
    componentCount: 1,
    boundingBox: { min: [-10, -5, 0], max: [10, 5, 10] },
    volume: 3000,
    surfaceArea: 2400,
    parts: [
      {
        index: 0,
        id: "part-1",
        name: "part-1",
        triangles: 12,
        boundingBox: { min: [-10, -5, 0], max: [-8, -3, 2] },
        extents: { x: 2, y: 2, z: 2 },
        volume: 8,
        surfaceArea: 24,
      },
      {
        index: 1,
        id: "part-2",
        name: "part-2",
        triangles: 12,
        boundingBox: { min: [-2, -5, 0], max: [0, -3, 2] },
        extents: { x: 2, y: 2, z: 2 },
        volume: 8,
        surfaceArea: 24,
      },
      {
        index: 2,
        id: "part-3",
        name: "part-3",
        triangles: 12,
        boundingBox: { min: [6, -5, 0], max: [8, -3, 2] },
        extents: { x: 2, y: 2, z: 2 },
        volume: 8,
        surfaceArea: 24,
      },
    ],
    pairwise: [],
    checks: {
      hasZeroVolume: false,
      hasDegenerateBoundingBox: false,
      hasDisconnectedComponents: false,
    },
    ...overrides,
  };
}

describe("collectHints", () => {
  it("emits deep boolean chain hint for 5+ sequential subtract calls", () => {
    const source = `
      return box(10,10,10)
        .subtract(box(1,1,20))
        .subtract(box(1,1,20))
        .subtract(box(1,1,20))
        .subtract(box(1,1,20))
        .subtract(box(1,1,20));
    `;

    const hints = collectHints({ emptyBodies: 0, source });
    expect(hints.some((hint) => hint.id === "deep-boolean-chain")).toBe(true);
  });

  it("emits repeated geometry and symmetry hints from stats", () => {
    const hints = collectHints({
      emptyBodies: 0,
      source: "return [box(2,2,2), box(2,2,2).translate(8,0,0), box(2,2,2).translate(16,0,0)]",
      stats: buildStats(),
    });

    expect(hints.some((hint) => hint.id === "repeated-geometry")).toBe(true);
    expect(hints.some((hint) => hint.id === "missed-symmetry")).toBe(true);
  });

  it("emits sketch and magic number hints when literals dominate", () => {
    const source = `
      const profile = Sketch.begin()
        .moveTo([0, 0])
        .lineTo([20, 0])
        .lineTo([20, 10])
        .lineTo([0, 10])
        .close()
        .extrude(5);
      return profile.translate(10, 0, 0).translate(20, 0, 0).translate(30, 0, 0);
    `;

    const hints = collectHints({ emptyBodies: 0, source });
    expect(hints.some((hint) => hint.id === "magic-numbers")).toBe(true);
    expect(hints.some((hint) => hint.id === "unparameterized-dimensions")).toBe(true);
  });
});
