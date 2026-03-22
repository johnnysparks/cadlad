// Red barn with triangular roof and sliding door
const barnW = param("Width", 80, { min: 50, max: 120, unit: "mm" });
const barnD = param("Depth", 60, { min: 40, max: 100, unit: "mm" });
const wallH = param("Wall Height", 40, { min: 25, max: 60, unit: "mm" });
const roofH = param("Roof Height", 25, { min: 15, max: 40, unit: "mm" });
const doorW = param("Door Width", 25, { min: 15, max: 40, unit: "mm" });
const doorH = param("Door Height", 35, { min: 20, max: 55, unit: "mm" });

// Walls
const walls = box(barnW, barnD, wallH).color("#c04040");

// Roof — approximate with a tall narrow box rotated (simple gable)
// Use a box for each side of the gable
const roofSlope = Math.sqrt(roofH * roofH + (barnW / 2) * (barnW / 2));
const roofAngle = Math.atan2(roofH, barnW / 2) * (180 / Math.PI);
const roofT = 2;

const leftRoof = box(roofSlope + 4, barnD + 4, roofT)
  .rotate(0, roofAngle, 0)
  .translate(-barnW / 4, 0, wallH / 2 + roofH / 2)
  .color("#5a3a2a");

const rightRoof = box(roofSlope + 4, barnD + 4, roofT)
  .rotate(0, -roofAngle, 0)
  .translate(barnW / 4, 0, wallH / 2 + roofH / 2)
  .color("#5a3a2a");

// Door opening
const doorCut = box(doorW, wallH, doorH + 2)
  .translate(0, -barnD / 2 + wallH / 2, -wallH / 2 + doorH / 2);

// Sliding door panel
const doorPanel = box(doorW * 0.6, 1, doorH - 2)
  .translate(doorW * 0.3, -barnD / 2 - 0.5, -wallH / 2 + doorH / 2)
  .color("#5a3a2a");

const barn = walls
  .subtract(doorCut)
  .union(leftRoof)
  .union(rightRoof)
  .union(doorPanel)
  .named("Barn");

return barn;
