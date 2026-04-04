import { describe, expect, it } from "vitest";
import type { Body, ModelResult, ParamDef } from "../engine/types.js";
import { buildRunJsonOutput, buildRunReport, formatRunReportText } from "./run-output.js";

function makeBody(name: string | undefined, xOffset: number): Body {
  return {
    name,
    mesh: {
      positions: new Float32Array([
        xOffset, 0, 0,
        xOffset + 1, 0, 0,
        xOffset, 1, 0,
      ]),
      normals: new Float32Array(9),
      indices: new Uint32Array([0, 1, 2]),
    },
  };
}

function makeModelResult(): ModelResult {
  return {
    bodies: [makeBody("plate", 0)],
    params: [{ name: "width", value: 10 }],
    errors: [],
    diagnostics: [],
    evaluation: {
      summary: { errorCount: 0, warningCount: 0 },
      typecheck: { status: "pass", errorCount: 0, warningCount: 0, diagnostics: [] },
      semanticValidation: { status: "pass", errorCount: 0, warningCount: 0, diagnostics: [] },
      geometryValidation: { status: "pass", errorCount: 0, warningCount: 0, diagnostics: [] },
      relationValidation: { status: "pass", errorCount: 0, warningCount: 0, diagnostics: [] },
      stats: { available: false },
      tests: { status: "skipped", total: 0, failures: 0, results: [] },
      render: { requested: false },
    },
    hints: [],
  };
}

describe("run-output", () => {
  it("builds a machine-readable report including model stats", () => {
    const params: ParamDef[] = [{ name: "width", value: 10 }];
    const report = buildRunReport({
      params,
      bodies: [makeBody("plate", 0), makeBody("brace", 3)],
    });

    expect(report.bodies).toBe(2);
    expect(report.params).toBe(1);
    expect(report.parts).toEqual([
      { name: "plate", triangles: 1 },
      { name: "brace", triangles: 1 },
    ]);
    expect(report.geometryStats?.parts.map((part) => part.id)).toEqual(["plate", "brace"]);
    expect(report.geometryStats?.pairwise[0].intersects).toBe(false);
  });

  it("formats human-readable output compatible with existing CLI output", () => {
    const text = formatRunReportText({
      bodies: 1,
      params: 1,
      parts: [{ name: "(unnamed)", triangles: 12 }],
    });

    expect(text).toBe("Bodies: 1\nParams: 1\n  (unnamed): 12 triangles");
  });

  it("builds stable JSON output with model result and no mesh by default", () => {
    const json = buildRunJsonOutput({
      ok: true,
      file: "projects/demo/demo.forge.ts",
      mode: "run",
      modelResult: makeModelResult(),
    });

    expect(json).toMatchObject({
      schemaVersion: "cadlad.run.v1",
      ok: true,
      file: "projects/demo/demo.forge.ts",
      mode: "run",
      errors: [],
      modelResult: {
        params: [{ name: "width", value: 10 }],
        diagnostics: [],
      },
    });
    expect(json.modelResult?.bodies).toBeUndefined();
  });

  it("includes mesh data when explicitly requested", () => {
    const json = buildRunJsonOutput({
      ok: true,
      file: "projects/demo/demo.forge.ts",
      mode: "run",
      modelResult: makeModelResult(),
      includeMesh: true,
    });

    expect(json.modelResult?.bodies?.[0].mesh?.positions).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(json.modelResult?.bodies?.[0].mesh?.indices).toEqual([0, 1, 2]);
  });
});
