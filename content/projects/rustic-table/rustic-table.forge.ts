// Rustic four-leg dining table reconstructed from a single perspective image.
//
// This is a level-1 assembly model: every visible woodworking member remains
// separately addressable, while fasteners are symbolic cylinders. The image
// does not establish hidden joinery or exact stock sizes, so those details are
// intentionally deferred.

const tableL = param("Table Length", 1800, { min: 1200, max: 2600, unit: "mm" });
const tableD = param("Table Depth", 900, { min: 700, max: 1300, unit: "mm" });
const tableH = param("Table Height", 760, { min: 650, max: 950, unit: "mm" });
const topT = param("Top Thickness", 65, { min: 40, max: 100, unit: "mm" });
const legS = param("Leg Section", 120, { min: 70, max: 180, unit: "mm" });
const legInset = param("Leg Setback", 55, { min: 20, max: 100, unit: "mm" });
const apronH = param("Apron Height", 145, { min: 90, max: 220, unit: "mm" });
const apronT = param("Apron Thickness", 35, { min: 20, max: 60, unit: "mm" });

const plankCount = 6;
const plankGap = 2;
const plankD = (tableD - plankGap * (plankCount - 1)) / plankCount;
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
const apronOverlap = 10;
const longApronL = tableL - 2 * (legInset + legS) + apronOverlap * 4;
const shortApronL = tableD - 2 * (legInset + legS) + apronOverlap * 4;
const frontApronY = -(tableD / 2 - legInset - legS - apronT / 2 + apronOverlap);
const sideApronX = tableL / 2 - legInset - legS - apronT / 2 + apronOverlap;

const topColors = ["#c98a43", "#d49a51", "#bd7d38", "#d09a57", "#c4873e", "#d39a50"];
const legColor = "#a86a2e";
const apronColor = "#b87532";
const hardwareColor = "#b8b7ae";

const table = assembly("Rustic Table");

// Six long boards make the top seam pattern visible while preserving a clean
// overall rectangular envelope.
for (let i = 0; i < plankCount; i += 1) {
  const y = -tableD / 2 + plankD / 2 + i * (plankD + plankGap);
  table.add(
    `top-plank-${i + 1}`,
    box(tableL, plankD, topT).color(topColors[i]),
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
const bolt = cylinder(6, 11, 11, 24).color(hardwareColor);
const frontBoltY = -(tableD / 2 - legInset) - 3;
const sideBoltX = -(tableL / 2 - legInset) - 3;

table.add("bolt-front-left", bolt.rotate(90, 0, 0), [-legX, frontBoltY, boltZ]);
table.add("bolt-front-right", bolt.rotate(90, 0, 0), [legX, frontBoltY, boltZ]);
table.add("bolt-back-left", bolt.rotate(90, 0, 0), [-legX, -frontBoltY, boltZ]);
table.add("bolt-back-right", bolt.rotate(90, 0, 0), [legX, -frontBoltY, boltZ]);
table.add("bolt-left-front", bolt.rotate(0, 90, 0), [sideBoltX, -legY, boltZ]);
table.add("bolt-left-back", bolt.rotate(0, 90, 0), [sideBoltX, legY, boltZ]);
table.add("bolt-right-front", bolt.rotate(0, 90, 0), [-sideBoltX, -legY, boltZ]);
table.add("bolt-right-back", bolt.rotate(0, 90, 0), [-sideBoltX, legY, boltZ]);

return { model: table, camera: [2300, 1700, 2500] };
