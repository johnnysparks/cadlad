import type { Body, ParamDef } from "../engine/types.js";
import { computeModelStats, type ModelStats } from "../studio/model-stats.js";

export interface RunReport {
  bodies: number;
  params: number;
  parts: Array<{
    name: string;
    triangles: number;
  }>;
  stats?: ModelStats;
}

export function buildRunReport(input: { bodies: Body[]; params: ParamDef[] }): RunReport {
  return {
    bodies: input.bodies.length,
    params: input.params.length,
    parts: input.bodies.map((body) => ({
      name: body.name ?? "(unnamed)",
      triangles: body.mesh.indices.length / 3,
    })),
    stats: computeModelStats(input.bodies),
  };
}

export function formatRunReportText(report: RunReport): string {
  const lines = [`Bodies: ${report.bodies}`, `Params: ${report.params}`];
  for (const part of report.parts) {
    lines.push(`  ${part.name}: ${part.triangles} triangles`);
  }
  return lines.join("\n");
}
