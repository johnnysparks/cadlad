import { describe, it, expect, beforeAll } from "vitest";
import { initManifold } from "../../engine/manifold-backend.js";
import { evaluateModel } from "../runtime.js";

beforeAll(async () => {
  await initManifold();
});

describe("evaluateModel", () => {
  it("evaluates a simple box", async () => {
    const result = await evaluateModel("return box(10, 10, 10)");
    expect(result.bodies).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.bodies[0].mesh.positions.length).toBeGreaterThan(0);
    expect(result.geometryStats?.volume).toBeGreaterThan(0);
    expect(result.geometryStats?.checks.hasZeroVolume).toBe(false);
    expect(result.geometryStats?.componentCount).toBe(1);
  });

  it("collects param definitions", async () => {
    const result = await evaluateModel(
      `const w = param("Width", 10, { min: 5, max: 50 }); return box(w, w, w)`,
    );
    expect(result.params).toHaveLength(1);
    expect(result.params[0].name).toBe("Width");
    expect(result.params[0].value).toBe(10);
  });

  it("respects param overrides", async () => {
    const code = `const w = param("W", 10); return box(w, w, w)`;
    const result = await evaluateModel(code, new Map([["W", 20]]));
    expect(result.params[0].value).toBe(20);
  });

  it("handles assembly return", async () => {
    const code = `
      const a = assembly("test")
        .add("a", box(10, 10, 10))
        .add("b", box(5, 5, 5), [20, 0, 0]);
      return a;
    `;
    const result = await evaluateModel(code);
    expect(result.bodies).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it("handles array return", async () => {
    const result = await evaluateModel("return [box(10,10,10), box(5,5,5)]");
    expect(result.bodies).toHaveLength(2);
  });

  it("handles metadata object with camera", async () => {
    const result = await evaluateModel(
      "return { model: box(10,10,10), camera: [100, 200, 300] }",
    );
    expect(result.bodies).toHaveLength(1);
    expect(result.camera).toEqual([100, 200, 300]);
  });

  it("errors when model returns undefined geometry", async () => {
    const result = await evaluateModel("const x = 1 + 1;");
    expect(result.bodies).toHaveLength(0);
    expect(result.errors).toContain(
      "Model script must return geometry: Solid, Assembly, array of Solid/Assembly, or { model, camera }.",
    );
  });

  it("errors on invalid array entry types with index diagnostics", async () => {
    const result = await evaluateModel("return [box(10,10,10), 42, 'bad']");
    expect(result.bodies).toHaveLength(1);
    expect(result.errors).toContain("Model[1] must be a Solid or Assembly, got number.");
    expect(result.errors).toContain("Model[2] must be a Solid or Assembly, got string.");
    expect(result.diagnostics?.[0]).toMatchObject({
      stage: "semantic",
      severity: "error",
    });
    expect(result.diagnostics?.[1]?.featureId).toBe("model[2]");
  });

  it("captures syntax errors", async () => {
    const result = await evaluateModel("return box(");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.bodies).toHaveLength(0);
  });

  it("captures runtime errors", async () => {
    const result = await evaluateModel("throw new Error('boom')");
    expect(result.errors).toContain("boom");
  });

  it("errors on disconnected parts in a single Solid", async () => {
    const code = `
      const a = box(10, 10, 10);
      const b = box(10, 10, 10).translate(50, 50, 50);
      return a.union(b);
    `;
    const result = await evaluateModel(code);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("disconnected parts");
  });

  it("allows disconnected parts in an assembly", async () => {
    const code = `
      const a = box(10, 10, 10);
      const b = box(10, 10, 10).translate(50, 50, 50);
      return assembly("parts").add("a", a).add("b", b);
    `;
    const result = await evaluateModel(code);
    expect(result.errors).toHaveLength(0);
    expect(result.bodies).toHaveLength(2);
    expect(result.geometryStats?.checks.hasDisconnectedComponents).toBe(true);
    expect(result.geometryStats?.componentCount).toBe(2);
  });

  it("allows a single connected Solid", async () => {
    const code = `
      const a = box(10, 10, 10);
      const b = box(10, 10, 10).translate(5, 0, 0);
      return a.union(b);
    `;
    const result = await evaluateModel(code);
    expect(result.errors).toHaveLength(0);
    expect(result.bodies).toHaveLength(1);
  });

  it("accepts defineScene envelopes and evaluates scene.model", async () => {
    const code = `
      return defineScene({
        model: box(10, 10, 10),
        features: [{ id: "base", kind: "primitive", label: "Base box" }],
      });
    `;
    const result = await evaluateModel(code);
    expect(result.errors).toHaveLength(0);
    expect(result.bodies).toHaveLength(1);
  });

  it("reports missing scene feature ids before geometry build", async () => {
    const code = `
      return defineScene({
        model: box(10, 10, 10),
        features: [{ kind: "primitive", label: "Base box" }],
      });
    `;
    const result = await evaluateModel(code);
    expect(result.bodies).toHaveLength(0);
    expect(result.errors).toContain(
      '[scene.feature-id.missing] Feature kind "primitive" is missing a stable string id.',
    );
  });

  it("reports duplicate scene feature ids with source range", async () => {
    const code = `
      return defineScene({
        model: box(10, 10, 10),
        features: [
          { id: "base", kind: "primitive", label: "Base box A" },
          { id: "base", kind: "primitive", label: "Base box B" },
        ],
      });
    `;
    const result = await evaluateModel(code);
    expect(result.bodies).toHaveLength(0);
    expect(result.errors[0]).toContain("[scene.feature-id.duplicate]");
    expect(result.errors[0]).toContain("[feature:base]");
    expect(result.errors[0]).toContain("[L");
  });

  it("reports invalid scene feature references", async () => {
    const code = `
      return defineScene({
        model: box(10, 10, 10),
        features: [
          { id: "base", kind: "primitive", label: "Base box" },
          { id: "hole", kind: "cut", refs: ["missing.feature"] },
        ],
      });
    `;
    const result = await evaluateModel(code);
    expect(result.bodies).toHaveLength(0);
    expect(result.errors[0]).toContain("[scene.feature-ref.invalid]");
  });

  it("evaluates defineScene model factories with typed params", async () => {
    const code = `
      return defineScene({
        meta: { name: "scene-factory" },
        params: {
          width: { value: 12, unit: "mm" },
          depth: { value: 8, unit: "mm" },
        },
        features: [{ id: "base", kind: "primitive", label: "Base box" }],
        model: ({ params }) => box(params.width, params.depth, 5),
      });
    `;
    const result = await evaluateModel(code, new Map([["width", 20]]));
    expect(result.errors).toHaveLength(0);
    expect(result.bodies).toHaveLength(1);
    expect(result.params.find((entry) => entry.name === "width")?.value).toBe(20);
    expect(result.params.find((entry) => entry.name === "depth")?.value).toBe(8);
  });

  it("reports scene validator and test failures", async () => {
    const code = `
      return defineScene({
        meta: { name: "scene-checks" },
        params: {
          wall: { value: 1, unit: "mm" },
        },
        features: [{ id: "wall", kind: "primitive", label: "Wall" }],
        validators: [
          {
            id: "wall.min-thickness",
            stage: "semantic",
            run: ({ params }) => params.wall < 2 ? "Wall thickness must be >= 2mm." : undefined,
          },
        ],
        tests: [
          {
            id: "wall.min-geometry",
            run: ({ bodies }) => bodies.length === 0 ? "Expected at least one body." : undefined,
          },
          {
            id: "wall.max",
            run: ({ params }) => params.wall > 20 ? "Wall is unexpectedly thick." : undefined,
          },
        ],
        model: ({ params }) => box(10, 10, params.wall),
      });
    `;

    const result = await evaluateModel(code);
    expect(result.bodies).toHaveLength(1);
    expect(result.errors.some((message) => message.includes("[scene.validator.failed]"))).toBe(true);
    expect(result.sceneValidation?.summary.validatorFailures).toBe(1);
    expect(result.sceneValidation?.tests.find((entry) => entry.id === "wall.min-geometry")?.status).toBe("pass");
  });

  it("applies scene geometry sanity config in layered validation", async () => {
    const code = `
      return defineScene({
        meta: { name: "geometry-envelope" },
        geometry: {
          expectedVolume: { max: 500 },
          expectedBoundingBox: { min: { x: 0 } },
        },
        features: [{ id: "base", kind: "primitive.box" }],
        model: box(10, 10, 10),
      });
    `;

    const result = await evaluateModel(code);
    expect(result.errors.some((message) => message.includes("exceeds expected maximum 500"))).toBe(true);
    expect(result.errors.some((message) => message.includes("bbox min.x"))).toBe(true);
  });

  it("passes built Solid into scene geometry validators", async () => {
    const code = `
      return defineScene({
        meta: { name: "geometry-validator-model-context" },
        features: [{ id: "base", kind: "primitive.box" }],
        validators: [
          {
            id: "solid-context",
            stage: "geometry",
            run: ({ model }) => !(model instanceof Solid)
              ? "Expected model to be a Solid."
              : undefined,
          },
        ],
        model: box(10, 10, 10),
      });
    `;

    const result = await evaluateModel(code);
    expect(result.errors).toHaveLength(0);
    expect(result.sceneValidation?.validators.find((entry) => entry.id === "solid-context")?.status).toBe("pass");
  });
});
