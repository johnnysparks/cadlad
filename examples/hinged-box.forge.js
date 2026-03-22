// Hinged box — base and lid connected by a pin hinge
const boxW = param("Width", 50, { min: 30, max: 80, unit: "mm" });
const boxD = param("Depth", 35, { min: 25, max: 60, unit: "mm" });
const boxH = param("Height", 20, { min: 12, max: 35, unit: "mm" });
const wallT = param("Wall Thickness", 2, { min: 1.5, max: 4, unit: "mm" });
const lidH = param("Lid Height", 6, { min: 4, max: 12, unit: "mm" });
const hingeR = param("Hinge Radius", 2.5, { min: 1.5, max: 4, unit: "mm" });

// Base — open-top box
const baseOuter = box(boxW, boxD, boxH).color("#c4956a");
const baseCavity = box(boxW - wallT * 2, boxD - wallT * 2, boxH)
  .translate(0, 0, wallT);
const base = baseOuter.subtract(baseCavity);

// Lid — shallow tray (upside down)
const lidOuter = box(boxW, boxD, lidH).color("#b8845a");
const lidCavity = box(boxW - wallT * 2, boxD - wallT * 2, lidH)
  .translate(0, 0, -wallT);
const lid = lidOuter.subtract(lidCavity)
  .translate(0, 0, boxH / 2 + lidH / 2);

// Hinge knuckles on the back edge
const knuckle = cylinder(hingeR * 2, hingeR, hingeR, 16)
  .rotate(0, 90, 0);

// Base knuckles (3 on base)
const bk1 = knuckle.translate(-boxW * 0.35, boxD / 2, boxH / 2).color("#aa7744");
const bk2 = knuckle.translate(0, boxD / 2, boxH / 2).color("#aa7744");
const bk3 = knuckle.translate(boxW * 0.35, boxD / 2, boxH / 2).color("#aa7744");

// Lid knuckles (2, interleaved)
const lk1 = knuckle.translate(-boxW * 0.175, boxD / 2, boxH / 2 + lidH / 2).color("#997744");
const lk2 = knuckle.translate(boxW * 0.175, boxD / 2, boxH / 2 + lidH / 2).color("#997744");

// Hinge pin
const pin = cylinder(boxW * 0.8, hingeR * 0.4, hingeR * 0.4, 8)
  .rotate(0, 90, 0)
  .translate(0, boxD / 2, boxH / 2)
  .color("#888888");

const hingedBox = assembly("Hinged Box")
  .add("base", base.union(bk1).union(bk2).union(bk3), [0, 0, 0])
  .add("lid", lid.union(lk1).union(lk2), [0, 0, 0])
  .add("pin", pin, [0, 0, 0]);

return hingedBox.toSolid();
