import { describe, expect, it } from "vitest";
import { createDefaultFeatureRegistry } from "../feature-registry.js";

describe("FeatureRegistry", () => {
  it("requires strict roof.gable args", () => {
    const registry = createDefaultFeatureRegistry();

    const validation = registry.validate("roof.gable", {
      id: "roof-main",
      width: 30,
      depth: 20,
      pitchDeg: 35,
      overhang: 2,
    });

    expect(validation.ok).toBe(false);
    expect(validation.errors.join(" ")).toContain("hostId");
  });

  it("validates roof.gable host compatibility", () => {
    const registry = createDefaultFeatureRegistry();

    const validation = registry.validate(
      "roof.gable",
      {
        id: "roof-main",
        hostId: "wall-main",
        width: 30,
        depth: 20,
        pitchDeg: 35,
        overhang: 2,
      },
      {
        features: [{ id: "wall-main", kind: "primitive.box" }],
      },
    );

    expect(validation.ok).toBe(false);
    expect(validation.errors.join(" ")).toContain("must be one of");
  });
});
