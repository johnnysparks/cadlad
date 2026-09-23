// Rustic four-leg dining table reconstructed from a single perspective image.
//
// Authored dimensions are inches because this fixture is intended for US
// dimensional lumber. CadLad's kernel still receives millimetres; the one-time
// conversion below keeps the stock relationships explicit and unambiguous.
// This is a level-1 assembly model: every visible woodworking member remains
// separately addressable, while fasteners are symbolic cylinders.

const INCH = 25.4;
const toMm = (inches) => inches * INCH;

const tableLIn = param("Table Length", 72, { min: 60, max: 96, unit: "in" });
const tableHIn = param("Table Height", 30, { min: 26, max: 36, unit: "in" });
const plankCount = Math.round(param("Top Board Count", 6, {
  min: 5,
  max: 8,
  step: 1,
  unit: "boards",
}));
const legInsetIn = param("Leg Setback", 2, { min: 1, max: 4, unit: "in" });

// Actual finished dimensions for nominal dimensional lumber.
const topThicknessIn = 1.5; // nominal 2x6 thickness
const topBoardWidthIn = 5.5; // nominal 2x6 width
const legSectionIn = 3.5; // nominal 4x4 section
const apronHeightIn = 5.5; // nominal 2x6 width
const apronThicknessIn = 1.5; // nominal 2x6 thickness
const plankGapIn = 0.125; // 1/8" seam between top boards
const apronOverlapIn = 0.5; // overlap into adjoining members for a stable layout

const tableL = toMm(tableLIn);
const tableD = toMm(plankCount * topBoardWidthIn + (plankCount - 1) * plankGapIn);
const tableH = toMm(tableHIn);
const topT = toMm(topThicknessIn);
const plankD = toMm(topBoardWidthIn);
const legS = toMm(legSectionIn);
const legInset = toMm(legInsetIn);
const apronH = toMm(apronHeightIn);
const apronT = toMm(apronThicknessIn);
const plankGap = toMm(plankGapIn);
const apronOverlap = toMm(apronOverlapIn);

const legH = tableH - topT;
const topZ = tableH - topT / 2;
const legZ = legH / 2;
const apronZ = tableH - topT - apronH / 2;

// The legs are inset from the table edge, leaving the characteristic top
// overhang visible in the reference image.
const legX = tableL / 2 - legInset - legS / 2;
const legY = tableD / 2 - legInset - legS / 2;

// Aprons terminate at the inside faces of the legs and tuck in slightly for a
// plausible, construction-friendly relationship.
const longApronL = tableL - 2 * (legInset + legS) + apronOverlap * 4;
const shortApronL = tableD - 2 * (legInset + legS) + apronOverlap * 4;
const frontApronY = -(tableD / 2 - legInset - legS - apronT / 2 + apronOverlap);
const sideApronX = tableL / 2 - legInset - legS - apronT / 2 + apronOverlap;

const topColors = ["#c98a43", "#d49a51", "#bd7d38", "#d09a57", "#c4873e", "#d39a50"];
const legColor = "#a86a2e";
const apronColor = "#b87532";
const hardwareColor = "#b8b7ae";

const table = assembly("Rustic Table");

// Long boards make the top seam pattern visible while preserving a clean
// overall rectangular envelope.
for (let i = 0; i < plankCount; i += 1) {
  const y = -tableD / 2 + plankD / 2 + i * (plankD + plankGap);
  table.add(
    `top-plank-${i + 1}`,
    box(tableL, plankD, topT).color(topColors[i % topColors.length]),
    [0, y, topZ],
  );
}

// Square legs run from the floor to the underside of the top.
const leg = box(legS, legS, legH).color(legColor);
table.add("leg-front-left", leg, [-legX, -legY, legZ]);
table.add("leg-front-right", leg, [legX, -legY, legZ]);
table.add("leg-back-left", leg, [-legX, legY, legZ]);
table.add("leg-back-right", leg, [legX, legY, legZ]);

// Recessed front and back aprons.
const longApron = box(longApronL, apronT, apronH).color(apronColor);
table.add("apron-front", longApron, [0, frontApronY, apronZ]);
table.add("apron-back", longApron, [0, -frontApronY, apronZ]);

// Recessed left and right aprons run across the short dimension.
const shortApron = box(apronT, shortApronL, apronH).color(apronColor);
table.add("apron-left", shortApron, [-sideApronX, 0, apronZ]);
table.add("apron-right", shortApron, [sideApronX, 0, apronZ]);

// Symbolic exposed bolt heads. Threads and hidden joinery are deliberately
// omitted; these are only the visible round hardware cues from the image.
const boltZ = apronZ;
const bolt = cylinder(toMm(0.25), toMm(0.375), toMm(0.375), 24).color(hardwareColor);
const frontBoltY = -(tableD / 2 - legInset) - toMm(0.125);
const sideBoltX = -(tableL / 2 - legInset) - toMm(0.125);

table.add("bolt-front-left", bolt.rotate(90, 0, 0), [-legX, frontBoltY, boltZ]);
table.add("bolt-front-right", bolt.rotate(90, 0, 0), [legX, frontBoltY, boltZ]);
table.add("bolt-back-left", bolt.rotate(90, 0, 0), [-legX, -frontBoltY, boltZ]);
table.add("bolt-back-right", bolt.rotate(90, 0, 0), [legX, -frontBoltY, boltZ]);
table.add("bolt-left-front", bolt.rotate(0, 90, 0), [sideBoltX, -legY, boltZ]);
table.add("bolt-left-back", bolt.rotate(0, 90, 0), [sideBoltX, legY, boltZ]);
table.add("bolt-right-front", bolt.rotate(0, 90, 0), [-sideBoltX, -legY, boltZ]);
table.add("bolt-right-back", bolt.rotate(0, 90, 0), [-sideBoltX, legY, boltZ]);

return { model: table, camera: [2300, 1700, 2500] };
