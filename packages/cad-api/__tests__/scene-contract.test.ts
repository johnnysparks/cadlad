import { describe, expect, it } from "vitest";
import { defineScene, normalizeScene, runScenePostModelValidation } from "../scene-contract.js";
import type { Body } from "@cadlad/kernel/types.js";

function makeBody(name?: string, indices: number[] = [0, 1, 2]): Body {
  return {
    name,
    mesh: {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array(9),
      indices: new Uint32Array(indices),
    },
  };
}

describe("scene contract validation", () => {
  it("normalizes a valid scene envelope", () => {
    const scene = defineScene({
      model: "placeholder",
    });

    const normalized = normalizeScene("return scene", scene);
    expect(normalized.scene).toBeDefined();
    expect(normalized.diagnostics).toHaveLength(0);
  });

  it("runs geometry validators and tests with structured results", () => {
    const scene = defineScene({
      model: "placeholder",
      validators: [
        {
          id: "body-count.one",
          stage: "geometry",
          run: ({ bodies }) => (bodies.length !== 1 ? "Expected exactly one body." : undefined),
        },
        {
          id: "model.available",
          stage: "geometry",
          run: ({ model }) => (model ? undefined : "Expected built model in geometry validator context."),
        },
      ],
      tests: [
        {
          id: "mesh.non-empty",
          run: ({ bodies }) => (bodies[0]?.mesh.indices.length ? undefined : "Mesh should have triangles."),
        },
      ],
    });

    const normalized = normalizeScene("return scene", scene);
    expect(normalized.scene).toBeDefined();

    const report = runScenePostModelValidation({
      scene: normalized.scene!,
      validators: scene.validators,
      tests: scene.tests,
      bodies: [makeBody("base")],
      model: { id: "built-model" },
    });

    expect(report.summary.errorCount).toBe(0);
    expect(report.validators[0]).toMatchObject({ id: "body-count.one", status: "pass" });
    expect(report.validators[1]).toMatchObject({ id: "model.available", status: "pass" });
    expect(report.tests[0]).toMatchObject({ id: "mesh.non-empty", status: "pass" });
  });

  it("reports disconnected multi-body output", () => {
    const scene = defineScene({
      model: "placeholder",
    });
    const normalized = normalizeScene("return scene", scene);

    const report = runScenePostModelValidation({
      scene: normalized.scene!,
      bodies: [makeBody("a"), makeBody("b")],
    });

    expect(report.diagnostics.some((diag) => diag.code === "scene.geometry.disconnected-parts")).toBe(true);
  });
});
