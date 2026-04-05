import type { PrimitiveName, TaskAcceptanceCriteria, TaskSpec } from "./types.js";

const BASELINE_API: PrimitiveName[] = ["box", "cylinder", "translate"];
const MULTI_BODY_PATTERNS = ["assem", "parts", "multi"];

type AdhocOptions = {
  difficulty?: number;
  max_iterations?: number;
  pass_threshold?: number;
};

export function buildAdhocTask(description: string, opts?: AdhocOptions): TaskSpec {
  const normalized = description.trim();
  const taskId = buildTaskId(normalized);
  const hasAssembly = containsPattern(normalized, MULTI_BODY_PATTERNS);
  const apiSurface = inferApiSurface(normalized);
  const acceptance = buildAcceptance(hasAssembly);

  return {
    id: taskId,
    difficulty: opts?.difficulty ?? 2,
    description,
    acceptance,
    api_surface: apiSurface,
    max_iterations: opts?.max_iterations ?? 5,
    pass_threshold: opts?.pass_threshold ?? 60,
  };
}

function buildTaskId(description: string): string {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 40)
    .replace(/-+$/g, "")
    .replace(/^-+/g, "");

  return slug || "adhoc-task";
}

function inferApiSurface(description: string): PrimitiveName[] {
  const inferred = new Set<PrimitiveName>(BASELINE_API);

  const addPatterns = (patterns: string[], api: PrimitiveName[]) => {
    if (containsPattern(description, patterns)) {
      for (const method of api) inferred.add(method);
    }
  };

  addPatterns(["hole", "cut", "through"], ["subtract", "cylinder"]);
  addPatterns(["round", "fillet", "smooth"], ["fillet"]);
  addPatterns(["hollow", "shell", "thin wall"], ["shell"]);
  addPatterns(["handle", "arm", "bracket"], ["sketch", "extrude"]);
  addPatterns(["taper", "draft"], ["draft"]);
  addPatterns(MULTI_BODY_PATTERNS, ["assembly"]);
  addPatterns(["slot", "channel", "groove"], ["sketch", "subtract"]);
  addPatterns(["param", "adjustable", "variable"], ["param"]);

  return Array.from(inferred);
}

function buildAcceptance(hasAssembly: boolean): TaskAcceptanceCriteria {
  if (hasAssembly) {
    return {
      body_count_min: 2,
      validation_errors: 0,
      volume_min: 100,
    };
  }

  return {
    body_count: 1,
    validation_errors: 0,
    volume_min: 100,
  };
}

function containsPattern(description: string, patterns: string[]): boolean {
  const lower = description.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}
