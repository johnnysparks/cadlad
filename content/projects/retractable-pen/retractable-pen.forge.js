// Retractable pen — barrel, clip, button, and tip
//
// WHAT WORKED:
//   - Stacked cylinders along Z for axisymmetric parts (barrel, grip, tip, button)
//   - Box for the pocket clip — simple flat bar alongside the barrel
//   - Laying flat via rotate(0, 90, 0) at the end for natural "on the desk" pose
//   - Per-part colors survive through union now (_derive fix)
//
// WHAT DIDN'T:
//   - .color() at end of union chain used to override all part colors.
//     Now fixed in the API — individual colors persist through unions.
//   - Standing vertical (Z-up default for cylinders) — looks like a
//     skyscraper, not a pen. Always rotate elongated objects to their
//     natural resting orientation.
const barrelR = param("Barrel Radius", 5, { min: 3, max: 8, unit: "mm" });
const barrelH = param("Barrel Length", 70, { min: 50, max: 100, unit: "mm" });
const clipL = param("Clip Length", 25, { min: 15, max: 35, unit: "mm" });
const clipW = param("Clip Width", 3, { min: 2, max: 5, unit: "mm" });
const tipL = param("Tip Length", 8, { min: 4, max: 12, unit: "mm" });
const buttonH = param("Button Height", 5, { min: 3, max: 8, unit: "mm" });

// Main barrel
const barrel = cylinder(barrelH, barrelR, barrelR, 32).color("#1a3366");

// Grip section — slightly wider band near the tip
const grip = cylinder(barrelH * 0.2, barrelR + 0.5, barrelR + 0.5, 32)
  .translate(0, 0, -barrelH * 0.25)
  .color("#2a4477");

// Conical tip (overlaps barrel by 0.5mm)
const tip = cylinder(tipL, 0.8, barrelR, 16)
  .translate(0, 0, -barrelH / 2 - tipL / 2 + 0.5)
  .color("#cccccc");

// Click button at top (overlaps barrel by 0.5mm)
const button = cylinder(buttonH, barrelR - 0.5, barrelR - 0.5, 16)
  .translate(0, 0, barrelH / 2 + buttonH / 2 - 0.5)
  .color("#cc3333");

// Pocket clip (overlaps barrel by 0.25mm)
const clip = box(clipW, 1.5, clipL)
  .translate(0, -barrelR - 0.5, barrelH / 2 - clipL / 2)
  .color("#aaaaaa");

// Build vertical then lay flat — natural "on the desk" orientation
const pen = barrel
  .union(grip)
  .union(tip)
  .union(button)
  .union(clip)
  .rotate(0, 90, 0)
  .translate(0, 0, barrelR)
  .named("Retractable Pen");

return { model: pen, camera: [60, 40, 50] };
