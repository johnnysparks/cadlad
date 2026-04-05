import type {
  Body,
  EvaluationBundle,
  GeometryStats,
  ModelResult,
  ParamDef,
  ValidationDiagnostic,
} from "../cad-kernel/types.js";
import { computeModelStats } from "./model-stats.js";

export interface RunReport {
  bodies: number;
  params: number;
  parts: Array<{
    name: string;
    triangles: number;
  }>;
  geometryStats?: GeometryStats;
}

export interface JsonBodyMesh {
  positions: number[];
  normals: number[];
  indices: number[];
}

export interface JsonBody {
  name?: string;
  color?: [number, number, number, number];
  mesh?: JsonBodyMesh;
}

export interface RunModelResult {
  params: ParamDef[];
  geometryStats?: GeometryStats;
  diagnostics: ValidationDiagnostic[];
  evaluation: EvaluationBundle;
  sceneValidation?: ModelResult["sceneValidation"];
  hints: ModelResult["hints"];
  camera?: ModelResult["camera"];
  bodies?: JsonBody[];
}

export interface RunJsonOutput {
  schemaVersion: "cadlad.run.v1";
  ok: boolean;
  file: string;
  mode: "run" | "validate";
  errors: string[];
  modelResult?: RunModelResult;
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
  modelResult?: ModelResult;
  includeMesh?: boolean;
}): RunJsonOutput {
  return {
    schemaVersion: "cadlad.run.v1",
    ok: input.ok,
    file: input.file,
    mode: input.mode,
    errors: input.errors ?? [],
    modelResult: input.modelResult
      ? serializeModelResult(input.modelResult, { includeMesh: input.includeMesh ?? false })
      : undefined,
  };
}

export function serializeModelResult(modelResult: ModelResult, options: { includeMesh: boolean }): RunModelResult {
  return {
    params: modelResult.params,
    geometryStats: modelResult.geometryStats,
    diagnostics: modelResult.diagnostics ?? [],
    evaluation: modelResult.evaluation,
    sceneValidation: modelResult.sceneValidation,
    hints: modelResult.hints,
    camera: modelResult.camera,
    bodies: options.includeMesh ? modelResult.bodies.map((body) => serializeBody(body)) : undefined,
  };
}

function serializeBody(body: Body): JsonBody {
  return {
    name: body.name,
    color: body.color,
    mesh: {
      positions: Array.from(body.mesh.positions),
      normals: Array.from(body.mesh.normals),
      indices: Array.from(body.mesh.indices),
    },
  };
}
