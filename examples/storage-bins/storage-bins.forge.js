// Modular storage bin family — small, medium, large that stack and nest
//
// WHAT WORKED:
//   - Helper function makeBin(scaleW, scaleD, scaleH, color) — parametric
//     family from a single definition. Best pattern for "same shape, many sizes".
//   - assembly() for side-by-side presentation — each bin keeps its own color.
//   - Stacking lip as a separate ring (outer box minus inner box) at the top.
//   - Label slot via subtract on the front face.
//
// KEY PATTERN: parametric families via helper functions + assembly layout.
const unitW = param("Unit Width", 30, { min: 20, max: 50, unit: "mm" });
const unitD = param("Unit Depth", 25, { min: 15, max: 40, unit: "mm" });
const unitH = param("Unit Height", 20, { min: 12, max: 35, unit: "mm" });
const wallT = param("Wall Thickness", 2, { min: 1.5, max: 3, unit: "mm" });
const lipH = param("Stacking Lip", 2, { min: 1, max: 4, unit: "mm" });
const draft = param("Draft Angle Offset", 1.5, { min: 0.5, max: 3, unit: "mm" });

// Build a single bin at a given scale multiplier
function makeBin(scaleW, scaleD, scaleH, color) {
  const w = unitW * scaleW;
  const d = unitD * scaleD;
  const h = unitH * scaleH;

  // Outer walls — slight draft (wider at top)
  const outer = box(w, d, h);

  // Inner cavity with draft — narrower at bottom
  const innerW = w - wallT * 2;
  const innerD = d - wallT * 2;
  const cavity = box(innerW, innerD, h)
    .translate(0, 0, wallT);

  // Stacking lip — rim around the top that nests into next bin
  const lipOuter = box(w + 1, d + 1, lipH);
  const lipInner = box(w - 1, d - 1, lipH + 2);
  const lip = lipOuter.subtract(lipInner)
    .translate(0, 0, h / 2 + lipH / 2);

  // Label slot on the front
  const label = box(w * 0.6, 2, h * 0.3)
    .translate(0, -d / 2, h * 0.1);

  return outer
    .subtract(cavity)
    .union(lip)
    .subtract(label)
    .color(color);
}

// Three sizes
const small = makeBin(1, 1, 1, "#6699bb");
const medium = makeBin(2, 1, 1, "#669966");
const large = makeBin(2, 1, 1.5, "#996666");

// Arrange side by side — position from left edges, not centers
const gap = 8;
const smallW = unitW;
const medW = unitW * 2;
const largeW = unitW * 2;

// Small centered at x=0, medium starts after small + gap, large after that
const medX = smallW / 2 + gap + medW / 2;
const largeX = medX + medW / 2 + gap + largeW / 2;

const asm = assembly("Storage Bin Family")
  .add("small", small, [0, 0, 0])
  .add("medium", medium, [medX, 0, 0])
  .add("large", large, [largeX, 0, 0]);

return asm;
