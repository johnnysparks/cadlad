import type { EvaluationBundle } from "../engine/types.js";
import type { EvalResult, ScoringRubric, TaskSpec } from "./types.js";

const DEFAULT_RUBRIC: ScoringRubric = {
  passingScore: 70,
  weights: {
    geometry: 0.4,
    constraints: 0.3,
    api: 0.2,
    visual: 0.1,
  },
};

export function scoreEvaluation(args: {
  task: TaskSpec;
  bundle: EvaluationBundle;
  source: string;
  judgeScore?: number;
  rubric?: Partial<ScoringRubric>;
}): EvalResult {
  const { task, bundle, source, judgeScore } = args;
  const rubric = mergeRubric(args.rubric);
  const feedback: string[] = [];

  const geometry = computeGeometryScore(task, bundle, feedback);
  const constraints = computeConstraintScore(task, bundle, feedback);
  const api = computeApiScore(task, source, feedback);
  const visual = clampScore(judgeScore ?? 0);

  const effectiveWeights = buildEffectiveWeights(rubric.weights, judgeScore);
  const score = clampScore(
    geometry * effectiveWeights.geometry
      + constraints * effectiveWeights.constraints
      + api * effectiveWeights.api
      + visual * effectiveWeights.visual,
  );

  return {
    pass: score >= rubric.passingScore,
    score,
    geometry,
    constraints,
    api,
    visual,
    feedback,
  };
}

function computeGeometryScore(task: TaskSpec, bundle: EvaluationBundle, feedback: string[]): number {
  const parts: number[] = [];
  const criteria = task.acceptance;
  const stats = bundle.stats.data;

  if (criteria.volume_min !== undefined || criteria.volume_max !== undefined) {
    if (!stats) {
      parts.push(0);
      feedback.push("Geometry stats were unavailable, so volume checks failed.");
    } else {
      const volume = stats.volume;
      if (criteria.volume_min !== undefined && volume < criteria.volume_min) {
        parts.push(0);
        feedback.push(`Volume ${volume.toFixed(2)} is below minimum ${criteria.volume_min}.`);
      } else if (criteria.volume_max !== undefined && volume > criteria.volume_max) {
        parts.push(0);
        feedback.push(`Volume ${volume.toFixed(2)} is above maximum ${criteria.volume_max}.`);
      } else {
        parts.push(100);
      }
    }
  }

  if (
    criteria.body_count !== undefined
    || criteria.body_count_min !== undefined
    || criteria.body_count_max !== undefined
  ) {
    if (!stats) {
      parts.push(0);
      feedback.push("Geometry stats were unavailable, so body count checks failed.");
    } else {
      const bodies = stats.bodies;
      if (criteria.body_count !== undefined && bodies !== criteria.body_count) {
        parts.push(0);
        feedback.push(`Expected body_count=${criteria.body_count}, got ${bodies}.`);
      } else if (criteria.body_count_min !== undefined && bodies < criteria.body_count_min) {
        parts.push(0);
        feedback.push(`Expected at least ${criteria.body_count_min} bodies, got ${bodies}.`);
      } else if (criteria.body_count_max !== undefined && bodies > criteria.body_count_max) {
        parts.push(0);
        feedback.push(`Expected at most ${criteria.body_count_max} bodies, got ${bodies}.`);
      } else {
        parts.push(100);
      }
    }
  }

  if (criteria.bbox_min !== undefined || criteria.bbox_max !== undefined) {
    if (!stats) {
      parts.push(0);
      feedback.push("Geometry stats were unavailable, so bounding-box checks failed.");
    } else {
      const extents = stats.boundingBox;
      const mins = [extents.min[0], extents.min[1], extents.min[2]];
      const maxes = [extents.max[0], extents.max[1], extents.max[2]];
      const labels = ["x", "y", "z"] as const;

      let ok = true;
      if (criteria.bbox_min) {
        for (const [index, minValue] of criteria.bbox_min.entries()) {
          if (mins[index] < minValue) {
            ok = false;
            feedback.push(`Bounding box min ${labels[index]}=${mins[index].toFixed(2)} is below ${minValue}.`);
          }
        }
      }
      if (criteria.bbox_max) {
        for (const [index, maxValue] of criteria.bbox_max.entries()) {
          if (maxes[index] > maxValue) {
            ok = false;
            feedback.push(`Bounding box max ${labels[index]}=${maxes[index].toFixed(2)} exceeds ${maxValue}.`);
          }
        }
      }
      parts.push(ok ? 100 : 0);
    }
  }

  if (stats) {
    if (stats.checks.hasZeroVolume || stats.checks.hasDegenerateBoundingBox) {
      parts.push(0);
      feedback.push("Degenerate geometry detected (zero volume or degenerate bounding box).");
    } else {
      parts.push(100);
    }
  }

  if (parts.length === 0) {
    return 100;
  }

  return average(parts);
}

function computeConstraintScore(task: TaskSpec, bundle: EvaluationBundle, feedback: string[]): number {
  const criteria = task.acceptance;
  const parts: number[] = [];
  const errors = bundle.summary.errorCount;
  const warnings = bundle.summary.warningCount;

  if (criteria.validation_errors !== undefined) {
    if (errors !== criteria.validation_errors) {
      parts.push(0);
      feedback.push(`Expected validation_errors=${criteria.validation_errors}, got ${errors}.`);
    } else {
      parts.push(100);
    }
  } else {
    parts.push(errors === 0 ? 100 : 0);
    if (errors > 0) {
      feedback.push(`Validation reported ${errors} error(s).`);
    }
  }

  if (criteria.validation_warnings_max !== undefined) {
    if (warnings > criteria.validation_warnings_max) {
      parts.push(0);
      feedback.push(
        `Validation warnings ${warnings} exceed allowed maximum ${criteria.validation_warnings_max}.`,
      );
    } else {
      parts.push(100);
    }
  } else if (warnings === 0) {
    parts.push(100);
  } else {
    parts.push(50);
    feedback.push(`Validation reported ${warnings} warning(s).`);
  }

  return average(parts);
}

function computeApiScore(task: TaskSpec, source: string, feedback: string[]): number {
  if (task.api_surface.length === 0) {
    return 100;
  }

  let matched = 0;
  for (const primitive of task.api_surface) {
    const usageRegex = new RegExp(`\\b${escapeRegExp(primitive)}\\b`);
    if (usageRegex.test(source)) {
      matched += 1;
    } else {
      feedback.push(`Missing required API primitive "${primitive}" in generated source.`);
    }
  }

  return (matched / task.api_surface.length) * 100;
}

function mergeRubric(override?: Partial<ScoringRubric>): ScoringRubric {
  return {
    passingScore: override?.passingScore ?? DEFAULT_RUBRIC.passingScore,
    weights: {
      geometry: override?.weights?.geometry ?? DEFAULT_RUBRIC.weights.geometry,
      constraints: override?.weights?.constraints ?? DEFAULT_RUBRIC.weights.constraints,
      api: override?.weights?.api ?? DEFAULT_RUBRIC.weights.api,
      visual: override?.weights?.visual ?? DEFAULT_RUBRIC.weights.visual,
    },
  };
}

function buildEffectiveWeights(
  weights: ScoringRubric["weights"],
  judgeScore: number | undefined,
): ScoringRubric["weights"] {
  if (judgeScore !== undefined) {
    return weights;
  }

  const deterministicTotal = weights.geometry + weights.constraints + weights.api;
  if (deterministicTotal <= 0) {
    return { geometry: 0, constraints: 0, api: 0, visual: 0 };
  }

  return {
    geometry: weights.geometry / deterministicTotal,
    constraints: weights.constraints / deterministicTotal,
    api: weights.api / deterministicTotal,
    visual: 0,
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
