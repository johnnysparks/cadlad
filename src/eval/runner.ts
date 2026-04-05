import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { evaluateModel } from "../api/runtime.js";
import { initManifold } from "../engine/manifold-backend.js";
import { createModelAdapter, extractCode } from "./model-adapter.js";
import { buildRetryPrompt, buildSystemPrompt, buildUserPrompt } from "./prompts.js";
import { scoreEval } from "./scorer.js";
import { parseTaskSpec, type EvalEvent, type ModelConfig, type TaskSpec } from "./types.js";

export interface EvalRunResult {
  pass: boolean;
  score: number;
  iterations: number;
  total_tokens: number;
  duration_ms: number;
  reason?: string;
  task: TaskSpec;
  run_id: string;
  log_path: string;
  source_path: string;
}

export function loadTaskFile(path: string): TaskSpec {
  const raw = readFileSync(resolve(path), "utf-8");
  return parseTaskSpec(raw);
}

export async function runEval(task: TaskSpec, config: ModelConfig): Promise<EvalRunResult> {
  const run_id = randomUUID();
  const startedAt = Date.now();
  const ts = new Date(startedAt).toISOString().replace(/[:.]/g, "-");
  const log_path = resolve("eval-logs", task.id, `${ts}.ndjson`);
  mkdirSync(resolve("eval-logs", task.id), { recursive: true });

  let iteration = 0;
  let totalTokens = 0;
  let prompt = `${buildSystemPrompt(task)}\n\n${buildUserPrompt(task)}`;
  let code = "";
  let finalScore = 0;
  let finalReason: string | undefined;

  logEvent(log_path, { ts: Date.now(), run_id, task_id: task.id, event: "run.started", data: { model: config.model } });

  const adapter = createModelAdapter(config);

  while (true) {
    iteration += 1;
    const images = task.reference_images && task.reference_images.length > 0 && adapter.supportsVision
      ? task.reference_images.map((path) => readFileSync(resolve(path)))
      : undefined;

    const response = await adapter.generate({
      messages: [{ role: "system", content: prompt }],
      images,
    });
    totalTokens += response.usage.total_tokens;

    code = extractCode(response.text);
    logEvent(log_path, {
      ts: Date.now(),
      run_id,
      task_id: task.id,
      event: "build.code_generated",
      data: { iteration, chars: code.length, tokens: response.usage.total_tokens },
    });

    const source_path = resolve("eval-scratch", task.id, `${run_id}.forge.ts`);
    mkdirSync(resolve("eval-scratch", task.id), { recursive: true });
    writeFileSync(source_path, code, "utf-8");

    await initManifold();
    const result = await evaluateModel(code);

    logEvent(log_path, {
      ts: Date.now(),
      run_id,
      task_id: task.id,
      event: "eval.completed",
      data: {
        iteration,
        success: result.errors.length === 0,
        error_count: result.errors.length,
        warning_count: result.evaluation.summary.warningCount,
      },
    });

    if (result.errors.length === 0) {
      try {
        const snapOut = execSync(`node scripts/vibe-snap.mjs ${JSON.stringify(source_path)} --angles 4 --quiet`, {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        const paths = snapOut.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.endsWith(".png"));
        if (paths.length > 0) {
          logEvent(log_path, {
            ts: Date.now(),
            run_id,
            task_id: task.id,
            event: "eval.screenshots",
            data: { iteration, paths },
          });
        }
      } catch {
        // Optional screenshots.
      }
    }

    const score = scoreEval(task, result.evaluation, code);
    finalScore = score.total;

    logEvent(log_path, {
      ts: Date.now(),
      run_id,
      task_id: task.id,
      event: "score.computed",
      data: { iteration, ...score },
    });

    const threshold = task.pass_threshold ?? 70;
    const maxIterations = task.max_iterations ?? 1;

    if (score.total >= threshold && result.errors.length === 0) {
      logEvent(log_path, { ts: Date.now(), run_id, task_id: task.id, event: "decide.action", data: { iteration, action: "pass" } });
      logEvent(log_path, {
        ts: Date.now(),
        run_id,
        task_id: task.id,
        event: "run.completed",
        data: { pass: true, iterations: iteration, total_tokens: totalTokens, duration_ms: Date.now() - startedAt, score: score.total },
      });
      return {
        pass: true,
        score: score.total,
        iterations: iteration,
        total_tokens: totalTokens,
        duration_ms: Date.now() - startedAt,
        task,
        run_id,
        log_path,
        source_path,
      };
    }

    if (score.total < threshold && iteration < maxIterations) {
      prompt = buildRetryPrompt({
        task,
        previousCode: code,
        errors: result.errors,
        score,
        iteration: iteration + 1,
      });
      logEvent(log_path, {
        ts: Date.now(),
        run_id,
        task_id: task.id,
        event: "build.retry",
        data: { iteration, next_iteration: iteration + 1, error_count: result.errors.length, score: score.total },
      });
      continue;
    }

    finalReason = score.feedback[0] ?? result.errors[0] ?? "max iterations reached";
    logEvent(log_path, { ts: Date.now(), run_id, task_id: task.id, event: "decide.action", data: { iteration, action: "fail", reason: finalReason } });
    logEvent(log_path, {
      ts: Date.now(),
      run_id,
      task_id: task.id,
      event: "run.completed",
      data: {
        pass: false,
        iterations: iteration,
        total_tokens: totalTokens,
        duration_ms: Date.now() - startedAt,
        score: finalScore,
        reason: finalReason,
      },
    });

    return {
      pass: false,
      score: finalScore,
      iterations: iteration,
      total_tokens: totalTokens,
      duration_ms: Date.now() - startedAt,
      reason: finalReason,
      task,
      run_id,
      log_path,
      source_path,
    };
  }
}

function logEvent(logPath: string, event: EvalEvent): void {
  appendFileSync(logPath, `${JSON.stringify(event)}\n`, "utf-8");
}
