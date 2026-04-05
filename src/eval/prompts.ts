import type { ScoreBreakdown, TaskSpec } from "./types.js";

const API_ONE_LINERS: Record<string, string> = {
  box: "box(width, depth, height) → centered box",
  cylinder: "cylinder(height, radius) → Z-aligned cylinder",
  sphere: "sphere(radius, segments?) → centered sphere",
  roundedBox: "roundedBox(w, d, h, radius, segments?) → all edges rounded",
  subtract: ".subtract(other) → boolean cut (oversize cutters by 1-2mm)",
  union: ".union(other) → boolean merge",
  translate: ".translate(x, y, z) → move",
  rotate: ".rotate([x, y, z]) → rotate degrees",
  color: ".color(\"#hex\") → set color",
  param: "param(\"name\", default, min, max) → slider parameter",
  sketch: "Sketch.begin().moveTo(x,y)...close() → 2D profile",
  extrude: "sketch.extrude(height) → push along Z",
  extrudeAlong: "sketch.extrudeAlong([x,y,z], height) → push along direction",
  lShape: "lShape(...) → sketch helper",
  slot: "slot(...) → sketch helper",
  channel: "channel(...) → sketch helper",
  tShape: "tShape(...) → sketch helper",
  assembly: "assembly(\"name\").add(\"part\", solid, [x,y,z])",
  shell: ".shell(thickness) → hollow out",
  draft: ".draft(angleDeg) → taper walls",
  fillet: ".fillet(subdivisions) → round edges",
  constraint: "constraint(\"type\", config)",
};

export function buildSystemPrompt(task: TaskSpec): string {
  const apiLines = task.api_surface
    .map((entry) => `- ${entry}: ${API_ONE_LINERS[entry] ?? `${entry}(...) → use CadLad API`}`)
    .join("\n");
  const acceptance = acceptanceBullets(task);

  return [
    "You are a 3D CAD modeling assistant. Generate CadLad .forge.ts code.",
    "Coordinate system: Z-up. Ground plane is Z=0. Build upward.",
    "Return contract: return a Solid, Assembly, or { model, camera }.",
    "",
    "API reference subset:",
    apiLines,
    "",
    "Task description:",
    task.description.trim(),
    "",
    "Acceptance criteria:",
    acceptance,
    "",
    "Rules:",
    "- Use param() for dimensions.",
    "- Oversize boolean cutters by 1-2mm.",
    "- Use assembly() for multi-color models.",
    "- Return the model.",
    "",
    "Output ONLY the .forge.ts code in a ```typescript fence.",
  ].join("\n");
}

export function buildRetryPrompt(
  task: TaskSpec,
  prevSource: string,
  errors: string[],
  score: ScoreBreakdown,
): string {
  const issues = errors.length > 0 ? errors.map((error) => `- ${error}`).join("\n") : "- No runtime errors reported.";

  return [
    "Your previous CadLad .forge.ts response did not satisfy the task.",
    "Fix the model and produce a corrected version.",
    "",
    `Task: ${task.description.trim()}`,
    "",
    "Acceptance criteria:",
    acceptanceBullets(task),
    "",
    "What went wrong:",
    issues,
    `- Scores: total=${score.total.toFixed(2)}, geometry=${score.geometry.toFixed(2)}, constraints=${score.constraints.toFixed(2)}, api=${score.api.toFixed(2)}, judge=${score.judge.toFixed(2)}`,
    "",
    "Previous code:",
    "```typescript",
    prevSource.trim(),
    "```",
    "",
    "Return ONLY corrected .forge.ts code in a ```typescript fence.",
  ].join("\n");
}

export function buildUserPrompt(task: TaskSpec): string {
  return [
    `TASK ID: ${task.id}`,
    "",
    "TASK:",
    task.description.trim(),
    "",
    "ACCEPTANCE CRITERIA:",
    acceptanceBullets(task),
  ].join("\n");
}

function acceptanceBullets(task: TaskSpec): string {
  const entries = Object.entries(task.acceptance);
  if (entries.length === 0) {
    return "- none specified";
  }
  return entries.map(([key, value]) => `- ${key}: ${formatValue(value)}`).join("\n");
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => formatValue(entry)).join(", ")}]`;
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}


export function buildRetryPrompt(args: {
  task: TaskSpec;
  previousCode: string;
  errors: string[];
  score: { total: number; geometry: number; constraints: number; api: number; visual: number; feedback: string[] };
  iteration: number;
}): string {
  const errorLines = args.errors.length > 0
    ? args.errors.map((err) => `- ${err}`).join("\n")
    : "- (none)";
  const feedbackLines = args.score.feedback.length > 0
    ? args.score.feedback.map((item) => `- ${item}`).join("\n")
    : "- (none)";

  return [
    `Retry iteration ${args.iteration} for task ${args.task.id}.`,
    "Fix the generated model based on evaluation feedback.",
    "",
    `Current score: ${args.score.total.toFixed(2)} (geometry=${args.score.geometry.toFixed(2)}, constraints=${args.score.constraints.toFixed(2)}, api=${args.score.api.toFixed(2)}, visual=${args.score.visual.toFixed(2)}).`,
    "",
    "Errors:",
    errorLines,
    "",
    "Scoring feedback:",
    feedbackLines,
    "",
    "Previous code:",
    "```typescript",
    args.previousCode.trim(),
    "```",
    "",
    "Return ONLY updated .forge.ts code in a ```typescript fence.",
  ].join("\n");
}
