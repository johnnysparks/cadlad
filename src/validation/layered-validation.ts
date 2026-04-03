import type {
  Body,
  GeometryValidationConfig,
  GeometryStats,
  ModelResult,
  ParamDef,
  ValidationDiagnostic,
  ValidationStage,
} from "../engine/types.js";
import { computeModelStats } from "../studio/model-stats.js";

export const VALIDATION_STAGES = [
  "types/schema",
  "semantic",
  "geometry",
  "stats/relations",
  "render/snapshots/tests",
] as const satisfies readonly ValidationStage[];

export interface LayeredValidationResult {
  diagnostics: ValidationDiagnostic[];
  stats?: GeometryStats;
  haltedAt?: ValidationStage;
}

export function runLayeredValidation(input: {
  runtimeErrors: string[];
  params: ParamDef[];
  bodies: Body[];
  geometryValidation?: GeometryValidationConfig;
}): LayeredValidationResult {
  const diagnostics: ValidationDiagnostic[] = [];
  const stats = computeModelStats(input.bodies);

  const typesDiagnostics = validateParams(input.params);
  diagnostics.push(...typesDiagnostics);
  if (typesDiagnostics.some((diag) => diag.severity === "error")) {
    return { diagnostics, stats, haltedAt: "types/schema" };
  }

  const semanticDiagnostics = input.runtimeErrors.map((message) => ({
    stage: "semantic" as const,
    severity: "error" as const,
    message,
    featureId: inferFeatureIdFromRuntimeError(message),
  }));
  diagnostics.push(...semanticDiagnostics);
  if (semanticDiagnostics.length > 0) {
    return { diagnostics, stats, haltedAt: "semantic" };
  }

  const geometryDiagnostics = validateGeometry(input.bodies, stats, input.geometryValidation);
  diagnostics.push(...geometryDiagnostics);
  if (geometryDiagnostics.some((diag) => diag.severity === "error")) {
    return { diagnostics, stats, haltedAt: "geometry" };
  }

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

function validateGeometry(
  bodies: Body[],
  stats: GeometryStats | undefined,
  config: GeometryValidationConfig | undefined,
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const epsilon = config?.epsilon ?? 1e-6;

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

  if (!stats) return diagnostics;

  for (const part of stats.parts) {
    if (part.volume < epsilon) {
      diagnostics.push({
        stage: "geometry",
        severity: "error",
        message: `Body "${part.name}" has near-zero volume (${part.volume.toExponential(3)}).`,
        featureId: `body:${part.id}`,
      });
    }

    if (part.extents.x < epsilon || part.extents.y < epsilon || part.extents.z < epsilon) {
      diagnostics.push({
        stage: "geometry",
        severity: "error",
        message: `Body "${part.name}" has a degenerate bounding box (${part.extents.x.toFixed(6)} × ${part.extents.y.toFixed(6)} × ${part.extents.z.toFixed(6)}).`,
        featureId: `body:${part.id}`,
      });
    }
  }

  if (!config?.allowDisconnectedComponents && stats.componentCount > 1) {
    diagnostics.push({
      stage: "geometry",
      severity: "warning",
      message: `Model has ${stats.componentCount} disconnected components.`,
      featureId: "model:components",
    });
  }

  if (config?.expectedVolume) {
    const { min, max } = config.expectedVolume;
    if (typeof min === "number" && stats.volume < min) {
      diagnostics.push({
        stage: "geometry",
        severity: "error",
        message: `Model volume ${stats.volume.toFixed(6)} is below expected minimum ${min}.`,
        featureId: "model:volume",
      });
    }
    if (typeof max === "number" && stats.volume > max) {
      diagnostics.push({
        stage: "geometry",
        severity: "error",
        message: `Model volume ${stats.volume.toFixed(6)} exceeds expected maximum ${max}.`,
        featureId: "model:volume",
      });
    }
  }

  if (config?.expectedBoundingBox) {
    const { min, max } = config.expectedBoundingBox;
    const axisByIndex = ["x", "y", "z"] as const;
    for (let axisIndex = 0; axisIndex < 3; axisIndex += 1) {
      const axis = axisByIndex[axisIndex];
      const actualMin = stats.boundingBox.min[axisIndex];
      const actualMax = stats.boundingBox.max[axisIndex];
      if (typeof min?.[axis] === "number" && actualMin < min[axis]) {
        diagnostics.push({
          stage: "geometry",
          severity: "error",
          message: `Model bbox min.${axis} ${actualMin.toFixed(6)} is below expected ${min[axis]}.`,
          featureId: "model:bbox",
        });
      }
      if (typeof max?.[axis] === "number" && actualMax > max[axis]) {
        diagnostics.push({
          stage: "geometry",
          severity: "error",
          message: `Model bbox max.${axis} ${actualMax.toFixed(6)} exceeds expected ${max[axis]}.`,
          featureId: "model:bbox",
        });
      }
    }
  }

  return diagnostics;
}

function validateRelations(stats?: GeometryStats): ValidationDiagnostic[] {
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

export function withLayeredValidation(
  result: Omit<ModelResult, "errors"> & { runtimeErrors: string[]; geometryValidation?: GeometryValidationConfig },
): ModelResult {
  const validated = runLayeredValidation({
    runtimeErrors: result.runtimeErrors,
    params: result.params,
    bodies: result.bodies,
    geometryValidation: result.geometryValidation,
  });

  return {
    bodies: result.bodies,
    params: result.params,
    hints: result.hints,
    camera: result.camera,
    sceneValidation: result.sceneValidation,
    geometryStats: validated.stats,
    diagnostics: validated.diagnostics,
    errors: diagnosticsToErrors(validated.diagnostics),
  };
}
