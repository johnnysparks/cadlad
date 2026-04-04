import type { Body, EvaluationBundle, GeometryStats, ParamDef, ValidationDiagnostic } from "../engine/types.js";
import { computeModelStats } from "../studio/model-stats.js";

export interface RunReport {
  bodies: number;
  params: number;
  parts: Array<{
    name: string;
    triangles: number;
  }>;
  geometryStats?: GeometryStats;
}

export interface RunJsonOutput {
  schemaVersion: "cadlad.run.v1";
  ok: boolean;
  file: string;
  mode: "run" | "validate";
  errors: string[];
  diagnostics: ValidationDiagnostic[];
  report?: RunReport;
  evaluation?: EvaluationBundle;
}

export function buildRunReport(input: { bodies: Body[]; params: ParamDef[] }): RunReport {
  return {
    bodies: input.bodies.length,
    params: input.params.length,
    parts: input.bodies.map((body) => ({
      name: body.name ?? "(unnamed)",
      triangles: body.mesh.indices.length / 3,
    })),
    geometryStats: computeModelStats(input.bodies),
  };
}

export function formatRunReportText(report: RunReport): string {
  const lines = [`Bodies: ${report.bodies}`, `Params: ${report.params}`];
  for (const part of report.parts) {
    lines.push(`  ${part.name}: ${part.triangles} triangles`);
  }
  return lines.join("\n");
}

export function buildRunJsonOutput(input: {
  file: string;
  mode: "run" | "validate";
  ok: boolean;
  errors?: string[];
  diagnostics?: ValidationDiagnostic[];
  report?: RunReport;
  evaluation?: EvaluationBundle;
}): RunJsonOutput {
  return {
    schemaVersion: "cadlad.run.v1",
    ok: input.ok,
    file: input.file,
    mode: input.mode,
    errors: input.errors ?? [],
    diagnostics: input.diagnostics ?? [],
    report: input.report,
    evaluation: input.evaluation,
  };
}
