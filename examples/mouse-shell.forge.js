// Computer mouse shell — ergonomic top half with button splits
const mouseW = param("Width", 32, { min: 25, max: 40, unit: "mm" });
const mouseD = param("Depth", 55, { min: 40, max: 70, unit: "mm" });
const mouseH = param("Height", 18, { min: 12, max: 25, unit: "mm" });
const wallT = param("Wall Thickness", 1.5, { min: 1, max: 3, unit: "mm" });
const splitW = param("Button Split Width", 1, { min: 0.5, max: 2, unit: "mm" });

// Main shell — squashed sphere scaled to mouse proportions
const outerBody = sphere(mouseW / 2, 48)
  .scale(1, mouseD / mouseW, mouseH / (mouseW / 2))
  .color("#333333");

// Flatten the bottom
const bottomCut = box(mouseW + 4, mouseD + 4, mouseH)
  .translate(0, 0, -mouseH / 2);

// Hollow interior
const innerBody = sphere(mouseW / 2 - wallT, 48)
  .scale(1, mouseD / mouseW, mouseH / (mouseW / 2));

// Button split line — runs down the middle of the top
const split = box(splitW, mouseD * 0.6, mouseH)
  .translate(0, -mouseD * 0.05, mouseH / 4);

// Scroll wheel slot
const scrollSlot = box(3, 8, mouseH)
  .translate(0, mouseD * 0.15, mouseH / 3);

const shell = outerBody
  .subtract(bottomCut)
  .subtract(innerBody)
  .subtract(split)
  .subtract(scrollSlot)
  .named("Mouse Shell").color("#333333");

return { model: shell, camera: [40, 50, -50] };
