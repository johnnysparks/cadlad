import { describe, expect, it } from "vitest";
import { scoreEvaluation } from "../scorer.js";
import type { TaskSpec } from "../types.js";
import type { EvaluationBundle } from "../../engine/types.js";

function makeBundle(overrides?: Partial<EvaluationBundle>): EvaluationBundle {
  return {
    summary: { errorCount: 0, warningCount: 0 },
    typecheck: { status: "pass", errorCount: 0, warningCount: 0, diagnostics: [] },
    semanticValidation: { status: "pass", errorCount: 0, warningCount: 0, diagnostics: [] },
    geometryValidation: { status: "pass", errorCount: 0, warningCount: 0, diagnostics: [] },
    relationValidation: { status: "pass", errorCount: 0, warningCount: 0, diagnostics: [] },
    stats: {
      available: true,
      data: {
        triangles: 12,
        bodies: 1,
        componentCount: 1,
        boundingBox: { min: [0, 0, 0], max: [40, 30, 20] },
        volume: 22000,
        surfaceArea: 5000,
        parts: [],
        pairwise: [],
        checks: { hasZeroVolume: false, hasDegenerateBoundingBox: false, hasDisconnectedComponents: false },
      },
    },
    tests: { status: "pass", total: 0, failures: 0, results: [] },
    render: { requested: false },
    ...overrides,
  };
}

describe("scoreEvaluation", () => {
  it("passes when geometry, constraints, and required API usage are present", () => {
    const task: TaskSpec = {
      id: "box-with-hole",
      difficulty: 1,
      description: "box with through-hole",
      acceptance: {
        body_count: 1,
        volume_min: 20000,
        volume_max: 24000,
        validation_errors: 0,
      },
      api_surface: ["box", "cylinder", "subtract", "translate"],
      max_iterations: 3,
    };

    const result = scoreEvaluation({
      task,
      bundle: makeBundle(),
      source: "const body = box(40,30,20).subtract(cylinder(22,5)).translate(0,0,10);",
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
    expect(result.feedback).toHaveLength(0);
  });

  it("fails when required primitives are missing from generated source", () => {
    const task: TaskSpec = {
      id: "api-check",
      difficulty: 1,
      description: "api usage",
      acceptance: { validation_errors: 0 },
      api_surface: ["box", "subtract"],
    };

    const result = scoreEvaluation({
      task,
      bundle: makeBundle(),
      source: "return box(10, 10, 10);",
    });

    expect(result.api).toBe(50);
    expect(result.feedback.some((line) => line.includes("subtract"))).toBe(true);
    expect(result.pass).toBe(true);
    expect(result.score).toBeCloseTo(88.89, 2);
  });
});
