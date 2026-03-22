// Battery compartment cover with snap tabs
const coverW = param("Width", 35, { min: 25, max: 50, unit: "mm" });
const coverL = param("Length", 50, { min: 35, max: 70, unit: "mm" });
const coverT = param("Thickness", 1.5, { min: 1, max: 3, unit: "mm" });
const lipH = param("Lip Height", 3, { min: 2, max: 5, unit: "mm" });
const lipT = param("Lip Thickness", 1, { min: 0.8, max: 2, unit: "mm" });
const tabW = param("Tab Width", 6, { min: 4, max: 10, unit: "mm" });

// Flat cover plate
const plate = box(coverW, coverL, coverT).color("#555555");

// Perimeter lip (slides into the compartment)
const outerLip = box(coverW, coverL, lipH)
  .translate(0, 0, -lipH / 2 - coverT / 2);
const innerLip = box(coverW - lipT * 2, coverL - lipT * 2, lipH + 2)
  .translate(0, 0, -lipH / 2 - coverT / 2);
const lip = outerLip.subtract(innerLip).color("#555555");

// Snap tabs on each short end
const tab = box(tabW, lipT + 0.5, 1.5)
  .color("#555555");
const tabFront = tab.translate(0, -coverL / 2 + lipT / 2, -lipH - coverT / 2 + 0.5);
const tabBack = tab.translate(0, coverL / 2 - lipT / 2, -lipH - coverT / 2 + 0.5);

// Grip texture — small ridge on top
const grip = box(coverW * 0.6, 1.5, 0.5)
  .translate(0, 0, coverT / 2 + 0.25)
  .color("#666666");
const grip2 = box(coverW * 0.6, 1.5, 0.5)
  .translate(0, 4, coverT / 2 + 0.25)
  .color("#666666");
const grip3 = box(coverW * 0.6, 1.5, 0.5)
  .translate(0, -4, coverT / 2 + 0.25)
  .color("#666666");

const cover = plate
  .union(lip)
  .union(tabFront).union(tabBack)
  .union(grip).union(grip2).union(grip3)
  .named("Battery Cover");

return cover;
