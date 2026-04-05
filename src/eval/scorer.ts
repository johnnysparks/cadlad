import type { EvaluationBundle, GeometryStats } from "../engine/types.js";
import type { ScoreBreakdown, TaskSpec } from "./types.js";

const BASE_WEIGHTS = {
  geometry: 0.4,
  constraints: 0.3,
  api: 0.2,
  judge: 0.1,
} as const;

export function scoreEval(task: TaskSpec, bundle: EvaluationBundle, source: string): ScoreBreakdown {
  const judge = 0;
  const geometry = scoreGeometry(task, bundle.stats.data);
  const constraints = scoreConstraints(task, bundle, source);
  const api = scoreApiSurface(task, source);

  const weights = effectiveWeights(judge);
  const total = clamp(
    geometry * weights.geometry
      + constraints * weights.constraints
      + api * weights.api
      + judge * weights.judge,
  );

  return {
    total,
    pass: total >= 70,
    geometry,
    constraints,
    api,
    judge,
    weights,
  };
}

function scoreGeometry(task: TaskSpec, stats: GeometryStats | undefined): number {
  const acceptance = task.acceptance;

  const bodyCountPoints = (() => {
    if (acceptance.body_count === undefined && acceptance.body_count_min === undefined) {
      return 20;
    }
    if (!stats) {
      return 0;
    }
    if (acceptance.body_count !== undefined) {
      return stats.bodies === acceptance.body_count ? 20 : 0;
    }
    return stats.bodies >= (acceptance.body_count_min ?? 0) ? 20 : 0;
  })();

  const volumePoints = (() => {
    if (acceptance.volume_min === undefined && acceptance.volume_max === undefined) {
      return 40;
    }
    if (!stats) {
      return 0;
    }
    const minOk = acceptance.volume_min === undefined || stats.volume >= acceptance.volume_min;
    const maxOk = acceptance.volume_max === undefined || stats.volume <= acceptance.volume_max;
    return minOk && maxOk ? 40 : 0;
  })();

  const bboxPoints = (() => {
    if (!acceptance.bbox_max) {
      return 20;
    }
    if (!stats) {
      return 0;
    }
    const [maxX, maxY, maxZ] = acceptance.bbox_max;
    const actual = stats.boundingBox.max;
    return actual[0] <= maxX && actual[1] <= maxY && actual[2] <= maxZ ? 20 : 0;
  })();

  const noDegeneratePoints = (() => {
    if (!stats) {
      return 0;
    }
    return !stats.checks.hasZeroVolume && !stats.checks.hasDegenerateBoundingBox ? 20 : 0;
  })();

  return bodyCountPoints + volumePoints + bboxPoints + noDegeneratePoints;
}

function scoreConstraints(task: TaskSpec, bundle: EvaluationBundle, source: string): number {
  const expectedErrors = task.acceptance.validation_errors ?? 0;
  const errorPoints = bundle.summary.errorCount === expectedErrors ? 60 : 0;

  const warningCount = bundle.summary.warningCount;
  const warningPoints = Math.max(0, 20 - warningCount * 5);

  const paramPoints = (() => {
    const requiredParams = task.acceptance.has_params;
    if (!requiredParams || requiredParams.length === 0) {
      return 20;
    }
    const hasAll = requiredParams.every((paramName) => source.includes(paramName));
    return hasAll ? 20 : 0;
  })();

  return errorPoints + warningPoints + paramPoints;
}

function scoreApiSurface(task: TaskSpec, source: string): number {
  if (task.api_surface.length === 0) {
    return 100;
  }

  const matches = task.api_surface.filter((method) => source.includes(method)).length;
  return (matches / task.api_surface.length) * 100;
}

function effectiveWeights(judge: number): ScoreBreakdown["weights"] {
  if (judge > 0) {
    return BASE_WEIGHTS;
  }

  const nonJudge = BASE_WEIGHTS.geometry + BASE_WEIGHTS.constraints + BASE_WEIGHTS.api;
  return {
    geometry: BASE_WEIGHTS.geometry / nonJudge,
    constraints: BASE_WEIGHTS.constraints / nonJudge,
    api: BASE_WEIGHTS.api / nonJudge,
    judge: 0,
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scoreEval(task: TaskSpec, bundle: EvaluationBundle, source: string): {
  total: number;
  geometry: number;
  constraints: number;
  api: number;
  visual: number;
  feedback: string[];
} {
  const scored = scoreEvaluation({ task, bundle, source });
  return {
    total: scored.score,
    geometry: scored.geometry,
    constraints: scored.constraints,
    api: scored.api,
    visual: scored.visual,
    feedback: scored.feedback,
  };
}
