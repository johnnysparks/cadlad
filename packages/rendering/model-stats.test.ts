import { beforeAll, describe, expect, it } from "vitest";
import { box } from "@cadlad/kernel/primitives.js";
import { initManifold } from "@cadlad/kernel/manifold-backend.js";
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
    expect(stats?.parts[0].id).toBe("handle");
    expect(stats?.parts[0].name).toBe("handle");
    expect(stats?.parts[1].id).toBe("cup-wall");
    expect(stats?.parts[1].name).toBe("cup wall");
    expect(stats?.parts[0].extents.x).toBeCloseTo(10, 3);

    expect(stats?.pairwise).toHaveLength(1);
    expect(stats?.pairwise[0].partAId).toBe("handle");
    expect(stats?.pairwise[0].partBId).toBe("cup-wall");
    expect(stats?.pairwise[0].intersects).toBe(false);
    expect(stats?.pairwise[0].minDistance).toBeCloseTo(15, 3);
    expect(stats?.componentCount).toBe(2);
    expect(stats?.checks.hasDisconnectedComponents).toBe(true);
  });

  it("disambiguates duplicate part names with stable ids", () => {
    const a = box(10, 10, 10).named("Panel").toBody();
    const b = box(10, 10, 10).translate(25, 0, 0).named("Panel").toBody();
    const stats = computeModelStats([a, b]);

    expect(stats?.parts.map((part) => part.id)).toEqual(["panel", "panel-2"]);
    expect(stats?.pairwise[0].partA).toBe("Panel");
    expect(stats?.pairwise[0].partB).toBe("Panel");
    expect(stats?.pairwise[0].partAId).toBe("panel");
    expect(stats?.pairwise[0].partBId).toBe("panel-2");
  });

  it("marks touching/overlapping bboxes as intersecting", () => {
    const a = box(10, 10, 10).named("a").toBody();
    const b = box(10, 10, 10).translate(5, 0, 0).named("b").toBody();
    const stats = computeModelStats([a, b]);

    expect(stats?.pairwise[0].intersects).toBe(true);
    expect(stats?.pairwise[0].minDistance).toBe(0);
    expect(stats?.componentCount).toBe(1);
    expect(stats?.checks.hasDisconnectedComponents).toBe(false);
  });
});
