import type { TaskSpec } from "./types.js";

const API_HINTS: Record<string, string> = {
  assembly: "assembly(name).add(partName, solid, [x,y,z]) for multi-part models.",
  box: "box(width, depth, height).",
  chamfer: "solid.chamfer(subdivisions).",
  channel: "Sketch.channel(width, depth, web).",
  circle: "Sketch.circle(radius).",
  constraint: "constraint(\"type\", config) for scene-level constraints.",
  cylinder: "cylinder(height, radius).",
  draft: "solid.draft(angleDeg) for taper.",
  extrude: "sketch.extrude(height).",
  extrudeAlong: "sketch.extrudeAlong([x,y,z], height).",
  fillet: "solid.fillet(subdivisions).",
  intersect: "solid.intersect(other).",
  loft: "loft(profiles, heights).",
  lShape: "Sketch.lShape(totalW, totalH, legW, legH).",
  mirror: "solid.mirror(normal, offset).",
  param: "param(name, defaultValue, { min, max, step, unit }).",
  rect: "Sketch.rect(width, height).",
  revolve: "sketch.revolve(segments).",
  rotate: "solid.rotate(xDeg, yDeg, zDeg).",
  roundedBox: "roundedBox(width, depth, height, radius).",
  roundedRect: "roundedRect(width, depth, radius, height).",
  scale: "solid.scale(x, y, z).",
  shell: "solid.shell(thickness).",
  sketch: "Sketch.begin().<shape>().close().",
  slot: "Sketch.slot(length, width).",
  smooth: "solid.smooth(subdivisions, minSharpAngle).",
  sphere: "sphere(radius).",
  subtract: "solid.subtract(cutter), oversizing cutters by 1-2mm.",
  sweep: "sweep(profilePoints, pathPoints) or sketch.sweep(path).",
  taperedBox: "taperedBox(height, w1, d1, w2, d2).",
  translate: "solid.translate(x, y, z).",
  tShape: "Sketch.tShape(stemW, stemH, capW, capH).",
  union: "solid.union(other).",
};

export function buildSystemPrompt(task: TaskSpec): string {
  const apiReference = task.api_surface
    .map((name) => `- ${name}: ${API_HINTS[name] ?? "Use CadLad API docs for this primitive."}`)
    .join("\n");

  return [
    "You are a 3D CAD modeling assistant. Generate CadLad .forge.ts code.",
    "",
    "COORDINATE SYSTEM: Z-up. Ground plane is Z=0. Build upward.",
    "RETURN: A single .forge.ts file that returns a Solid, Assembly, or { model, camera }.",
    "",
    "API REFERENCE (subset):",
    apiReference,
    "",
    "RULES:",
    "- Use param() for dimensions that should be adjustable",
    "- Always oversize boolean cutters by 1-2mm",
    "- Use assembly() when parts need different colors",
    "- Return the model — don't just define it",
    "",
    "Output ONLY the .forge.ts code in a ```typescript fence.",
  ].join("\n");
}

export function buildUserPrompt(task: TaskSpec): string {
  const acceptanceLines = Object.entries(task.acceptance).map(([key, value]) => `- ${key}: ${formatValue(value)}`);
  const imageNotes = task.reference_images && task.reference_images.length > 0
    ? `\nREFERENCE IMAGES:\n${task.reference_images.map((path) => `- ${path}`).join("\n")}`
    : "";

  return [
    `TASK ID: ${task.id}`,
    "",
    "TASK:",
    task.description.trim(),
    "",
    "ACCEPTANCE CRITERIA:",
    ...acceptanceLines,
    imageNotes,
  ].join("\n");
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatValue(item)).join(", ")}]`;
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
