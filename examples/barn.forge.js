// Red barn with gable roof and sliding door
const barnW = param("Width", 80, { min: 50, max: 120, unit: "mm" });
const barnD = param("Depth", 60, { min: 40, max: 100, unit: "mm" });
const wallH = param("Wall Height", 40, { min: 25, max: 60, unit: "mm" });
const roofH = param("Roof Height", 20, { min: 10, max: 35, unit: "mm" });
const doorW = param("Door Width", 22, { min: 12, max: 35, unit: "mm" });
const doorH = param("Door Height", 30, { min: 15, max: 38, unit: "mm" });

// Walls — bottom at Z=0
const walls = box(barnW, barnD, wallH)
  .translate(0, 0, wallH / 2);

// Gable roof — sketch the end profile in XZ, extrude along Z, then
// rotate so the extrusion runs along Y (the barn's depth axis).
// Winding auto-corrects if needed.
const hw = barnW / 2 + 3;
const roofProfile = Sketch.begin(-hw, 0)
  .lineTo(0, roofH)
  .lineTo(hw, 0)
  .close();

// Extrude creates the prism along Z. We need it along Y.
// After extrude: profile is in XY, depth along Z.
// rotate(90, 0, 0) tips it so depth runs along Y.
const roofDepth = barnD + 6;
const roof = roofProfile.extrude(roofDepth)
  .rotate(90, 0, 0)
  .translate(0, roofDepth / 2, wallH)
  .color("#5a3a2a");

// Door opening — punch through front wall
const doorCut = box(doorW, 10, doorH + 1)
  .translate(0, -barnD / 2, doorH / 2);

// Sliding door panel
const doorPanel = box(doorW * 0.55, 1.5, doorH - 1)
  .translate(doorW * 0.25, -barnD / 2 - 0.5, doorH / 2)
  .color("#5a3a2a");

const barn = walls
  .union(roof)
  .subtract(doorCut)
  .union(doorPanel)
  .named("Barn").color("#c04040");

return { model: barn, camera: [120, 80, -100] };
