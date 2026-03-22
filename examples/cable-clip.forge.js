// Cable management clip — C-shape with mounting tab
//
// WHAT WORKED:
//   - C-shape via: outer cylinder - inner cylinder - gap box. Classic pattern
//     for clips, clamps, rings, and any partial-circle shape.
//   - Mounting tab as a box unioned at the bottom, screw hole subtracted through.
//   - Parameters driven from the cable diameter — everything scales from that.
//
// KEY PATTERN: partial circles via cylinder subtract + gap box subtract.
const cableD = param("Cable Diameter", 6, { min: 3, max: 12, unit: "mm" });
const clipT = param("Clip Thickness", 2, { min: 1.5, max: 4, unit: "mm" });
const clipW = param("Clip Width", 10, { min: 6, max: 20, unit: "mm" });
const gapW = param("Opening Width", 3, { min: 1.5, max: 6, unit: "mm" });
const tabW = param("Tab Width", 12, { min: 8, max: 20, unit: "mm" });
const tabH = param("Tab Height", 3, { min: 2, max: 5, unit: "mm" });
const holeD = param("Screw Hole", 3, { min: 2, max: 5, unit: "mm" });

const outerR = cableD / 2 + clipT;
const innerR = cableD / 2;

// C-shaped clip — outer cylinder minus inner cylinder minus gap
const outerCyl = cylinder(clipW, outerR).color("#4488aa");
const innerCyl = cylinder(clipW + 2, innerR);
const gap = box(gapW, outerR * 2, clipW + 2)
  .translate(0, outerR, 0);

const clip = outerCyl.subtract(innerCyl).subtract(gap);

// Mounting tab at the bottom
const tab = box(tabW, tabH, clipW)
  .translate(0, -outerR - tabH / 2 + 1, 0)
  .color("#4488aa");

// Screw hole in tab
const screwHole = cylinder(clipW + 2, holeD / 2)
  .translate(0, -outerR - tabH / 2 + 1, 0);

const part = clip
  .union(tab)
  .subtract(screwHole)
  .named("Cable Clip").color("#4488aa");

return part;
