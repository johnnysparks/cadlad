import { runEval } from "./runner.js";
import type { EvalResult, ModelConfig, TaskSpec } from "./types.js";

export interface BatchConfig {
  tasks: TaskSpec[];
  models: ModelConfig[];
  judgeConfig?: ModelConfig;
  concurrency: number;
  repeat?: number;
  renderSession?: any;
  onResult?: (result: EvalResult) => void;
}

export interface BatchReport {
  started_at: string;
  completed_at: string;
  results: EvalResult[];
  summary: {
    total_runs: number;
    total_pass: number;
    total_fail: number;
    total_tokens: number;
    total_duration_ms: number;
  };
}

interface WorkItem {
  task: TaskSpec;
  model: ModelConfig;
  taskIndex: number;
  modelIndex: number;
  repeatIndex: number;
}

interface BackendLock {
  limit: number;
  running: number;
  queue: Array<() => void>;
}

export async function runBatch(config: BatchConfig): Promise<BatchReport> {
  const startedAt = new Date();
  const maxConcurrency = Math.max(1, config.concurrency || 1);
  const repeat = Math.max(1, config.repeat ?? 1);

  const workItems: WorkItem[] = [];
  for (let taskIndex = 0; taskIndex < config.tasks.length; taskIndex += 1) {
    for (let modelIndex = 0; modelIndex < config.models.length; modelIndex += 1) {
      for (let repeatIndex = 0; repeatIndex < repeat; repeatIndex += 1) {
        workItems.push({
          task: config.tasks[taskIndex],
          model: config.models[modelIndex],
          taskIndex,
          modelIndex,
          repeatIndex,
        });
      }
    }
  }

  const running = new Set<Promise<void>>();
  const completed: Array<{ result: EvalResult; work: WorkItem }> = [];
  let nextIndex = 0;

  const locks = new Map<string, BackendLock>();

  function getLock(model: ModelConfig): BackendLock {
    const backend = model.model.startsWith("ollama://") || model.provider === "ollama" ? "ollama" : "api";
    const limit = backend === "ollama" ? 1 : maxConcurrency;
    if (!locks.has(backend)) {
      locks.set(backend, { limit, running: 0, queue: [] });
    }
    return locks.get(backend)!;
  }

  async function acquireLock(lock: BackendLock): Promise<void> {
    if (lock.running < lock.limit) {
      lock.running += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      lock.queue.push(() => {
        lock.running += 1;
        resolve();
      });
    });
  }

  function releaseLock(lock: BackendLock): void {
    lock.running = Math.max(0, lock.running - 1);
    const next = lock.queue.shift();
    if (next) {
      next();
    }
  }

  async function runOne(work: WorkItem): Promise<void> {
    const lock = getLock(work.model);
    await acquireLock(lock);
    try {
      const outcome = await runEval(work.task, work.model, { 
        judgeConfig: config.judgeConfig,
        renderSession: config.renderSession
      });
      const result: EvalResult = { ...outcome, model: `${work.model.provider}://${work.model.model}` };
      completed.push({ result, work });
      config.onResult?.(result);
    } finally {
      releaseLock(lock);
    }
  }

  while (nextIndex < workItems.length || running.size > 0) {
    while (running.size < maxConcurrency && nextIndex < workItems.length) {
      const work = workItems[nextIndex];
      nextIndex += 1;
      const promise = runOne(work).finally(() => {
        running.delete(promise);
      });
      running.add(promise);
    }

    if (running.size > 0) {
      await Promise.race(running);
    }
  }

  const ordered = completed
    .sort((a, b) => (
      a.work.taskIndex - b.work.taskIndex
      || a.work.modelIndex - b.work.modelIndex
      || a.work.repeatIndex - b.work.repeatIndex
    ))
    .map((entry) => entry.result);

  const completedAt = new Date();

  return {
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    results: ordered,
    summary: {
      total_runs: ordered.length,
      total_pass: ordered.filter((result) => result.pass).length,
      total_fail: ordered.filter((result) => !result.pass).length,
      total_tokens: ordered.reduce((sum, result) => sum + result.total_tokens, 0),
      total_duration_ms: ordered.reduce((sum, result) => sum + result.duration_ms, 0),
    },
  };
}

export function formatBatchSummaryTable(report: BatchReport): string {
  const modelOrder = Array.from(new Set(report.results.map((result) => result.model)));
  const taskOrder = Array.from(new Set(report.results.map((result) => result.task.id)));

  const header = ["Task", ...modelOrder];
  const lines: string[] = [];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);

  for (const taskId of taskOrder) {
    const cells = modelOrder.map((model) => {
      const results = report.results.filter((result) => result.task.id === taskId && result.model === model);
      if (results.length === 0) return "-";
      if (results.length === 1) {
        const result = results[0];
        const status = result.pass ? "PASS" : "FAIL";
        return `${status} ${Math.round(result.score)} (${result.iterations} iter)`;
      }

      const passCount = results.filter((result) => result.pass).length;
      const avgScore = Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length);
      return `${passCount}/${results.length} pass avg ${avgScore}`;
    });
    lines.push(`| ${taskId} | ${cells.join(" | ")} |`);
  }

  const overall = modelOrder.map((model) => {
    const runs = report.results.filter((result) => result.model === model);
    if (runs.length === 0) return "-";
    const passRate = Math.round((runs.filter((run) => run.pass).length / runs.length) * 100);
    return `${passRate}% pass`;
  });
  lines.push(`| Overall | ${overall.join(" | ")} |`);

  return lines.join("\n");
}
