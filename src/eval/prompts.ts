import type { ScoreBreakdown, TaskSpec } from "./types.js";

const API_ONE_LINERS: Record<string, string> = {
  box: "box(width, depth, height) -> constructor: returns centered box",
  cylinder: "cylinder(height, radius) -> constructor: returns Z-aligned cylinder",
  sphere: "sphere(radius, segments?) -> constructor: returns centered sphere",
  roundedBox: "roundedBox(w, d, h, radius, segments?) -> constructor: returns all edges rounded",
  subtract: "solid.subtract(other) -> method: returns a new solid (oversize cutters by 1-2mm)",
  union: "solid.union(other) -> method: returns a new solid",
  translate: "solid.translate(x, y, z) -> method: returns a new moved solid",
  rotate: "solid.rotate(x, y, z) -> method: returns a new rotated solid",
  color: "solid.color(\"#hex\") -> method: returns a new colored solid",
  param: "param(\"name\", default, min, max) -> slider parameter",
  sketch: "Sketch.begin().moveTo(x,y)...close() -> 2D profile",
  extrude: "sketch.extrude(height) -> returns a new solid",
  extrudeAlong: "sketch.extrudeAlong([x,y,z], height) -> returns a new solid",
  lShape: "lShape(...) -> sketch helper",
  slot: "slot(...) -> sketch helper",
  channel: "channel(...) -> sketch helper",
  tShape: "tShape(...) -> sketch helper",
  assembly: "assembly(\"name\").add(\"part\", solid, [x,y,z])",
  shell: "solid.shell(thickness) -> method: returns a new hollowed solid",
  draft: "solid.draft(angleDeg) -> method: returns a new tapered solid",
  fillet: "solid.fillet(subdivisions) -> method: returns a new rounded solid",
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
    "Rules:",
    "- Do NOT import anything. The API is already in the global scope.",
    "- Do NOT redefine API symbols (box, cylinder, etc).",
    "- Use param() for dimensions.",
    "- Oversize boolean cutters by 1-2mm.",
    "- Use assembly() for multi-color models.",
    "- Return the model.",
    "",
    "Common Pitfalls (CRITICAL):",
    "- WRONG: translate(x, y, z, solid) or subtract(a, b).",
    "- RIGHT: solid.translate(x, y, z) and a.subtract(b). Booleans/transforms are METHODS on a Solid, not standalone functions.",
    "",
    "API reference subset (injected globals):",
    apiLines,
    "",
    "Task description:",
    task.description.trim(),
    "",
    "Acceptance criteria:",
    acceptance,
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
