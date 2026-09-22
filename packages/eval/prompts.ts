import type { ScoreBreakdown, TaskSpec } from "./types.js";
import { buildCapabilityExamples, buildCapabilityReference } from "@cadlad/api/capabilities.js";


export function buildSystemPrompt(task: TaskSpec): string {
  // Include ALL API surface by default for full context
  const acceptance = acceptanceBullets(task);

  return [
    "You are a 3D CAD modeling assistant. Generate CadLad .forge.ts code.",
    "Coordinate system: Z-up. Ground plane is Z=0. Build upward.",
    "Return contract: return a Solid, Assembly, or { model, camera }.",
    "",
    "Rules:",
    "- Start your response with the code block. Minimal preamble.",
    "- Output the .forge.ts code inside a ```typescript fence.",
    "- You MUST end the script with a `return` statement (e.g., `return model;`).",
    "- Skip internal reasoning or step-by-step planning.",
    "- Do NOT import anything. The API is already in the global scope.",
    "- Do NOT redefine API symbols (box, cylinder, etc).",
    "- Use param() for dimensions.",
    "- Oversize boolean cutters by 1-2mm.",
    "- Use assembly() for multi-color models.",
    "",
    "Common Pitfalls (CRITICAL):",
    "- WRONG: translate(x, y, z, solid) or subtract(a, b).",
    "- RIGHT: solid.translate(x, y, z) and a.subtract(b). Booleans/transforms are METHODS on a Solid.",
    "- TRANSFORMS: translate, rotate, and scale take separate numbers, NOT an array. (e.g. `solid.translate(10, 0, 0)` is RIGHT, `solid.translate([10, 0, 0])` is WRONG).",
    "",
    "Full API Reference (injected globals):",
    buildCapabilityReference(),
    "Representative usage:",
    buildCapabilityExamples(),
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
