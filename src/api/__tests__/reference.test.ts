import { beforeAll, describe, expect, it } from "vitest";
import { initManifold } from "../../engine/manifold-backend.js";
import { box } from "../../engine/primitives.js";
import { axis, datum, plane, referenceFeature } from "../reference.js";

beforeAll(async () => {
  await initManifold();
});

describe("reference geometry factories", () => {
  it("creates principal construction planes with offsets", () => {
    expect(plane.XY(12)).toEqual({ origin: [0, 0, 12], normal: [0, 0, 1] });
    expect(plane.XZ(5)).toEqual({ origin: [0, 5, 0], normal: [0, 1, 0] });
    expect(plane.YZ(-3)).toEqual({ origin: [-3, 0, 0], normal: [1, 0, 0] });
  });

  it("creates midplanes from a solid bbox", () => {
    const solid = box(10, 20, 30).translate(4, -6, 8);
    expect(plane.midplane(solid, "z")).toEqual({ origin: [4, -6, 8], normal: [0, 0, 1] });
    expect(plane.midplane(solid, "x")).toEqual({ origin: [4, -6, 8], normal: [1, 0, 0] });
  });

  it("creates world axes", () => {
    expect(axis.X()).toEqual({ origin: [0, 0, 0], direction: [1, 0, 0] });
    expect(axis.Y([1, 2, 3])).toEqual({ origin: [1, 2, 3], direction: [0, 1, 0] });
    expect(axis.Z()).toEqual({ origin: [0, 0, 0], direction: [0, 0, 1] });
  });

  it("derives datums from bbox anchors", () => {
    const solid = box(10, 20, 30).translate(4, -6, 8);
    expect(datum.fromBBox(solid, "top")).toEqual({ point: [4, -6, 23], name: undefined });
    expect(datum.fromBBox(solid, "bottom-front-left", "corner")).toEqual({
      point: [-1, -16, -7],
      name: "corner",
    });
  });

  it("builds scene feature declarations for references", () => {
    expect(referenceFeature.plane("mid", "Midplane")).toEqual({
      id: "mid",
      kind: "reference.plane",
      label: "Midplane",
      refs: undefined,
    });
  });
});
