// Assembly demo — multi-part model with positioning
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

return asm;
