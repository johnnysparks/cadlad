import type {
  Body,
  ModelResult,
  ParamDef,
  ValidationDiagnostic,
  ValidationStage,
} from "../engine/types.js";
import { computeModelStats, type ModelStats } from "../studio/model-stats.js";

export const VALIDATION_STAGES = [
  "types/schema",
  "semantic",
  "geometry",
  "stats/relations",
  "render/snapshots/tests",
] as const satisfies readonly ValidationStage[];

export interface LayeredValidationResult {
  diagnostics: ValidationDiagnostic[];
  stats?: ModelStats;
  haltedAt?: ValidationStage;
}

export function runLayeredValidation(input: {
  runtimeErrors: string[];
  params: ParamDef[];
  bodies: Body[];
}): LayeredValidationResult {
  const diagnostics: ValidationDiagnostic[] = [];

  const typesDiagnostics = validateParams(input.params);
  diagnostics.push(...typesDiagnostics);
  if (typesDiagnostics.some((diag) => diag.severity === "error")) {
    return { diagnostics, haltedAt: "types/schema" };
  }

  const semanticDiagnostics = input.runtimeErrors.map((message) => ({
    stage: "semantic" as const,
    severity: "error" as const,
    message,
    featureId: inferFeatureIdFromRuntimeError(message),
  }));
  diagnostics.push(...semanticDiagnostics);
  if (semanticDiagnostics.length > 0) {
    return { diagnostics, haltedAt: "semantic" };
  }

  const geometryDiagnostics = validateGeometry(input.bodies);
  diagnostics.push(...geometryDiagnostics);
  if (geometryDiagnostics.some((diag) => diag.severity === "error")) {
    return { diagnostics, haltedAt: "geometry" };
  }

  const stats = computeModelStats(input.bodies);
  const relationDiagnostics = validateRelations(stats);
  diagnostics.push(...relationDiagnostics);
  if (relationDiagnostics.some((diag) => diag.severity === "error")) {
    return { diagnostics, stats, haltedAt: "stats/relations" };
  }

  return { diagnostics, stats };
}

function validateParams(params: ParamDef[]): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];

  for (const param of params) {
    const featureId = `param:${param.name || "unnamed"}`;
    if (!param.name || param.name.trim().length === 0) {
      diagnostics.push({
        stage: "types/schema",
        severity: "error",
        message: "Parameter name must be non-empty.",
        featureId,
      });
    }

    if (!Number.isFinite(param.value)) {
      diagnostics.push({
        stage: "types/schema",
        severity: "error",
        message: `Parameter ${param.name || "(unnamed)"} must be a finite number.`,
        featureId,
      });
    }

    if (typeof param.min === "number" && typeof param.max === "number" && param.min > param.max) {
      diagnostics.push({
        stage: "types/schema",
        severity: "error",
        message: `Parameter ${param.name || "(unnamed)"} has min > max.`,
        featureId,
      });
      continue;
    }

    if (typeof param.min === "number" && param.value < param.min) {
      diagnostics.push({
        stage: "types/schema",
        severity: "warning",
        message: `Parameter ${param.name || "(unnamed)"} is below min (${param.min}).`,
        featureId,
      });
    }

    if (typeof param.max === "number" && param.value > param.max) {
      diagnostics.push({
        stage: "types/schema",
        severity: "warning",
        message: `Parameter ${param.name || "(unnamed)"} is above max (${param.max}).`,
        featureId,
      });
    }
  }

  return diagnostics;
}

function validateGeometry(bodies: Body[]): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  for (let i = 0; i < bodies.length; i += 1) {
    const body = bodies[i];
    const featureId = body.name?.trim() ? `body:${body.name.trim()}` : `body:${i + 1}`;

    if (body.mesh.positions.length === 0 || body.mesh.indices.length === 0) {
      diagnostics.push({
        stage: "geometry",
        severity: "warning",
        message: `Body ${i + 1} has empty mesh data.`,
        featureId,
      });
      continue;
    }

    if (body.mesh.indices.length % 3 !== 0) {
      diagnostics.push({
        stage: "geometry",
        severity: "error",
        message: `Body ${i + 1} has malformed triangle indices (not divisible by 3).`,
        featureId,
      });
    }
  }

  return diagnostics;
}

function validateRelations(stats?: ModelStats): ValidationDiagnostic[] {
  if (!stats) return [];
  return stats.pairwise
    .filter((pair) => pair.intersects)
    .map((pair) => ({
      stage: "stats/relations" as const,
      severity: "warning" as const,
      message: `Part overlap detected: ${pair.partA} intersects ${pair.partB}.`,
      featureId: `${pair.partAId}<->${pair.partBId}`,
    }));
}

function inferFeatureIdFromRuntimeError(message: string): string | undefined {
  const match = message.match(/^Model\[(\d+)\]/);
  if (!match) return undefined;
  return `model[${match[1]}]`;
}

export function diagnosticsToErrors(diagnostics: ValidationDiagnostic[]): string[] {
  return diagnostics.filter((diag) => diag.severity === "error").map((diag) => diag.message);
}

export function formatValidationDiagnostic(diag: ValidationDiagnostic): string {
  const scope = diag.featureId ? ` (${diag.featureId})` : "";
  return `[${diag.stage}] ${diag.message}${scope}`;
}

export function withLayeredValidation(result: Omit<ModelResult, "errors"> & { runtimeErrors: string[] }): ModelResult {
  const validated = runLayeredValidation({
    runtimeErrors: result.runtimeErrors,
    params: result.params,
    bodies: result.bodies,
  });

  return {
    bodies: result.bodies,
    params: result.params,
    hints: result.hints,
    camera: result.camera,
    sceneValidation: result.sceneValidation,
    diagnostics: validated.diagnostics,
    errors: diagnosticsToErrors(validated.diagnostics),
  };
}
