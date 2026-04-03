import { describe, expect, it } from "vitest";
import { insertFeature, updateFeature } from "../ast-feature-ops.js";
import { createDefaultFeatureRegistry } from "../feature-registry.js";

const baseSource = `
const scene = defineScene({
  features: [
    feature("wall.straight", {
      id: "wall-main",
      length: 30,
      height: 12,
      thickness: 0.5,
    }),
    feature("roof.gable", {
      id: "roof-main",
      hostId: "wall-main",
      width: 30,
      depth: 20,
      pitchDeg: 35,
      overhang: 2,
    }),
  ],
});
`;

describe("feature registry + AST feature operations", () => {
  it("inserts a registry-backed feature into defineScene features", () => {
    const registry = createDefaultFeatureRegistry();

    const next = insertFeature(
      baseSource,
      {
        id: "wall-west",
        kind: "wall.straight",
        params: {
          id: "wall-west",
          length: 20,
          height: 10,
          thickness: 0.5,
        },
      },
      registry,
    );

    expect(next).toContain("feature(\"wall.straight\"");
    expect(next).toContain("length: 20");
    expect(next).toContain("thickness: 0.5");
  });

  it("updates a feature by id with deterministic schema-checked output", () => {
    const registry = createDefaultFeatureRegistry();

    const next = updateFeature(
      baseSource,
      "roof-main",
      {
        id: "roof-main",
        hostId: "wall-main",
        width: 30,
        depth: 20,
        pitchDeg: 42,
        overhang: 2,
      },
      registry,
    );

    expect(next).toContain("pitchDeg: 42");
    expect(next).not.toContain("pitchDeg: 35");
    expect(next).toMatchInlineSnapshot(`
      "
      const scene = defineScene({
        features: [
          feature("wall.straight", {
              id: "wall-main",
              length: 30,
              height: 12,
              thickness: 0.5,
          }),
          feature("roof.gable", {
              depth: 20,
              hostId: "wall-main",
              id: "roof-main",
              overhang: 2,
              pitchDeg: 42,
              width: 30
          })
      ],
      });
      "
    `);
  });

  it("fails fast when params do not satisfy schema", () => {
    const registry = createDefaultFeatureRegistry();

    expect(() =>
      updateFeature(
        baseSource,
        "roof-main",
        {
          id: "roof-main",
          hostId: "wall-main",
          width: 30,
          depth: 20,
          pitchDeg: -10,
          overhang: 2,
        },
        registry,
      ),
    ).toThrow("Schema validation failed");
  });
});
