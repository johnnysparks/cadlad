import type { EvaluationBundle } from "../engine/types.js";

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
  acceptance: TaskAcceptanceCriteria;
  api_surface: PrimitiveName[];
  reference_images?: string[];
  max_iterations?: number;
}

export interface EvalResult {
  pass: boolean;
  score: number;
  geometry: number;
  constraints: number;
  visual: number;
  feedback: string[];
}

export interface ScoringRubric {
  passingScore: number;
  weights: {
    geometry: number;
    constraints: number;
    visual: number;
  };
}

export type ModelProvider = "ollama" | "openai" | "anthropic";

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  endpoint?: string;
  apiKeyEnvVar?: string;
  temperature?: number;
  maxTokens?: number;
}

export type EventType =
  | "run.started"
  | "plan.prompt_sent"
  | "plan.response"
  | "build.code_generated"
  | "eval.completed"
  | "eval.screenshots"
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
