import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { evaluateModel } from "../api/runtime.js";
import { scoreEval } from "./scorer.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.js";
import { generateCode, parseModelConfig } from "./model-adapter.js";
import type { EvalEvent, PrimitiveName, RunSummary, ScoreBreakdown, TaskAcceptanceCriteria, TaskSpec } from "./types.js";

export interface EvalRunnerOptions {
  taskPath: string;
  modelRef: string;
  passThreshold?: number;
}
import { initManifold } from "../engine/manifold-backend.js";
import { createModelAdapter, extractCode } from "./model-adapter.js";
import { buildRetryPrompt, buildSystemPrompt, buildUserPrompt } from "./prompts.js";
import { scoreEval } from "./scorer.js";
import { parseTaskSpec, type EvalEvent, type ModelConfig, type TaskSpec } from "./types.js";

export interface EvalRunResult {
  pass: boolean;
  score: ScoreBreakdown;
  sourcePath: string;
  logPath: string;
  screenshotPaths: string[];
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
  const sourcePath = join(scratchDir, `${runId}.forge.ts`);
  const logPath = join(logDir, `${timestamp}.ndjson`);

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
  const runStart = Date.now();
  const maxIterations = Math.max(1, task.max_iterations ?? 1);
  const passThreshold = options.passThreshold ?? 70;
  const screenshotPaths: string[] = [];
  const retryNotes: string[] = [];

  appendEvent(logPath, {
    ts: Date.now(),
    run_id: runId,
    task_id: task.id,
    event: "run.started",
    data: {
      model: options.modelRef,
      config: {
        max_iterations: maxIterations,
        pass_threshold: passThreshold,
      },
    },
  });

  const systemPrompt = buildSystemPrompt(task);

  await initManifold();
  let latestScore: EvalResult | undefined;
  let latestEvaluation:
    | (ReturnType<typeof evaluateModel> extends Promise<infer TResult> ? TResult : never)
    | undefined;
  let finalPass = false;
  let finalReason = "max iterations reached";
  let completedIterations = 0;

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    completedIterations = iteration;
    const userPrompt = buildIterationPrompt(task, retryNotes, iteration, maxIterations);

    appendEvent(logPath, {
      ts: Date.now(),
      run_id: runId,
      task_id: task.id,
      event: "plan.prompt_sent",
      data: {
        iteration,
        prompt_tokens: estimateTokens(`${systemPrompt}\n\n${userPrompt}`),
        has_reference_images: (task.reference_images?.length ?? 0) > 0,
      },
    });

    const generation = await generateCode(model, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    totalTokens += generation.usage.total_tokens;

    appendEvent(logPath, {
      ts: Date.now(),
      run_id: runId,
      task_id: task.id,
      event: "plan.response",
      data: {
        iteration,
        response_tokens: generation.usage.completion_tokens,
        prompt_tokens: generation.usage.prompt_tokens,
        total_tokens: generation.usage.total_tokens,
      },
    });

    const source = extractTypeScriptFence(generation.text);
    writeFileSync(sourcePath, source, "utf-8");

    appendEvent(logPath, {
      ts: Date.now(),
      run_id: runId,
      task_id: task.id,
      event: "build.code_generated",
      data: {
        source_hash: sha256(source),
        line_count: source.split(/\r?\n/).length,
        iteration,
        path: sourcePath,
      },
    });

    const modelResult = await evaluateModel(source);
    latestEvaluation = modelResult;

    appendEvent(logPath, {
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
        success: modelResult.errors.length === 0,
        errors: modelResult.errors,
        warnings: modelResult.evaluation.summary.warningCount,
        stats: modelResult.evaluation.stats,
      },
    });

  const score = scoreEval(task, modelResult.evaluation, source);

  appendEvent(logPath, {
    ts: Date.now(),
    run_id: runId,
    task_id: task.id,
    event: "score.computed",
    data: {
      total: score.total,
      geometry: score.geometry,
      constraints: score.constraints,
      visual: score.judge,
      api: score.api,
      weights: score.weights,
    },
  });

  const passThreshold = options.passThreshold ?? 70;
  const pass = score.pass && score.total >= passThreshold;
    const iterationScreenshots = await tryCaptureScreenshots(sourcePath);
    screenshotPaths.push(...iterationScreenshots);
    if (iterationScreenshots.length > 0) {
      appendEvent(logPath, {
        ts: Date.now(),
        run_id: runId,
        task_id: task.id,
        event: "eval.screenshots",
        data: {
          iteration,
          paths: iterationScreenshots,
          angles: ["iso", "front", "right", "top"],
        },
      });
    }

    const score = scoreEvaluation({
      task,
      bundle: modelResult.evaluation,
      source,
    });
    latestScore = score;

    appendEvent(logPath, {
      ts: Date.now(),
      run_id: runId,
      task_id: task.id,
      event: "score.computed",
      data: {
        iteration,
        total: score.score,
        geometry: score.geometry,
        constraints: score.constraints,
        visual: score.visual,
        api: score.api,
        feedback: score.feedback,
      },
    });

    const pass = score.pass && score.score >= passThreshold;
    if (pass) {
      finalPass = true;
      finalReason = "score meets threshold";
      appendEvent(logPath, {
        ts: Date.now(),
        run_id: runId,
        task_id: task.id,
        event: "decide.action",
        data: {
          iteration,
          action: "pass",
          reason: finalReason,
        },
      });
      break;
    }

    if (iteration < maxIterations) {
      const feedback = composeRetryFeedback(score.feedback, modelResult.errors, passThreshold, score.score);
      retryNotes.push(feedback);
      finalReason = "score below threshold";
      appendEvent(logPath, {
        ts: Date.now(),
        run_id: runId,
        task_id: task.id,
        event: "decide.action",
        data: {
          iteration,
          action: "retry",
          reason: finalReason,
          score: score.score,
          pass_threshold: passThreshold,
        },
      });
      appendEvent(logPath, {
        ts: Date.now(),
        run_id: runId,
        task_id: task.id,
        event: "build.retry",
        data: {
          iteration: iteration + 1,
          feedback_summary: feedback,
        },
      });
    } else {
      finalReason = "score below threshold";
      appendEvent(logPath, {
        ts: Date.now(),
        run_id: runId,
        task_id: task.id,
        event: "decide.action",
        data: {
          iteration,
          action: "fail",
          reason: finalReason,
          score: score.score,
          pass_threshold: passThreshold,
        },
      });
    }
  }

  if (!latestScore || !latestEvaluation) {
    throw new Error("Eval run did not produce a score.");
  }

  appendEvent(logPath, {
    ts: Date.now(),
    run_id: runId,
    task_id: task.id,
    event: "run.completed",
    data: {
      final_score: score.total,
      iterations: 1,
      final_score: latestScore.score,
      iterations: completedIterations,
      total_tokens: totalTokens,
      duration_ms: Date.now() - runStart,
      pass: finalPass,
    },
  });

  const summary: RunSummary = {
    ts: Date.now(),
    run_id: runId,
    task_id: task.id,
    event: "run.summary",
    data: {
      model: options.modelRef,
      pass,
      score: score.total,
      iterations: 1,
      total_tokens: totalTokens,
      total_duration_ms: Date.now() - runStart,
      eval_bundle: modelResult.evaluation,
      failure_reason: pass ? undefined : "Score below threshold",
      pass: finalPass,
      score: latestScore.score,
      iterations: completedIterations,
      total_tokens: totalTokens,
      total_duration_ms: Date.now() - runStart,
      eval_bundle: latestEvaluation.evaluation,
      failure_reason: finalPass ? undefined : latestScore.feedback[0] ?? finalReason,
    },
  };

  appendLine(logPath, summary);

  return {
    runId,
    task,
    pass: finalPass,
    score: latestScore,
    sourcePath,
    logPath,
    screenshotPaths,
  };
}

function buildIterationPrompt(task: TaskSpec, retryNotes: string[], iteration: number, maxIterations: number): string {
  const basePrompt = buildUserPrompt(task);
  if (retryNotes.length === 0) {
    return basePrompt;
  }

  return [
    basePrompt,
    "",
    `RETRY CONTEXT: attempt ${iteration} of ${maxIterations}.`,
    "Address the issues from previous attempts:",
    ...retryNotes.map((note, index) => `- Attempt ${index + 1}: ${note}`),
    "",
    "Return a complete replacement .forge.ts implementation, not a diff.",
  ].join("\n");
}

function composeRetryFeedback(
  scoreFeedback: string[],
  runtimeErrors: string[],
  passThreshold: number,
  score: number,
): string {
  const reasons = [
    `score ${score.toFixed(2)} below pass threshold ${passThreshold}`,
    ...runtimeErrors.map((error) => `runtime: ${error}`),
    ...scoreFeedback,
  ].slice(0, 6);

  return reasons.join("; ");
}

function loadTaskSpec(taskPath: string): TaskSpec {
  const absolutePath = resolve(taskPath);
  const raw = readFileSync(absolutePath, "utf-8");
  const parsed = parseSimpleYaml(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Task file ${taskPath} did not parse into an object.`);
  }

  return {
    id: asString(parsed.id, "id"),
    difficulty: asNumber(parsed.difficulty, "difficulty"),
    description: asString(parsed.description, "description"),
    acceptance: asAcceptance(parsed.acceptance),
    api_surface: asPrimitiveArray(parsed.api_surface, "api_surface"),
    reference_images: parsed.reference_images ? asStringArray(parsed.reference_images, "reference_images") : undefined,
    max_iterations: parsed.max_iterations === undefined ? undefined : asNumber(parsed.max_iterations, "max_iterations"),
  };
}

function asAcceptance(value: unknown): TaskAcceptanceCriteria {
  if (!value || typeof value !== "object") {
    throw new Error("Task acceptance must be an object.");
  }
  return value as TaskAcceptanceCriteria;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Task field ${field} must be a non-empty string.`);
  }
  return value;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Task field ${field} must be a number.`);
  }
  return value;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Task field ${field} must be an array of strings.`);
  }
  return value;
}

function asPrimitiveArray(value: unknown, field: string): PrimitiveName[] {
  return asStringArray(value, field) as PrimitiveName[];
}

function appendEvent(logPath: string, event: EvalEvent): void {
  appendLine(logPath, event);
}

function appendLine(logPath: string, data: unknown): void {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(data)}\n`, "utf-8");
}

function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

function extractTypeScriptFence(text: string): string {
  const match = text.match(/```(?:typescript|ts)?\s*([\s\S]*?)```/i);
  if (!match) {
    return text.trim();
  }
  return match[1].trim();
}

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

async function tryCaptureScreenshots(sourcePath: string): Promise<string[]> {
  try {
    const output = await runCommand("node", ["scripts/vibe-snap.mjs", sourcePath, "--quiet"], {
      timeoutMs: 120_000,
    });
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line.endsWith(".png"));
  } catch {
    return [];
  }
}

function runCommand(command: string, args: string[], options?: { timeoutMs?: number }): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errorChunks.push(chunk));

    let timeoutHandle: NodeJS.Timeout | undefined;
    if (options?.timeoutMs) {
      timeoutHandle = setTimeout(() => {
        child.kill("SIGTERM");
      }, options.timeoutMs);
    }

    child.on("close", (code) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (code === 0) {
        resolvePromise(Buffer.concat(chunks).toString("utf-8"));
        return;
      }
      const stderr = Buffer.concat(errorChunks).toString("utf-8");
      reject(new Error(stderr || `${command} exited with code ${String(code)}`));
    });

    child.on("error", (error) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      reject(error);
    });
  });
}

function parseSimpleYaml(input: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let currentSection: string | undefined;
  let currentIndent = 0;
  let multilineKey: string | undefined;
  let multilineIndent = 0;
  const multilineLines: string[] = [];

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
