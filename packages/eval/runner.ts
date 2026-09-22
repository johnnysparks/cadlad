import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { evaluateModel } from "@cadlad/api/runtime.js";
import { initManifold } from "@cadlad/kernel/manifold-backend.js";
import { applyJudgeScore, describeScoreFailures, scoreEval } from "./scorer.js";
import { buildSystemPrompt, buildUserPrompt, buildRetryPrompt } from "./prompts.js";
import { createModelAdapter, extractCode } from "./model-adapter.js";
import { judgeModel } from "./judge.js";
import { parseTaskSpec, type EvalEvent, type ModelConfig, type TaskSpec } from "./types.js";
import { RenderSession, DEFAULT_VIEWS } from "./renderer.js";
import { scoreImageSimilarity } from "./image-similarity.js";

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
  screenshot_paths: string[];
  feedback?: string;
  image_similarity?: number;
}

export function loadTaskFile(path: string): TaskSpec {
  const raw = readFileSync(resolve(path), "utf-8");
  return parseTaskSpec(raw);
}

export async function runEval(task: TaskSpec, config: ModelConfig, opts?: {
  judgeConfig?: ModelConfig;
  renderSession?: RenderSession;
}): Promise<EvalRunResult> {
  const run_id = randomUUID();
  const startedAt = Date.now();
  const ts = new Date(startedAt).toISOString().replace(/[:.]/g, "-");
  const log_path = resolve("infra/eval/eval-logs", task.id, `${ts}.ndjson`);
  mkdirSync(resolve("infra/eval/eval-logs", task.id), { recursive: true });

  let iteration = 0;
  let totalTokens = 0;
  let prompt = `${buildSystemPrompt(task)}\n\n${buildUserPrompt(task)}`;
  let code = "";
  let finalScore = 0;
  let finalReason: string | undefined;
  let screenshotPaths: string[] = [];
  let finalScreenshots: string[] = [];
  let finalJudge: number | undefined;
  let finalFeedback: string | undefined;
  let finalImageSimilarity: number | undefined;
  let retryImages: Uint8Array[] | undefined;
  let retryFeedback: string[] = [];

  logEvent(log_path, {
    ts: Date.now(),
    run_id,
    task_id: task.id,
    event: "run.started",
    data: { model: config.model, threshold: task.pass_threshold ?? 70 },
  });

  const adapter = createModelAdapter(config);
  const referenceImages = task.reference_images && task.reference_images.length > 0 && adapter.supportsVision
    ? task.reference_images.map((path) => readFileSync(resolve(path)))
    : undefined;

  while (true) {
    iteration += 1;
    // These values describe only the current candidate. Resetting them here
    // prevents a prior iteration's render or verdict from being reused.
    screenshotPaths = [];
    finalScreenshots = [];
    finalJudge = undefined;
    finalFeedback = undefined;
    finalImageSimilarity = undefined;

    const images = retryImages ?? referenceImages;
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

    const source_path = resolve("infra/eval/eval-scratch", task.id, `${run_id}.forge.ts`);
    mkdirSync(resolve("infra/eval/eval-scratch", task.id), { recursive: true });
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

    const iterationFeedback: string[] = [...retryFeedback];
    const sourceHash = hashSource(code);

    if (result.errors.length === 0 && opts?.renderSession) {
      try {
        console.log(`[eval] Rendering screenshots for iteration ${iteration}...`);
        const snapDir = resolve(
          "infra/eval/eval-scratch",
          task.id,
          run_id,
          `iteration-${iteration}-${sourceHash}`,
        );
        const paths = await opts.renderSession.renderCode(
          code,
          snapDir,
          `${task.id}-iteration-${iteration}-${sourceHash}`,
          DEFAULT_VIEWS,
        );
        console.log(`[eval] Screenshots rendered (${paths.length}).`);
        screenshotPaths = paths;
        finalScreenshots = [...paths];
        iterationFeedback.push(
          `Candidate render images are available for views: ${paths.map((path) => basename(path)).join(", ")}.`,
        );
        if (paths.length > 0) {
          logEvent(log_path, {
            ts: Date.now(),
            run_id,
            task_id: task.id,
            event: "eval.screenshots",
            data: { iteration, paths, source_hash: sourceHash },
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // A failed render leaves no candidate artifacts for this iteration.
        screenshotPaths = [];
        finalScreenshots = [];
        iterationFeedback.push(`Candidate render unavailable: ${message}`);
        console.warn(`[eval] Screenshot render failed: ${message}`);
      }
    }

    let score = scoreEval(task, result.evaluation, code);
    let similarityScore: number | undefined;
    for (const failure of describeScoreFailures(task, result.evaluation, code)) {
      iterationFeedback.push(`Acceptance feedback: ${failure}.`);
    }

    // Fast perceptual similarity is feedback, not a replacement for the
    // vision judge. It is useful when the camera is aligned to a reference.
    if (screenshotPaths.length > 0 && task.reference_images && task.reference_images.length > 0) {
      try {
        const refPaths = task.reference_images.map((path) => resolve(path));
        const similarity = await scoreImageSimilarity(refPaths, screenshotPaths);
        similarityScore = similarity.score;
        finalImageSimilarity = similarity.score;
        iterationFeedback.push(`Reference image similarity: ${similarity.score.toFixed(1)}/100.`);
        logEvent(log_path, {
          ts: Date.now(),
          run_id,
          task_id: task.id,
          event: "eval.image_similarity",
          data: {
            iteration,
            score: similarity.score,
            pairs: similarity.pairs.length,
            source_hash: sourceHash,
          },
        });
      } catch {
        iterationFeedback.push("Reference image similarity was unavailable.");
      }
    }

    const threshold = task.pass_threshold ?? 70;
    if (opts?.judgeConfig) {
      let verdict: Awaited<ReturnType<typeof judgeModel>> | undefined;
      let unavailableReason: string | undefined;
      if (screenshotPaths.length === 0) {
        unavailableReason = "No current-iteration candidate renders are available.";
      } else {
        const judgeAdapter = createModelAdapter(opts.judgeConfig);
        if (!judgeAdapter.supportsVision) {
          unavailableReason = `Judge model ${opts.judgeConfig.model} does not support vision.`;
        } else {
          verdict = await judgeModel({
            task,
            screenshotPaths,
            model: judgeAdapter,
            source: code,
          });
        }
      }

      if (verdict) {
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

        finalFeedback = verdict.feedback;
        iterationFeedback.push(`Judge feedback: ${verdict.feedback}`);
        finalJudge = verdict.normalized;
        score = applyJudgeScore(score, verdict.normalized, {
          pass: verdict.pass,
          threshold,
        });
      } else {
        finalFeedback = unavailableReason;
        iterationFeedback.push(`Judge unavailable: ${unavailableReason}`);
        finalJudge = 0;
        score = applyJudgeScore(score, 0, { pass: false, threshold });
        logEvent(log_path, {
          ts: Date.now(),
          run_id,
          task_id: task.id,
          event: "judge.unavailable",
          data: { iteration, reason: unavailableReason },
        });
      }
    }

    finalScore = score.total;
    logEvent(log_path, {
      ts: Date.now(),
      run_id,
      task_id: task.id,
      event: "score.computed",
      data: { iteration, threshold, image_similarity: similarityScore, ...score },
    });

    const maxIterations = task.max_iterations ?? 1;
    if (score.pass && result.errors.length === 0) {
      logEvent(log_path, {
        ts: Date.now(),
        run_id,
        task_id: task.id,
        event: "decide.action",
        data: { iteration, action: "pass", threshold },
      });
      logEvent(log_path, {
        ts: Date.now(),
        run_id,
        task_id: task.id,
        event: "run.completed",
        data: {
          pass: true,
          iterations: iteration,
          total_tokens: totalTokens,
          duration_ms: Date.now() - startedAt,
          score: score.total,
          threshold,
          screenshot_paths: finalScreenshots,
          feedback: finalFeedback,
        },
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
        screenshot_paths: finalScreenshots,
        feedback: finalFeedback,
        image_similarity: finalImageSimilarity,
      };
    }

    if ((!score.pass || result.errors.length > 0) && iteration < maxIterations) {
      retryFeedback = iterationFeedback;
      retryImages = adapter.supportsVision
        ? loadRetryImages(referenceImages, screenshotPaths)
        : undefined;
      prompt = buildRetryPrompt(task, code, result.errors, score, retryFeedback);
      logEvent(log_path, {
        ts: Date.now(),
        run_id,
        task_id: task.id,
        event: "build.retry",
        data: {
          iteration,
          next_iteration: iteration + 1,
          error_count: result.errors.length,
          score: score.total,
          threshold,
          feedback: retryFeedback,
          candidate_images: screenshotPaths.length,
        },
      });
      continue;
    }

    finalReason = result.errors[0]
      ?? finalFeedback
      ?? `score ${finalScore.toFixed(2)} is below task threshold ${threshold}`;
    logEvent(log_path, {
      ts: Date.now(),
      run_id,
      task_id: task.id,
      event: "decide.action",
      data: { iteration, action: "fail", reason: finalReason, threshold, score: finalScore },
    });
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
        threshold,
        reason: finalReason,
        screenshot_paths: finalScreenshots,
        feedback: finalFeedback,
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
      screenshot_paths: finalScreenshots,
      feedback: finalFeedback,
      image_similarity: finalImageSimilarity,
    };
  }
}

function hashSource(source: string): string {
  return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

function loadRetryImages(referenceImages: Uint8Array[] | undefined, screenshotPaths: string[]): Uint8Array[] | undefined {
  if (screenshotPaths.length === 0) return referenceImages;
  try {
    return [
      ...(referenceImages ?? []),
      ...screenshotPaths.map((path) => readFileSync(path)),
    ];
  } catch {
    return referenceImages;
  }
}

function logEvent(logPath: string, event: EvalEvent): void {
  mkdirSync(resolve(logPath, ".."), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(event)}\n`, "utf-8");
}
