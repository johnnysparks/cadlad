import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { initManifold } from "../engine/manifold-backend.js";
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

export interface EvalRunResult {
  runId: string;
  task: TaskSpec;
  pass: boolean;
  score: ScoreBreakdown;
  sourcePath: string;
  logPath: string;
  screenshotPaths: string[];
}

export async function runEval(options: EvalRunnerOptions): Promise<EvalRunResult> {
  const task = loadTaskSpec(options.taskPath);
  const model = parseModelConfig(options.modelRef);
  const runId = randomUUID();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const scratchDir = resolve("eval-scratch", task.id);
  const logDir = resolve("eval-logs", task.id);
  mkdirSync(scratchDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });

  const sourcePath = join(scratchDir, `${runId}.forge.ts`);
  const screenshotSourcePath = join(scratchDir, `${runId}.forge.js`);
  const logPath = join(logDir, `${timestamp}.ndjson`);

  let totalTokens = 0;
  const runStart = Date.now();

  appendEvent(logPath, {
    ts: Date.now(),
    run_id: runId,
    task_id: task.id,
    event: "run.started",
    data: {
      model: options.modelRef,
      config: {
        max_iterations: task.max_iterations ?? 1,
        pass_threshold: options.passThreshold,
      },
    },
  });

  const systemPrompt = buildSystemPrompt(task);
  const userPrompt = buildUserPrompt(task);

  appendEvent(logPath, {
    ts: Date.now(),
    run_id: runId,
    task_id: task.id,
    event: "plan.prompt_sent",
    data: {
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
      response_tokens: generation.usage.completion_tokens,
      prompt_tokens: generation.usage.prompt_tokens,
      total_tokens: generation.usage.total_tokens,
    },
  });

  const source = extractTypeScriptFence(generation.text);
  writeFileSync(sourcePath, source, "utf-8");
  writeFileSync(screenshotSourcePath, source, "utf-8");

  appendEvent(logPath, {
    ts: Date.now(),
    run_id: runId,
    task_id: task.id,
    event: "build.code_generated",
    data: {
      source_hash: sha256(source),
      line_count: source.split(/\r?\n/).length,
      iteration: 1,
      path: sourcePath,
    },
  });

  await initManifold();
  const modelResult = await evaluateModel(source);

  appendEvent(logPath, {
    ts: Date.now(),
    run_id: runId,
    task_id: task.id,
    event: "eval.completed",
    data: {
      success: modelResult.errors.length === 0,
      errors: modelResult.errors,
      warnings: modelResult.evaluation.summary.warningCount,
      stats: modelResult.evaluation.stats,
    },
  });

  const screenshotPaths = await tryCaptureScreenshots(screenshotSourcePath);
  if (screenshotPaths.length > 0) {
    appendEvent(logPath, {
      ts: Date.now(),
      run_id: runId,
      task_id: task.id,
      event: "eval.screenshots",
      data: {
        paths: screenshotPaths,
        angles: ["iso", "front", "right", "top"],
      },
    });
  }

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

  appendEvent(logPath, {
    ts: Date.now(),
    run_id: runId,
    task_id: task.id,
    event: "decide.action",
    data: {
      action: pass ? "pass" : "fail",
      reason: pass ? "score meets threshold" : "score below threshold",
    },
  });

  appendEvent(logPath, {
    ts: Date.now(),
    run_id: runId,
    task_id: task.id,
    event: "run.completed",
    data: {
      final_score: score.total,
      iterations: 1,
      total_tokens: totalTokens,
      duration_ms: Date.now() - runStart,
      pass,
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
    },
  };

  appendLine(logPath, summary);

  return {
    runId,
    task,
    pass,
    score,
    sourcePath,
    logPath,
    screenshotPaths,
  };
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

  const flushMultiline = () => {
    if (multilineKey) {
      root[multilineKey] = multilineLines.join("\n").trimEnd();
      multilineKey = undefined;
      multilineLines.length = 0;
    }
  };

  for (const rawLine of input.split(/\r?\n/)) {
    const commentTrimmed = rawLine.replace(/\s+#.*$/, "");
    if (!commentTrimmed.trim()) {
      if (multilineKey) {
        multilineLines.push("");
      }
      continue;
    }

    const indent = rawLine.length - rawLine.trimStart().length;
    const line = commentTrimmed.trim();

    if (multilineKey) {
      if (indent > multilineIndent) {
        multilineLines.push(rawLine.slice(multilineIndent + 2));
        continue;
      }
      flushMultiline();
    }

    const sectionMatch = line.match(/^([A-Za-z0-9_]+):\s*$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      currentIndent = indent;
      root[currentSection] = {};
      continue;
    }

    const entryMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!entryMatch) {
      throw new Error(`Unsupported YAML line: ${rawLine}`);
    }

    const [, key, rawValue] = entryMatch;

    if (rawValue === "|") {
      multilineKey = key;
      multilineIndent = indent;
      continue;
    }

    const value = parseYamlScalar(rawValue);

    if (currentSection && indent > currentIndent) {
      const section = root[currentSection] as Record<string, unknown>;
      section[key] = value;
      continue;
    }

    currentSection = undefined;
    root[key] = value;
  }

  flushMultiline();

  return root;
}

function parseYamlScalar(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inside = trimmed.slice(1, -1).trim();
    if (!inside) {
      return [];
    }
    return inside.split(",").map((item) => parseYamlScalar(item.trim()));
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const inside = trimmed.slice(1, -1).trim();
    const object: Record<string, unknown> = {};
    if (!inside) {
      return object;
    }
    for (const pair of inside.split(",")) {
      const [rawKey, rawVal] = pair.split(":");
      object[rawKey.trim()] = parseYamlScalar((rawVal ?? "").trim());
    }
    return object;
  }

  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  return trimmed;
}
