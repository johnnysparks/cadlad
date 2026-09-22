import type { EvaluationBundle, GeometryStats } from "@cadlad/kernel/types.js";
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

  const threshold = task.pass_threshold ?? 70;
  return {
    total,
    pass: total >= threshold,
    geometry,
    constraints,
    api,
    judge,
    weights,
  };
}

/** Return short, concrete reasons for a deterministic acceptance miss. */
export function describeScoreFailures(task: TaskSpec, bundle: EvaluationBundle, source: string): string[] {
  const failures: string[] = [];
  const stats = bundle.stats.data;
  const acceptance = task.acceptance;

  if (stats) {
    if (acceptance.body_count !== undefined && stats.bodies !== acceptance.body_count) {
      failures.push(`body count is ${stats.bodies}; expected ${acceptance.body_count}`);
    }
    if (acceptance.body_count_min !== undefined && stats.bodies < acceptance.body_count_min) {
      failures.push(`body count is ${stats.bodies}; expected at least ${acceptance.body_count_min}`);
    }
    if (acceptance.body_count_max !== undefined && stats.bodies > acceptance.body_count_max) {
      failures.push(`body count is ${stats.bodies}; expected at most ${acceptance.body_count_max}`);
    }
    if (acceptance.volume_min !== undefined && stats.volume < acceptance.volume_min) {
      failures.push(`volume ${stats.volume.toFixed(2)} is below ${acceptance.volume_min}`);
    }
    if (acceptance.volume_max !== undefined && stats.volume > acceptance.volume_max) {
      failures.push(`volume ${stats.volume.toFixed(2)} exceeds ${acceptance.volume_max}`);
    }
    const extents = bboxExtents(stats);
    if (acceptance.bbox_min && acceptance.bbox_min.some((min, index) => extents[index] < min)) {
      failures.push(`bounding-box extents ${formatTriple(extents)} are below the required minimum ${formatTriple(acceptance.bbox_min)}`);
    }
    if (acceptance.bbox_max && acceptance.bbox_max.some((max, index) => extents[index] > max)) {
      failures.push(`bounding-box extents ${formatTriple(extents)} exceed the allowed maximum ${formatTriple(acceptance.bbox_max)}`);
    }
    if (stats.checks.hasZeroVolume || stats.checks.hasDegenerateBoundingBox) {
      failures.push("geometry contains zero-volume or degenerate bodies");
    }
  } else {
    failures.push("geometry statistics are unavailable");
  }

  const expectedErrors = acceptance.validation_errors ?? 0;
  if (bundle.summary.errorCount !== expectedErrors) {
    failures.push(`validation errors=${bundle.summary.errorCount}; expected ${expectedErrors}`);
  }
  if (acceptance.validation_warnings_max !== undefined
    && bundle.summary.warningCount > acceptance.validation_warnings_max) {
    failures.push(`validation warnings=${bundle.summary.warningCount}; maximum is ${acceptance.validation_warnings_max}`);
  }
  if (acceptance.has_params && acceptance.has_params.some((name) => !source.includes(name))) {
    failures.push(`missing required parameters: ${acceptance.has_params.filter((name) => !source.includes(name)).join(", ")}`);
  }
  if (acceptance.has_subtraction && !/\.subtract\s*\(/.test(source)) failures.push("required subtraction is missing");
  if (acceptance.has_slot_or_channel && !/\b(slot|channel)\s*\(/.test(source)) failures.push("required slot or channel feature is missing");
  if (acceptance.assembly && !/\bassembly\s*\(/.test(source)) failures.push("required assembly grouping is missing");

  return failures;
}


export function applyJudgeScore(
  base: ScoreBreakdown,
  judgeScore: number,
  options?: { pass?: boolean; threshold?: number },
): ScoreBreakdown {
  const clampedJudge = clamp(judgeScore);
  // A configured judge is an acceptance gate. Do not treat a zero verdict as
  // an omitted judge and redistribute its weight back into deterministic
  // checks: a visually wrong but valid model must remain a failure.
  const weights = {
    geometry: BASE_WEIGHTS.geometry,
    constraints: BASE_WEIGHTS.constraints,
    api: BASE_WEIGHTS.api,
    judge: BASE_WEIGHTS.judge,
  };
  const total = clamp(
    base.geometry * weights.geometry
      + base.constraints * weights.constraints
      + base.api * weights.api
      + clampedJudge * weights.judge,
  );

  return {
    ...base,
    total,
    pass: total >= (options?.threshold ?? 70)
      && options?.pass !== false
      && clampedJudge > 0,
    judge: clampedJudge,
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
    const count = stats.bodies;
    if (acceptance.body_count !== undefined && count !== acceptance.body_count) return 0;
    if (acceptance.body_count_min !== undefined && count < acceptance.body_count_min) return 0;
    if (acceptance.body_count_max !== undefined && count > acceptance.body_count_max) return 0;
    return 20;
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
    if (!acceptance.bbox_min && !acceptance.bbox_max) {
      return 20;
    }
    if (!stats) {
      return 0;
    }
    const actual = bboxExtents(stats);
    const minOk = !acceptance.bbox_min
      || (actual[0] >= acceptance.bbox_min[0]
        && actual[1] >= acceptance.bbox_min[1]
        && actual[2] >= acceptance.bbox_min[2]);
    const maxOk = !acceptance.bbox_max
      || (actual[0] <= acceptance.bbox_max[0]
        && actual[1] <= acceptance.bbox_max[1]
        && actual[2] <= acceptance.bbox_max[2]);
    return minOk && maxOk
      ? 20
      : 0;
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
  const warningLimit = task.acceptance.validation_warnings_max;
  const warningPoints = warningLimit !== undefined && warningCount > warningLimit
    ? 0
    : Math.max(0, 20 - warningCount * 5);

  const paramsOk = (() => {
    const requiredParams = task.acceptance.has_params;
    return !requiredParams || requiredParams.length === 0
      || requiredParams.every((paramName) => source.includes(paramName));
  })();

  const featureRequirementsOk = (() => {
    const requiresSubtraction = task.acceptance.has_subtraction;
    const requiresSlot = task.acceptance.has_slot_or_channel;
    const requiresAssembly = task.acceptance.assembly;
    const subtractionOk = !requiresSubtraction || /\.subtract\s*\(/.test(source);
    const slotOk = !requiresSlot || /\b(slot|channel)\s*\(/.test(source);
    const assemblyOk = !requiresAssembly || /\bassembly\s*\(/.test(source);
    return subtractionOk && slotOk && assemblyOk;
  })();

  const clearanceOk = (() => {
    const range = task.acceptance.constraint_clearance;
    if (!range) return true;
    const distances = bundle.stats.data?.pairwise.map((pair) => pair.minDistance) ?? [];
    if (distances.length === 0) return false;
    return distances.every((distance) => distance >= range.min_mm && distance <= range.max_mm);
  })();

  // Keep the historical 100-point constraint scale while making every
  // declared requirement an acceptance gate instead of a source hint.
  const requirementPoints = paramsOk && featureRequirementsOk && clearanceOk ? 20 : 0;
  return errorPoints + warningPoints + requirementPoints;
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
    return {
      geometry: BASE_WEIGHTS.geometry,
      constraints: BASE_WEIGHTS.constraints,
      api: BASE_WEIGHTS.api,
      judge: BASE_WEIGHTS.judge,
    };
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

function bboxExtents(stats: GeometryStats): [number, number, number] {
  return [
    stats.boundingBox.max[0] - stats.boundingBox.min[0],
    stats.boundingBox.max[1] - stats.boundingBox.min[1],
    stats.boundingBox.max[2] - stats.boundingBox.min[2],
  ];
}

function formatTriple(values: [number, number, number]): string {
  return `[${values.map((value) => value.toFixed(2)).join(", ")}]`;
}
