import type {
  Body,
  EvaluationBundle,
  GeometryValidationConfig,
  GeometryStats,
  ModelResult,
  ParamDef,
  SceneValidationReport,
  ValidationDiagnostic,
  ValidationStage,
} from "../engine/types.js";
import type { SceneConstraint } from "../api/constraints.js";
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
  constraints?: readonly SceneConstraint[];
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

  const geometryDiagnostics = validateGeometry(input.bodies, stats, input.geometryValidation, input.constraints);
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
    const nameStr = String(param.name || "");
    const featureId = `param:${nameStr || "unnamed"}`;
    if (!nameStr || nameStr.trim().length === 0) {
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
        message: `Parameter ${nameStr || "(unnamed)"} must be a finite number.`,
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
  constraints: readonly SceneConstraint[] | undefined,
): ValidationDiagnostic[] {
  const diagnostics: ValidationDiagnostic[] = [];
  const epsilon = config?.epsilon ?? 1e-6;

  for (let i = 0; i < bodies.length; i += 1) {
    const body = bodies[i];
    const nameStr = String(body.name || "");
    const featureId = nameStr.trim() ? `body:${nameStr.trim()}` : `body:${i + 1}`;

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

  diagnostics.push(...validateDeclarativeConstraints(bodies, stats, constraints));

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



function validateDeclarativeConstraints(
  bodies: Body[],
  stats: GeometryStats | undefined,
  constraints: readonly SceneConstraint[] | undefined,
): ValidationDiagnostic[] {
  if (!constraints || constraints.length === 0 || !stats) return [];

  const diagnostics: ValidationDiagnostic[] = [];
  const axisIndex: Record<"X" | "Y" | "Z", 0 | 1 | 2> = { X: 0, Y: 1, Z: 2 };

  for (const rule of constraints) {
    if (rule.kind === "wall_thickness") {
      for (const part of stats.parts) {
        const minExtent = Math.min(part.extents.x, part.extents.y, part.extents.z);
        if (minExtent + 1e-6 < rule.min) {
          diagnostics.push({
            stage: "geometry",
            severity: rule.severity ?? "error",
            message: `Constraint wall_thickness failed for "${part.name}": minimum part extent ${minExtent.toFixed(3)}mm is below ${rule.min}mm.`,
            featureId: `constraint:wall_thickness:${part.id}`,
          });
        }
      }
      continue;
    }

    if (rule.kind === "symmetry") {
      const index = axisIndex[rule.axis];
      const tolerance = rule.tolerance ?? 1e-3;
      const symmetryError = Math.abs(stats.boundingBox.min[index] + stats.boundingBox.max[index]);
      if (symmetryError > tolerance) {
        diagnostics.push({
          stage: "geometry",
          severity: rule.severity ?? "warning",
          message: `Constraint symmetry failed on ${rule.axis}: bbox is offset ${symmetryError.toFixed(3)}mm from the origin plane.`,
          featureId: `constraint:symmetry:${rule.axis}`,
        });
      }
      continue;
    }

    if (rule.kind === "clearance") {
      const [partA, partB] = rule.between;
      const pair = stats.pairwise.find((entry) =>
        (entry.partA === partA && entry.partB === partB) ||
        (entry.partA === partB && entry.partB === partA) ||
        (entry.partAId === partA && entry.partBId === partB) ||
        (entry.partAId === partB && entry.partBId === partA)
      );
      if (!pair) {
        diagnostics.push({
          stage: "geometry",
          severity: "warning",
          message: `Constraint clearance skipped: could not find pair "${partA}" and "${partB}" in model stats.`,
          featureId: "constraint:clearance:missing-pair",
        });
      } else if (pair.minDistance + 1e-6 < rule.min) {
        diagnostics.push({
          stage: "geometry",
          severity: rule.severity ?? "error",
          message: `Constraint clearance failed between "${partA}" and "${partB}": ${pair.minDistance.toFixed(3)}mm < ${rule.min}mm.`,
          featureId: `constraint:clearance:${pair.partAId}<->${pair.partBId}`,
        });
      }
      continue;
    }

    if (rule.kind === "max_overhang") {
      const maxRadians = (rule.angle * Math.PI) / 180;
      const offendingBodies: string[] = [];

      for (let bodyIndex = 0; bodyIndex < bodies.length; bodyIndex += 1) {
        const body = bodies[bodyIndex];
        const normals = body.mesh.normals;
        let violatingTriangles = 0;
        const totalTriangles = Math.floor(body.mesh.indices.length / 3);

        for (let tri = 0; tri < totalTriangles; tri += 1) {
          const base = tri * 9;
          if (base + 8 >= normals.length) break;
          const nz = (normals[base + 2] + normals[base + 5] + normals[base + 8]) / 3;
          const angleFromVertical = Math.acos(Math.min(1, Math.max(-1, Math.abs(nz))));
          if (nz < 0 && angleFromVertical > maxRadians) {
            violatingTriangles += 1;
          }
        }

        if (violatingTriangles > 0) {
          offendingBodies.push(body.name ?? `body:${bodyIndex + 1}`);
        }
      }

      if (offendingBodies.length > 0) {
        diagnostics.push({
          stage: "geometry",
          severity: rule.severity ?? "warning",
          message: `Constraint max_overhang failed: ${offendingBodies.join(", ")} exceed ${rule.angle}° overhang from vertical on downward faces.`,
          featureId: "constraint:max_overhang",
        });
      }
    }
  }

  return diagnostics;
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
  result: Omit<ModelResult, "errors" | "evaluation"> & { runtimeErrors: string[]; geometryValidation?: GeometryValidationConfig; constraints?: readonly SceneConstraint[] },
): ModelResult {
  const validated = runLayeredValidation({
    runtimeErrors: result.runtimeErrors,
    params: result.params,
    bodies: result.bodies,
    geometryValidation: result.geometryValidation,
    constraints: result.constraints,
  });

  return {
    bodies: result.bodies,
    toolBodies: result.toolBodies,
    params: result.params,
    hints: result.hints,
    camera: result.camera,
    sceneValidation: result.sceneValidation,
    geometryStats: validated.stats,
    diagnostics: validated.diagnostics,
    errors: diagnosticsToErrors(validated.diagnostics),
    evaluation: buildEvaluationBundle(validated, result.sceneValidation),
  };
}

function buildEvaluationBundle(
  validated: LayeredValidationResult,
  sceneValidation?: SceneValidationReport,
): EvaluationBundle {
  const stageIndex = new Map<ValidationStage, number>(
    VALIDATION_STAGES.map((stage, index) => [stage, index]),
  );
  const haltedIndex = validated.haltedAt ? stageIndex.get(validated.haltedAt) : undefined;
  const diagnosticsFor = (stage: ValidationStage) => validated.diagnostics.filter((diag) => diag.stage === stage);
  const stageSummaryFor = (stage: ValidationStage) => {
    const diagnostics = diagnosticsFor(stage);
    const errorCount = diagnostics.filter((diag) => diag.severity === "error").length;
    const warningCount = diagnostics.filter((diag) => diag.severity === "warning").length;
    const currentStageIndex = stageIndex.get(stage) ?? Number.MAX_SAFE_INTEGER;
    const status = typeof haltedIndex === "number" && currentStageIndex > haltedIndex
      ? "skipped"
      : errorCount > 0
        ? "fail"
        : "pass";
    return { status, errorCount, warningCount, diagnostics } as const;
  };

  const errorCount = validated.diagnostics.filter((diag) => diag.severity === "error").length;
  const warningCount = validated.diagnostics.filter((diag) => diag.severity === "warning").length;
  const tests = sceneValidation?.tests ?? [];
  const testFailures = tests.filter((test) => test.status === "fail").length;

  return {
    haltedAt: validated.haltedAt,
    summary: { errorCount, warningCount },
    typecheck: stageSummaryFor("types/schema"),
    semanticValidation: stageSummaryFor("semantic"),
    geometryValidation: stageSummaryFor("geometry"),
    relationValidation: stageSummaryFor("stats/relations"),
    stats: {
      available: Boolean(validated.stats),
      data: validated.stats,
    },
    tests: {
      status: tests.length === 0 ? "skipped" : testFailures > 0 ? "fail" : "pass",
      total: tests.length,
      failures: testFailures,
      results: tests,
    },
    render: {
      requested: false,
    },
  };
}
