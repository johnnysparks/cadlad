// Parametric phone stand
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

return stand.named("Phone Stand");
