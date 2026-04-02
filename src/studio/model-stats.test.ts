import { beforeAll, describe, expect, it } from "vitest";
import { box } from "../engine/primitives.js";
import { initManifold } from "../engine/manifold-backend.js";
import { computeModelStats } from "./model-stats.js";

describe("computeModelStats", () => {
  beforeAll(async () => {
    await initManifold();
  });
  it("returns named part stats and pairwise queries", () => {
    const a = box(10, 10, 10).named("handle").toBody();
    const b = box(10, 10, 10).translate(25, 0, 0).named("cup wall").toBody();
    const stats = computeModelStats([a, b]);

    expect(stats).toBeDefined();
    expect(stats?.parts).toHaveLength(2);
    expect(stats?.parts[0].name).toBe("handle");
    expect(stats?.parts[1].name).toBe("cup wall");
    expect(stats?.parts[0].extents.x).toBeCloseTo(10, 3);

    expect(stats?.pairwise).toHaveLength(1);
    expect(stats?.pairwise[0].intersects).toBe(false);
    expect(stats?.pairwise[0].minDistance).toBeCloseTo(15, 3);
  });

  it("marks touching/overlapping bboxes as intersecting", () => {
    const a = box(10, 10, 10).named("a").toBody();
    const b = box(10, 10, 10).translate(5, 0, 0).named("b").toBody();
    const stats = computeModelStats([a, b]);

    expect(stats?.pairwise[0].intersects).toBe(true);
    expect(stats?.pairwise[0].minDistance).toBe(0);
  });
});
