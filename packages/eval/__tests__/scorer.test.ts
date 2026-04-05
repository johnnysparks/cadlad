import { describe, expect, it } from "vitest";
import { scoreEval } from "../scorer.js";
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

describe("scoreEval", () => {
  it("computes perfect scores when all checks pass", () => {
    const task: TaskSpec = {
      id: "box-with-hole",
      difficulty: 1,
      description: "box with through-hole",
      acceptance: {
        body_count: 1,
        volume_min: 20000,
        volume_max: 24000,
        validation_errors: 0,
        has_params: ["width", "height"],
      },
      api_surface: ["box", "cylinder", "subtract", "translate"],
      max_iterations: 3,
    };

    const result = scoreEval(
      task,
      makeBundle(),
      "const width = param('width', 10, 1, 100); const height = param('height', 10, 1, 100); return box(40,30,20).subtract(cylinder(22,5)).translate(0,0,10);",
    );

    expect(result.geometry).toBe(100);
    expect(result.constraints).toBe(100);
    expect(result.api).toBe(100);
    expect(result.total).toBe(100);
    expect(result.pass).toBe(true);
  });

  it("redistributes judge weight and applies warning penalty", () => {
    const task: TaskSpec = {
      id: "warning-heavy",
      difficulty: 1,
      description: "warning handling",
      acceptance: { validation_errors: 0 },
      api_surface: ["box", "subtract"],
    };

    const result = scoreEval(
      task,
      makeBundle({ summary: { errorCount: 0, warningCount: 2 } }),
      "return box(10,10,10);",
    );

    expect(result.constraints).toBe(90);
    expect(result.api).toBe(50);
    expect(result.weights.geometry).toBeCloseTo(0.4444, 3);
    expect(result.weights.constraints).toBeCloseTo(0.3333, 3);
    expect(result.weights.api).toBeCloseTo(0.2222, 3);
    expect(result.judge).toBe(0);
  });
});
