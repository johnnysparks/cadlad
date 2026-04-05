import type { PrimitiveName, TaskAcceptanceCriteria, TaskSpec } from "./types.js";

export function buildAdhocTask(
  description: string,
  opts?: {
    difficulty?: number;
    max_iterations?: number;
    pass_threshold?: number;
  },
): TaskSpec {
  const id = generateId(description);
  const api_surface = inferApiSurface(description);
  const acceptance = buildAcceptance(description);

  return {
    id,
    difficulty: opts?.difficulty ?? 2,
    description,
    acceptance,
    api_surface,
    max_iterations: opts?.max_iterations ?? 5,
  };
}

export function getAdhocPassThreshold(opts?: { pass_threshold?: number }): number {
  return opts?.pass_threshold ?? 60;
}

function generateId(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40)
    .replace(/-+$/, "");
}

const KEYWORD_MAP: Array<[RegExp, PrimitiveName[]]> = [
  [/hole|cut|through/i, ["subtract", "cylinder"]],
  [/round|fillet|smooth/i, ["fillet"]],
  [/hollow|shell|thin wall/i, ["shell"]],
  [/handle|arm|bracket/i, ["sketch", "extrude"]],
  [/taper|draft/i, ["draft"]],
  [/assem|parts|multi/i, ["assembly"]],
  [/slot|channel|groove/i, ["sketch", "subtract"]],
  [/param|adjustable|variable/i, ["param"]],
];

const BASELINE: PrimitiveName[] = ["box", "cylinder", "translate"];

function inferApiSurface(description: string): PrimitiveName[] {
  const collected: PrimitiveName[] = [...BASELINE];

  for (const [pattern, names] of KEYWORD_MAP) {
    if (pattern.test(description)) {
      collected.push(...names);
    }
  }

  return [...new Set(collected)];
}

function hasAssemblyKeywords(description: string): boolean {
  return /assem|parts|multi/i.test(description);
}

function buildAcceptance(description: string): TaskAcceptanceCriteria {
  const acceptance: TaskAcceptanceCriteria = {
    validation_errors: 0,
    volume_min: 100,
  };

  if (hasAssemblyKeywords(description)) {
    acceptance.body_count_min = 2;
    acceptance.assembly = true;
  } else {
    acceptance.body_count = 1;
  }

  return acceptance;
}
