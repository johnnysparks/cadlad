import { describe, expect, it } from "vitest";
import { runLayeredValidation, diagnosticsToErrors, formatValidationDiagnostic } from "./layered-validation.js";
import type { Body } from "../engine/types.js";

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

describe("runLayeredValidation", () => {
  it("halts at types/schema when parameter metadata is malformed", () => {
    const result = runLayeredValidation({
      runtimeErrors: [],
      params: [{ name: "bad", value: 10, min: 20, max: 5 }],
      bodies: [makeBody()],
    });

    expect(result.haltedAt).toBe("types/schema");
    expect(result.diagnostics[0].stage).toBe("types/schema");
    expect(diagnosticsToErrors(result.diagnostics)).toContain("Parameter bad has min > max.");
  });

  it("tags semantic diagnostics with feature ids inferred from array indices", () => {
    const result = runLayeredValidation({
      runtimeErrors: ["Model[2] must be a Solid or Assembly, got string."],
      params: [],
      bodies: [makeBody()],
    });

    expect(result.haltedAt).toBe("semantic");
    expect(result.diagnostics[0]).toMatchObject({
      stage: "semantic",
      featureId: "model[2]",
    });
  });

  it("reports geometry-stage malformed mesh data", () => {
    const result = runLayeredValidation({
      runtimeErrors: [],
      params: [],
      bodies: [makeBody("plate", [0, 1, 2, 2])],
    });

    expect(result.haltedAt).toBe("geometry");
    expect(result.diagnostics[0].message).toContain("malformed triangle indices");
  });

  it("formats diagnostics with stage + feature context", () => {
    const text = formatValidationDiagnostic({
      stage: "geometry",
      severity: "warning",
      message: "Body 1 has empty mesh data.",
      featureId: "body:plate",
    });

    expect(text).toBe("[geometry] Body 1 has empty mesh data. (body:plate)");
  });
});
