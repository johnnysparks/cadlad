// L-bracket with mounting holes
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

return bracket.named("L-Bracket").color("#89b4fa");
