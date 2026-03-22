// Retractable pen — barrel, clip, button, and tip
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

// Conical tip
const tip = cylinder(tipL, barrelR, 0.8, 16)
  .translate(0, 0, -barrelH / 2 - tipL / 2)
  .color("#cccccc");

// Click button at top
const button = cylinder(buttonH, barrelR - 0.5, barrelR - 0.5, 16)
  .translate(0, 0, barrelH / 2 + buttonH / 2)
  .color("#cc3333");

// Pocket clip
const clip = box(clipW, 1, clipL)
  .translate(0, -barrelR - 0.5, barrelH / 2 - clipL / 2)
  .color("#cccccc");

// Clip top curl (small cylinder to hook over pocket)
const clipCurl = cylinder(1.5, clipW / 2 + 0.5, clipW / 2 + 0.5, 8)
  .rotate(90, 0, 0)
  .translate(0, -barrelR - 1, barrelH / 2 - clipL + 1)
  .color("#cccccc");

const pen = barrel
  .union(grip)
  .union(tip)
  .union(button)
  .union(clip)
  .union(clipCurl)
  .named("Retractable Pen").color("#1a3366");

return { model: pen, camera: [50, 60, 80] };
