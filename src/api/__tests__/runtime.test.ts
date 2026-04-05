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
    expect(result.evaluation.summary.errorCount).toBe(0);
    expect(result.evaluation.stats.available).toBe(true);
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

  it("exposes toolBody and omits it from rendered output", async () => {
    const code = `
      const base = box(20, 20, 20);
      const cut = toolBody("center-cut", box(6, 6, 30));
      const final = base.subtractAll(cut);
      return [final, cut];
    `;
    const result = await evaluateModel(code);
    expect(result.errors).toHaveLength(0);
    expect(result.bodies).toHaveLength(1);
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
    expect(result.evaluation.semanticValidation.status).toBe("fail");
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
      });
    `;
    const result = await evaluateModel(code);
    expect(result.errors).toHaveLength(0);
    expect(result.bodies).toHaveLength(1);
  });




  it("evaluates defineScene model factories with typed params", async () => {
    const code = `
      return defineScene({
        meta: { name: "scene-factory" },
        params: {
          width: { value: 12, unit: "mm" },
          depth: { value: 8, unit: "mm" },
        },
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

  it("enforces declarative wall_thickness constraints", async () => {
    const code = `
      return defineScene({
        meta: { name: "constraint-wall-thickness" },
        constraints: [
          constraint("wall_thickness", { min: mm(2) }),
        ],
        model: box(20, 20, 1),
      });
    `;

    const result = await evaluateModel(code);
    expect(result.errors.some((message) => message.includes("Constraint wall_thickness failed"))).toBe(true);
    expect(result.evaluation.geometryValidation.status).toBe("fail");
  });

  it("checks declarative clearance and symmetry constraints", async () => {
    const code = `
      return defineScene({
        meta: { name: "constraint-clearance-symmetry" },
        constraints: [
          constraint("clearance", { between: ["base", "lid"], min: mm(5) }),
          constraint("symmetry", { axis: "X", tolerance: mm(0.1) }),
        ],
        model: [
          box(10, 10, 10).translate(-6, 0, 0).named("base"),
          box(10, 10, 10).translate(6.5, 0, 0).named("lid"),
        ],
      });
    `;

    const result = await evaluateModel(code);
    expect(result.errors.some((message) => message.includes("Constraint clearance failed"))).toBe(true);
    expect(result.diagnostics?.some((diag) => diag.message.includes("Constraint symmetry failed"))).toBe(true);
  });

  it("supports paramSweepTest for fragility checks across parameter values", async () => {
    const code = `
      return defineScene({
        meta: { name: "param-sweep-robustness" },
        params: {
          width: { value: 10, min: 0, max: 20 },
        },
        tests: [
          paramSweepTest("width", [0, 10, 20]),
        ],
        model: ({ params }) => box(params.width, 10, 10),
      });
    `;

    const result = await evaluateModel(code);
    const sweep = result.sceneValidation?.tests.find((entry) => entry.id === "param-sweep.width");
    expect(sweep?.status).toBe("fail");
    expect(sweep?.message).toContain("width=0");
    expect(sweep?.message).toContain("near-zero volume");
  });
});
