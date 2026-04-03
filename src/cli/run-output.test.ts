import { describe, expect, it } from "vitest";
import type { Body, ParamDef } from "../engine/types.js";
import { buildRunReport, formatRunReportText } from "./run-output.js";

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
    expect(report.stats?.parts.map((part) => part.id)).toEqual(["plate", "brace"]);
    expect(report.stats?.pairwise[0].intersects).toBe(false);
  });

  it("formats human-readable output compatible with existing CLI output", () => {
    const text = formatRunReportText({
      bodies: 1,
      params: 1,
      parts: [{ name: "(unnamed)", triangles: 12 }],
    });

    expect(text).toBe("Bodies: 1\nParams: 1\n  (unnamed): 12 triangles");
  });
});
