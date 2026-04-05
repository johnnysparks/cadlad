import type { EvaluationBundle } from "@cadlad/kernel/types.js";

export type PrimitiveName =
  | "box"
  | "cylinder"
  | "sphere"
  | "roundedRect"
  | "roundedBox"
  | "taperedBox"
  | "sketch"
  | "rect"
  | "circle"
  | "slot"
  | "lShape"
  | "channel"
  | "tShape"
  | "extrude"
  | "extrudeAlong"
  | "revolve"
  | "sweep"
  | "loft"
  | "union"
  | "subtract"
  | "intersect"
  | "shell"
  | "draft"
  | "fillet"
  | "chamfer"
  | "smooth"
  | "translate"
  | "rotate"
  | "scale"
  | "mirror"
  | "assembly"
  | "constraint"
  | "param";

export interface TaskAcceptanceCriteria {
  body_count?: number;
  body_count_min?: number;
  body_count_max?: number;
  volume_min?: number;
  volume_max?: number;
  bbox_min?: [number, number, number];
  bbox_max?: [number, number, number];
  validation_errors?: number;
  validation_warnings_max?: number;
  has_subtraction?: boolean;
  has_slot_or_channel?: boolean;
  has_params?: string[];
  printability?: {
    max_overhang_ratio?: number;
  };
  assembly?: boolean;
  constraint_clearance?: {
    min_mm: number;
    max_mm: number;
  };
}

export interface TaskSpec {
  id: string;
  difficulty: number;
  description: string;
  reference_prompt?: string;
  acceptance: TaskAcceptanceCriteria;
  api_surface: PrimitiveName[];
  reference_images?: string[];
  max_iterations?: number;
  pass_threshold?: number;
}


export interface ScoreBreakdown {
  total: number;
  pass: boolean;
  geometry: number;
  constraints: number;
  api: number;
  judge: number;
  weights: {
    geometry: number;
    constraints: number;
    api: number;
    judge: number;
  };
}

export interface EvalResult {
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
  model: string;
}

export interface ScoringRubric {
  passingScore: number;
  weights: {
    geometry: number;
    constraints: number;
    api: number;
    visual: number;
  };
}

export type ModelProvider = "ollama" | "openai" | "anthropic" | "manual";

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  endpoint?: string;
  apiKeyEnvVar?: string;
  requiresApiKey?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Override vision capability detection. Useful for local models (LM Studio, Ollama) where
   *  multimodal support depends on the specific model loaded, not the provider. */
  supportsVision?: boolean;
}

export type EventType =
  | "run.started"
  | "plan.prompt_sent"
  | "plan.response"
  | "build.code_generated"
  | "eval.completed"
  | "eval.screenshots"
  | "eval.image_similarity"
  | "score.computed"
  | "judge.prompt_sent"
  | "judge.verdict"
  | "decide.action"
  | "build.retry"
  | "run.completed"
  | "error";

export interface EvalEvent {
  ts: number;
  run_id: string;
  task_id: string;
  event: EventType;
  data: Record<string, unknown>;
}

export interface RunSummary {
  ts: number;
  run_id: string;
  task_id: string;
  event: "run.summary";
  data: {
    model: string;
    pass: boolean;
    score: number;
    iterations: number;
    total_tokens: number;
    total_duration_ms: number;
    eval_bundle: EvaluationBundle;
    failure_reason?: string;
  };
}

export interface RunLog {
  runId: string;
  taskId: string;
  model: string;
  events: EvalEvent[];
  summary?: RunSummary;
}


export function parseTaskSpec(raw: string): TaskSpec {
  const parsed = parseSimpleYaml(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Task spec must parse to an object.");
  }

  const record = parsed as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) throw new Error("Task spec missing id");
  if (typeof record.difficulty !== "number") throw new Error("Task spec missing difficulty");
  if (typeof record.description !== "string") throw new Error("Task spec missing description");
  if (!record.acceptance || typeof record.acceptance !== "object") throw new Error("Task spec missing acceptance");
  if (!Array.isArray(record.api_surface)) throw new Error("Task spec missing api_surface");

  return {
    id: record.id,
    difficulty: record.difficulty,
    description: record.description,
    reference_prompt: typeof record.reference_prompt === "string" ? record.reference_prompt : undefined,
    acceptance: record.acceptance as TaskAcceptanceCriteria,
    api_surface: record.api_surface as PrimitiveName[],
    reference_images: Array.isArray(record.reference_images) ? (record.reference_images as string[]) : undefined,
    max_iterations: typeof record.max_iterations === "number" ? record.max_iterations : undefined,
    pass_threshold: typeof record.pass_threshold === "number" ? record.pass_threshold : undefined,
  };
}

function parseSimpleYaml(input: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let currentSection: string | undefined;
  let currentIndent = 0;
  const lines = input.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const commentTrimmed = rawLine.replace(/\s+#.*$/, "");
    if (!commentTrimmed.trim()) continue;

    const indent = rawLine.length - rawLine.trimStart().length;
    const line = commentTrimmed.trim();

    const sectionMatch = line.match(/^([A-Za-z0-9_]+):\s*$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      currentIndent = indent;
      root[currentSection] = {};
      continue;
    }

    const entryMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!entryMatch) throw new Error(`Unsupported YAML line: ${rawLine}`);
    const [, key, rawValueRaw] = entryMatch;
    let rawValue = rawValueRaw;

    if (rawValue === "|" || rawValue === ">") {
      const blockLines: string[] = [];
      const blockIndent = indent;
      const foldNewlines = rawValue === ">";
      while (index + 1 < lines.length) {
        const nextRawLine = lines[index + 1];
        const nextCommentTrimmed = nextRawLine.replace(/\s+#.*$/, "");
        const nextIndent = nextRawLine.length - nextRawLine.trimStart().length;
        if (nextCommentTrimmed.trim() && nextIndent <= blockIndent) {
          break;
        }
        index += 1;
        if (!nextCommentTrimmed.trim()) {
          blockLines.push("");
          continue;
        }
        blockLines.push(nextRawLine.slice(Math.min(nextIndent, blockIndent + 2)).trimEnd());
      }
      rawValue = foldNewlines
        ? blockLines.join(" ").replace(/\s+/g, " ").trim()
        : blockLines.join("\n").trim();
    }

    const value = parseYamlScalar(rawValue);

    if (currentSection && indent > currentIndent) {
      (root[currentSection] as Record<string, unknown>)[key] = value;
    } else {
      currentSection = undefined;
      root[key] = value;
    }
  }

  return root;
}

function parseYamlScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inside = trimmed.slice(1, -1).trim();
    if (!inside) return [];
    return inside.split(",").map((item) => parseYamlScalar(item.trim()));
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const inside = trimmed.slice(1, -1).trim();
    const out: Record<string, unknown> = {};
    if (!inside) return out;
    for (const pair of inside.split(",")) {
      const [k, v] = pair.split(":");
      out[k.trim()] = parseYamlScalar((v ?? "").trim());
    }
    return out;
  }
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}
