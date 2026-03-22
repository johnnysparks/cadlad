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

  it("captures syntax errors", async () => {
    const result = await evaluateModel("return box(");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.bodies).toHaveLength(0);
  });

  it("captures runtime errors", async () => {
    const result = await evaluateModel("throw new Error('boom')");
    expect(result.errors).toContain("boom");
  });
});
