/**
 * Gallery — renders all example models in interactive 3D viewports.
 */

import { Viewport } from "../src/studio/viewport.js";
import { evaluateModel } from "../src/api/runtime.js";

interface Example {
  name: string;
  description: string;
  file: string;
  code: string;
}

const examples: Example[] = [
  {
    name: "Box with Hole",
    description: "The \"hello world\" of CAD — a parametric box with a through-hole.",
    file: "box-with-hole.forge.js",
    code: `// Box with a through-hole — the "hello world" of CAD
const width  = param("Width",  60, { min: 20, max: 200, unit: "mm" });
const depth  = param("Depth",  40, { min: 20, max: 200, unit: "mm" });
const height = param("Height", 20, { min: 5,  max: 100, unit: "mm" });
const holeR  = param("Hole Radius", 8, { min: 2, max: 30, unit: "mm" });

const base = box(width, depth, height).color("#5f87c6");
const hole = cylinder(height + 2, holeR);
const part = base.subtract(hole);

return part;`,
  },
  {
    name: "Parametric Bracket",
    description: "An L-shaped bracket with mounting holes — boolean operations in action.",
    file: "parametric-bracket.forge.js",
    code: `// L-bracket with mounting holes
const thickness = param("Thickness", 4, { min: 2, max: 10, unit: "mm" });
const armLength = param("Arm Length", 50, { min: 20, max: 120, unit: "mm" });
const armWidth  = param("Arm Width", 30, { min: 15, max: 80, unit: "mm" });
const holeD     = param("Hole Diameter", 6, { min: 3, max: 12, unit: "mm" });

// Horizontal arm
const hArm = box(armLength, armWidth, thickness).color("#7c8fa6");

// Vertical arm
const vArm = box(thickness, armWidth, armLength)
  .translate(-(armLength / 2 - thickness / 2), 0, armLength / 2 - thickness / 2)
  .color("#7c8fa6");

// Mounting holes
const hHole = cylinder(thickness + 2, holeD / 2)
  .translate(armLength / 4, 0, 0);

const vHole = cylinder(thickness + 2, holeD / 2)
  .rotate(90, 0, 0)
  .translate(-(armLength / 2 - thickness / 2), 0, armLength / 4);

const bracket = hArm.union(vArm).subtract(hHole).subtract(vHole);

return bracket.named("L-Bracket").color("#89b4fa");`,
  },
  {
    name: "Phone Stand",
    description: "A three-part phone stand — union operations to combine pieces.",
    file: "phone-stand.forge.js",
    code: `// Parametric phone stand
const baseW     = param("Base Width", 80, { min: 50, max: 150, unit: "mm" });
const baseD     = param("Base Depth", 60, { min: 30, max: 100, unit: "mm" });
const baseH     = param("Base Height", 8, { min: 4, max: 15, unit: "mm" });
const backH     = param("Back Height", 70, { min: 40, max: 120, unit: "mm" });
const backT     = param("Back Thickness", 5, { min: 3, max: 10, unit: "mm" });
const lipH      = param("Lip Height", 12, { min: 5, max: 25, unit: "mm" });

// Base platform
const base = box(baseW, baseD, baseH)
  .color("#5f87c6");

// Back support
const back = box(baseW, backT, backH)
  .translate(0, -(baseD / 2 - backT / 2), backH / 2 - baseH / 2)
  .color("#7c9fc6");

// Front lip to hold the phone
const lip = box(baseW, backT, lipH)
  .translate(0, baseD / 2 - backT / 2, lipH / 2 - baseH / 2)
  .color("#89b4fa");

const stand = base.union(back).union(lip);

return stand.named("Phone Stand");`,
  },
  {
    name: "Lamp Post Assembly",
    description: "Multi-part assembly with parametric dimensions — base, pole, and top sphere.",
    file: "assembly-demo.forge.js",
    code: `// Assembly demo — multi-part model with positioning
const poleR = param("Pole Radius", 5, { min: 3, max: 15, unit: "mm" });
const poleH = param("Pole Height", 80, { min: 40, max: 150, unit: "mm" });
const baseR = param("Base Radius", 25, { min: 15, max: 50, unit: "mm" });

const baseDisc = cylinder(6, baseR).color("#6c7086");
const pole = cylinder(poleH, poleR).color("#89b4fa");
const topSphere = sphere(poleR * 1.8).color("#f38ba8");

const asm = assembly("Lamp Post")
  .add("base", baseDisc, [0, 0, 0])
  .add("pole", pole, [0, 0, 3 + poleH / 2])
  .add("top", topSphere, [0, 0, 3 + poleH + poleR * 1.8]);

return asm.toSolid();`,
  },
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function renderGallery() {
  const gallery = document.getElementById("gallery")!;

  for (const example of examples) {
    // Card container
    const card = document.createElement("div");
    card.className = "card";

    // Viewport container
    const vpContainer = document.createElement("div");
    vpContainer.className = "card-viewport";
    const loading = document.createElement("div");
    loading.className = "loading";
    loading.textContent = "Loading model...";
    vpContainer.appendChild(loading);
    card.appendChild(vpContainer);

    // Info section
    const info = document.createElement("div");
    info.className = "card-info";
    info.innerHTML = `
      <h2>${escapeHtml(example.name)}</h2>
      <p>${escapeHtml(example.description)}</p>
      <details>
        <summary>View source</summary>
        <pre><code>${escapeHtml(example.code)}</code></pre>
      </details>
    `;
    card.appendChild(info);

    gallery.appendChild(card);

    // Render asynchronously so cards appear immediately
    renderCard(vpContainer, loading, example);
  }
}

async function renderCard(
  container: HTMLElement,
  loading: HTMLElement,
  example: Example,
) {
  try {
    const result = await evaluateModel(example.code);
    loading.remove();

    if (result.errors.length > 0) {
      const errDiv = document.createElement("div");
      errDiv.className = "error-msg";
      errDiv.textContent = result.errors.join("\n");
      container.appendChild(errDiv);
      return;
    }

    if (result.bodies.length > 0) {
      const viewport = new Viewport(container);
      viewport.setBodies(result.bodies);
    }
  } catch (err: unknown) {
    loading.remove();
    const errDiv = document.createElement("div");
    errDiv.className = "error-msg";
    errDiv.textContent = err instanceof Error ? err.message : String(err);
    container.appendChild(errDiv);
  }
}

renderGallery().catch((err) => {
  console.error("Gallery render failed:", err);
  document.getElementById("gallery")!.innerHTML = `
    <pre style="color:#f38ba8;padding:20px">${err.message}\n\n${err.stack}</pre>
  `;
});
