import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseTaskSpec } from "./types.js";

interface ModelSummary {
  runs: number;
  pass_rate: number;
  avg_score: number;
  avg_iterations: number;
  avg_tokens: number;
}

export interface TaskSummary {
  task_id: string;
  runs: number;
  pass_rate: number;
  avg_score: number;
  avg_iterations: number;
  avg_tokens: number;
  avg_duration_ms: number;
  max_iterations_observed?: number;
  by_model: Record<string, ModelSummary>;
}

export interface AggregatedReport {
  generated_at: string;
  total_runs: number;
  overall_pass_rate: number;
  tasks: TaskSummary[];
  models: string[];
}

export interface EvalIssue {
  task_id: string;
  severity: "critical" | "warning";
  issue: string;
  detail: string;
}

export interface IssueReport {
  issues: EvalIssue[];
}

export interface DeadweightEntry {
  api_method: string;
  referenced_in_tasks: string[];
  success_rate: number;
  issue: string;
}

export interface DeadweightReport {
  entries: DeadweightEntry[];
}

interface CompletedRun {
  task_id: string;
  model: string;
  pass: boolean;
  score: number;
  iterations: number;
  total_tokens: number;
  duration_ms: number;
  max_iterations?: number;
  run_id: string;
}

export function aggregateLogs(logDir = resolve("eval-logs")): AggregatedReport {
  const logFiles = findFilesRecursive(resolve(logDir), ".ndjson");
  const runs = logFiles.map(parseRunFromLog).filter((run): run is CompletedRun => run !== null);

  const taskMap = new Map<string, {
    runs: CompletedRun[];
    byModel: Map<string, CompletedRun[]>;
  }>();
  const models = new Set<string>();
  let totalPass = 0;

  for (const run of runs) {
    models.add(run.model);
    if (run.pass) totalPass += 1;

    const existing = taskMap.get(run.task_id) ?? { runs: [], byModel: new Map<string, CompletedRun[]>() };
    existing.runs.push(run);
    const modelRuns = existing.byModel.get(run.model) ?? [];
    modelRuns.push(run);
    existing.byModel.set(run.model, modelRuns);
    taskMap.set(run.task_id, existing);
  }

  const tasks: TaskSummary[] = Array.from(taskMap.entries())
    .map(([task_id, grouped]) => {
      const by_model: Record<string, ModelSummary> = {};
      for (const [model, modelRuns] of grouped.byModel.entries()) {
        by_model[model] = summarizeRuns(modelRuns);
      }

      const summary = summarizeRuns(grouped.runs);
      return {
        task_id,
        runs: summary.runs,
        pass_rate: summary.pass_rate,
        avg_score: summary.avg_score,
        avg_iterations: summary.avg_iterations,
        avg_tokens: summary.avg_tokens,
        avg_duration_ms: average(grouped.runs.map((run) => run.duration_ms)),
        max_iterations_observed: maxNumber(grouped.runs.map((run) => run.max_iterations ?? run.iterations)),
        by_model,
      };
    })
    .sort((a, b) => a.task_id.localeCompare(b.task_id));

  return {
    generated_at: new Date().toISOString(),
    total_runs: runs.length,
    overall_pass_rate: runs.length > 0 ? totalPass / runs.length : 0,
    tasks,
    models: Array.from(models).sort((a, b) => a.localeCompare(b)),
  };
}

export function generateIssuesReport(report: AggregatedReport): IssueReport {
  const issues: EvalIssue[] = [];
  const modelPassesElsewhere = new Map<string, boolean>();

  for (const task of report.tasks) {
    for (const [model, modelSummary] of Object.entries(task.by_model)) {
      if (modelSummary.pass_rate > 0) {
        modelPassesElsewhere.set(model, true);
      } else if (!modelPassesElsewhere.has(model)) {
        modelPassesElsewhere.set(model, false);
      }
    }
  }

  for (const task of report.tasks) {
    if (task.pass_rate === 0) {
      issues.push({
        task_id: task.task_id,
        severity: "critical",
        issue: "Task never passes",
        detail: "Pass rate is 0% across all models, so the task may be impossible or the prompt/spec is under-defined.",
      });
    }

    for (const [model, modelSummary] of Object.entries(task.by_model)) {
      const modelPassesOtherTasks = modelPassesElsewhere.get(model) === true;
      if (modelSummary.pass_rate === 0 && modelPassesOtherTasks) {
        issues.push({
          task_id: task.task_id,
          severity: "critical",
          issue: "Model-specific failure gap",
          detail: `${model} never passes this task but does pass other tasks, indicating a model-specific capability gap.`,
        });
      }
    }

    const maxIterations = task.max_iterations_observed;
    if (maxIterations !== undefined && task.avg_iterations === maxIterations) {
      issues.push({
        task_id: task.task_id,
        severity: "warning",
        issue: "Iterations likely maxing out",
        detail: `Average iterations (${task.avg_iterations.toFixed(1)}) equals observed maximum (${maxIterations}), suggesting timeout/retry ceiling pressure.`,
      });
    }

    if (task.pass_rate > 0 && task.avg_score < 50) {
      issues.push({
        task_id: task.task_id,
        severity: "warning",
        issue: "Fragile passing quality",
        detail: `Task sometimes passes, but average score is only ${task.avg_score.toFixed(1)} (< 50), indicating brittle solutions.`,
      });
    }
  }

  return { issues };
}

export function generateDeadweightReport(logDir: string, tasksDir: string): DeadweightReport {
  const taskSpecs = loadTaskSpecs(tasksDir);
  const methods = new Map<string, Set<string>>();
  for (const task of taskSpecs) {
    for (const apiMethod of task.api_surface) {
      const taskSet = methods.get(apiMethod) ?? new Set<string>();
      taskSet.add(task.id);
      methods.set(apiMethod, taskSet);
    }
  }

  const usage = new Map<string, { used: number; pass: number }>();
  const logFiles = findFilesRecursive(resolve(logDir), ".ndjson");

  for (const logFile of logFiles) {
    const run = parseRunFromLog(logFile);
    if (!run) continue;

    const task = taskSpecs.find((spec) => spec.id === run.task_id);
    if (!task) continue;

    const sourcePath = resolve("eval-scratch", run.task_id, `${run.run_id}.forge.ts`);
    const source = safeReadFile(sourcePath);

    for (const apiMethod of task.api_surface) {
      if (!source || !source.includes(apiMethod)) {
        continue;
      }

      const stat = usage.get(apiMethod) ?? { used: 0, pass: 0 };
      stat.used += 1;
      if (run.pass) stat.pass += 1;
      usage.set(apiMethod, stat);
    }
  }

  const entries: DeadweightEntry[] = [];
  for (const [api_method, referencedTasksSet] of methods.entries()) {
    const referenced_in_tasks = Array.from(referencedTasksSet).sort((a, b) => a.localeCompare(b));
    const stats = usage.get(api_method);

    if (!stats || stats.used === 0) {
      entries.push({
        api_method,
        referenced_in_tasks,
        success_rate: 0,
        issue: "Referenced in tasks but never detected in generated code.",
      });
      continue;
    }

    const success_rate = stats.pass / stats.used;
    if (success_rate < 0.3) {
      entries.push({
        api_method,
        referenced_in_tasks,
        success_rate,
        issue: "Used in generated code but associated pass rate is below 30%.",
      });
    }
  }

  return { entries: entries.sort((a, b) => a.api_method.localeCompare(b.api_method)) };
}

function parseRunFromLog(logPath: string): CompletedRun | null {
  const lines = safeReadFile(logPath)?.split(/\r?\n/).filter(Boolean) ?? [];
  const events = lines.map((line) => {
    try {
      return JSON.parse(line) as { event?: string; run_id?: string; task_id?: string; data?: Record<string, unknown> };
    } catch {
      return null;
    }
  }).filter((event): event is { event?: string; run_id?: string; task_id?: string; data?: Record<string, unknown> } => event !== null);

  const started = events.find((event) => event.event === "run.started");
  const completed = [...events].reverse().find((event) => event.event === "run.completed");
  if (!completed) return null;

  const data = completed.data ?? {};
  const startedData = started?.data ?? {};
  const model = asString(data.model) ?? asString(startedData.model) ?? "unknown";
  const pass = asBoolean(data.pass) ?? false;
  const score = asNumber(data.final_score) ?? asNumber(data.score) ?? 0;
  const iterations = asNumber(data.iterations) ?? 0;
  const total_tokens = asNumber(data.total_tokens) ?? 0;
  const duration_ms = asNumber(data.duration_ms) ?? 0;
  const task_id = asString(data.task_id) ?? completed.task_id ?? started?.task_id;
  const run_id = completed.run_id ?? started?.run_id;
  const max_iterations = asNumber(data.max_iterations) ?? asNumber(startedData.max_iterations);

  if (!task_id || !run_id) return null;

  return {
    task_id,
    model,
    pass,
    score,
    iterations,
    total_tokens,
    duration_ms,
    max_iterations,
    run_id,
  };
}

function loadTaskSpecs(tasksDir: string): ReturnType<typeof parseTaskSpec>[] {
  const taskFiles = findFilesRecursive(resolve(tasksDir), ".yaml");
  return taskFiles
    .map((path) => safeReadFile(path))
    .filter((raw): raw is string => typeof raw === "string")
    .map((raw) => {
      try {
        return parseTaskSpec(raw);
      } catch {
        return null;
      }
    })
    .filter((task): task is ReturnType<typeof parseTaskSpec> => task !== null);
}

function findFilesRecursive(rootDir: string, extension: string): string[] {
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(rootDir);
  } catch {
    return [];
  }

  if (!stats.isDirectory()) {
    return rootDir.endsWith(extension) ? [rootDir] : [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findFilesRecursive(fullPath, extension));
    } else if (entry.isFile() && fullPath.endsWith(extension)) {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function summarizeRuns(runs: CompletedRun[]): ModelSummary {
  const runCount = runs.length;
  const passes = runs.filter((run) => run.pass).length;
  return {
    runs: runCount,
    pass_rate: runCount > 0 ? passes / runCount : 0,
    avg_score: average(runs.map((run) => run.score)),
    avg_iterations: average(runs.map((run) => run.iterations)),
    avg_tokens: average(runs.map((run) => run.total_tokens)),
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxNumber(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((acc, value) => Math.max(acc, value), values[0]);
}

function safeReadFile(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
