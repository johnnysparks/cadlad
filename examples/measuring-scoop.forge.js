// Measuring scoop — bowl with flat bottom and handle
const bowlD = param("Bowl Diameter", 30, { min: 20, max: 50, unit: "mm" });
const bowlDepth = param("Bowl Depth", 15, { min: 8, max: 25, unit: "mm" });
const wallT = param("Wall Thickness", 2, { min: 1.5, max: 3, unit: "mm" });
const handleL = param("Handle Length", 40, { min: 25, max: 60, unit: "mm" });
const handleW = param("Handle Width", 12, { min: 8, max: 18, unit: "mm" });
const handleT = param("Handle Thickness", 3, { min: 2, max: 5, unit: "mm" });

// Bowl — hemisphere via sphere subtract
const outerR = bowlD / 2;
const innerR = outerR - wallT;

const outerSphere = sphere(outerR);
const innerSphere = sphere(innerR);

// Cut the top half off to make a bowl
const topCut = box(bowlD + 2, bowlD + 2, bowlD)
  .translate(0, 0, bowlD / 2);

// Flat bottom
const bottomCut = box(bowlD + 2, bowlD + 2, bowlD)
  .translate(0, 0, -bowlD / 2 - bowlDepth + outerR);

const bowl = outerSphere
  .subtract(innerSphere)
  .subtract(topCut)
  .subtract(bottomCut)
  .color("#ddd8cc");

// Handle
const handle = box(handleL, handleW, handleT)
  .translate(outerR + handleL / 2 - 2, 0, -bowlDepth / 2 + handleT / 2)
  .color("#ccc5b8");

const scoop = bowl.union(handle).named("Measuring Scoop");

return scoop;
