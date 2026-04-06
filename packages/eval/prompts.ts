import type { ScoreBreakdown, TaskSpec } from "./types.js";

const API_ONE_LINERS: Record<string, string> = {
  // Primitives
  box: "box(width, depth, height) -> constructor: returns centered box",
  cylinder: "cylinder(height, radius) -> constructor: returns Z-aligned cylinder",
  sphere: "sphere(radius, segments?) -> constructor: returns centered sphere",
  roundedBox: "roundedBox(w, d, h, radius, segments?) -> constructor: returns all edges rounded",
  roundedRect: "roundedRect(w, d, radius) -> sketch: returns 2D rounded rectangle",
  sweep: "sweep(sketch, path) -> constructor: returns swept solid",
  loft: "loft(sketch1, sketch2, ...) -> constructor: returns lofted solid",

  // Booleans
  subtract: "solid.subtract(other) -> method: returns new solid (oversize cutters by 1-2mm)",
  union: "solid.union(other) -> method: returns new solid",
  intersect: "solid.intersect(other) -> method: returns new solid",
  unionAll: "solid.unionAll(...parts) -> method: returns new solid",
  subtractAll: "solid.subtractAll(...tools) -> method: returns new solid",
  intersectAll: "solid.intersectAll(...parts) -> method: returns new solid",

  // Transforms
  translate: "solid.translate(x, y, z) -> method: returns new moved solid",
  translateTo: "solid.translateTo(plane, offsets?) -> method: moves bbox center to plane",
  rotate: "solid.rotate(x, y, z) -> method: returns new rotated solid (degrees)",
  scale: "solid.scale(x, y?, z?) -> method: returns new scaled solid",
  mirror: "solid.mirror(normal) -> method: returns new mirrored solid",
  mirrorUnion: "solid.mirrorUnion(normal) -> method: returns union of solid and its mirror",
  quarterUnion: "solid.quarterUnion(n1, n2) -> method: mirrorUnion across two planes",

  // Patterns
  linearPattern: "solid.linearPattern(count, stepX, stepY, stepZ) -> method: returns unified solid",
  linearPatternAssembly: "solid.linearPatternAssembly(count, step, namePrefix?) -> method: returns Assembly",
  circularPattern: "solid.circularPattern(count, axis, totalAngleDeg, center?) -> method: returns unified solid",
  circularPatternAssembly: "solid.circularPatternAssembly(count, axis, totalAngleDeg, center?, namePrefix?) -> method: returns Assembly",

  // Ref Geometry
  plane: "plane(origin, normal) -> returns PlaneLike",
  axis: "axis(origin, direction) -> returns Axis",
  datum: "datum(point) -> returns point-based reference",

  // Edge Treatment & Finishing
  shell: "solid.shell(thickness) -> method: returns new hollowed solid",
  draft: "solid.draft(angleDeg) -> method: returns new tapered solid ( mold release )",
  fillet: "solid.fillet(subdivisions?) -> method: rounds all edges",
  chamfer: "solid.chamfer(subdivisions?) -> method: bevels all edges",
  smooth: "solid.smooth(subdivisions?, minSharpAngle?) -> method: smooths geometry",
  color: "solid.color(\"#hex\") -> method: returns new colored solid",
  named: "solid.named(\"partName\") -> method: sets metadata name",

  // Parameters & Helpers
  param: "param(\"name\", default, min, max) -> slider parameter",
  mm: "mm(value) -> helper for explicit units (optional)",
  toolBody: "toolBody(solid) -> returns construction geometry (wont be exported to STL)",

  // Sketching
  sketch: "Sketch.begin().moveTo(x,y).lineTo(x,y).close() -> 2D profile",
  rect: "rect(w, d) -> sketch: returns centered rectangle",
  circle: "circle(radius) -> sketch: returns centered circle",
  slot: "slot(length, radius) -> sketch: returns slot",
  lShape: "lShape(w, d, thickness) -> sketch: returns L-profile",
  channel: "channel(w, d, wall) -> sketch: returns U-profile",
  tShape: "tShape(w, d, thickness) -> sketch: returns T-profile",
  extrude: "sketch.extrude(height) -> returns new solid",
  extrudeAlong: "sketch.extrudeAlong(vector, height) -> returns new solid",

  // Assemblies
  assembly: "assembly(\"name\").add(\"part\", solid, [x,y,z]?) -> multi-part container",
};


export function buildSystemPrompt(task: TaskSpec): string {
  // Include ALL API surface by default for full context
  const apiLines = Object.entries(API_ONE_LINERS)
    .map(([name, desc]) => `- ${name}: ${desc}`)
    .join("\n");
    
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
