import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { evaluateModel } from "../api/runtime.js";
import { initManifold } from "../engine/manifold-backend.js";
import { applyJudgeScore, scoreEval } from "./scorer.js";
import { buildSystemPrompt, buildUserPrompt, buildRetryPrompt } from "./prompts.js";
import { createModelAdapter, extractCode } from "./model-adapter.js";
import { judgeModel } from "./judge.js";
import { parseTaskSpec, type EvalEvent, type ModelConfig, type TaskSpec } from "./types.js";

export interface EvalRunResult {
  pass: boolean;
  score: number;
  iterations: number;
  total_tokens: number;
  duration_ms: number;
  reason?: string;
  judge?: number;
  task: TaskSpec;
  run_id: string;
  log_path: string;
  source_path: string;
}

export function loadTaskFile(path: string): TaskSpec {
  const raw = readFileSync(resolve(path), "utf-8");
  return parseTaskSpec(raw);
}

export async function runEval(task: TaskSpec, config: ModelConfig, opts?: {
  judgeConfig?: ModelConfig;
}): Promise<EvalRunResult> {
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
  let screenshotPaths: string[] = [];
  let finalJudge: number | undefined;

  logEvent(log_path, { ts: Date.now(), run_id, task_id: task.id, event: "run.started", data: { model: config.model } });

  const adapter = createModelAdapter(config);

  while (true) {
    iteration += 1;
    const images = task.reference_images && task.reference_images.length > 0 && adapter.supportsVision
      ? task.reference_images.map((p) => readFileSync(resolve(p)))
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
        console.log(`[eval] Capturing screenshots for iteration ${iteration}...`);
        const snapOut = execSync(`node scripts/vibe-snap.mjs ${JSON.stringify(source_path)} --angles 4 --quiet`, {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 10000, // 10s timeout
        });
        console.log(`[eval] Screenshots captured.`);
        const paths = snapOut.split(/\r?\n/).map((line: string) => line.trim()).filter((line: string) => line.endsWith(".png"));
        screenshotPaths = paths;
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

    let score = scoreEval(task, result.evaluation, code);

    if (opts?.judgeConfig && screenshotPaths.length > 0) {
      const judgeAdapter = createModelAdapter(opts.judgeConfig);
      if (judgeAdapter.supportsVision) {
        const verdict = await judgeModel({
          task,
          screenshotPaths,
          model: judgeAdapter,
          source: code,
        });

        const promptTokens = Math.ceil(task.description.length / 4);
        logEvent(log_path, {
          ts: Date.now(),
          run_id,
          task_id: task.id,
          event: "judge.prompt_sent",
          data: { iteration, prompt_tokens: promptTokens, image_count: Math.min(screenshotPaths.length, 4) },
        });

        logEvent(log_path, {
          ts: Date.now(),
          run_id,
          task_id: task.id,
          event: "judge.verdict",
          data: { iteration, ...verdict },
        });

        score = applyJudgeScore(score, verdict.normalized);
        finalJudge = verdict.normalized;
      }
    }

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
        judge: finalJudge,
      };
    }

    if (score.total < threshold && iteration < maxIterations) {
      prompt = buildRetryPrompt(task, code, result.errors, score);
      logEvent(log_path, {
        ts: Date.now(),
        run_id,
        task_id: task.id,
        event: "build.retry",
        data: { iteration, next_iteration: iteration + 1, error_count: result.errors.length, score: score.total },
      });
      continue;
    }

    finalReason = result.errors[0] ?? "max iterations reached";
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
      judge: finalJudge,
    };
  }
}

function logEvent(logPath: string, event: EvalEvent): void {
  mkdirSync(resolve(logPath, ".."), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(event)}\n`, "utf-8");
}
