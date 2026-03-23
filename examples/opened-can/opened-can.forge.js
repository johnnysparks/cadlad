// Opened Aluminum Can
// Modeled to match the "Single Orthographic Prototype" aesthetic:
// Matte gray technical finish, sharp edges, and precise geometric definitions.

const canR = param("Can Radius", 33, { min: 20, max: 50, unit: "mm" });
const canH = param("Can Height", 115, { min: 50, max: 200, unit: "mm" });
const neckR = param("Neck Radius", 28, { min: 20, max: 45, unit: "mm" });
const wallT = 1.5;

// 1. Main Body
const body = cylinder(canH - 10, canR).color("#b0b0b5");

// 2. Tapered Shoulder (Transition to neck)
const shoulderH = 8;
const shoulder = cylinder(shoulderH, canR, neckR)
  .translate(0, 0, (canH - 10) / 2 + shoulderH / 2);

// 3. The Rim (Top edge)
const rimH = 2;
const rimR = neckR + 1;
const rim = cylinder(rimH, rimR).translate(0, 0, (canH - 10) / 2 + shoulderH + rimH / 2);

// 4. The Lid (Recessed)
const lidDepth = 3;
const lid = cylinder(2, neckR - 0.5)
  .translate(0, 0, (canH - 10) / 2 + shoulderH + rimH / 2 - lidDepth)
  .color("#909095");

// 5. The Opening (Subtractive oval)
// We'll use a scaled cylinder to create an oval "drink hole"
const opening = cylinder(10, 8)
  .scale(1.4, 1, 1) // Make it oval
  .translate(0, neckR * 0.5, (canH - 10) / 2 + shoulderH + rimH / 2 - lidDepth);

// 6. The Pull Tab (Simplified)
// Created using extrudePolygon for the flat part and a hole
const tabPoints = [
  [-4, -2], [4, -2], [5, 12], [-5, 12]
];
const tabBase = extrudePolygon(tabPoints, 1);
const tabHole = cylinder(5, 2.5).translate(0, 8, 0);
const tab = tabBase.subtract(tabHole)
  .rotate(5, 0, 0) // Slight lift
  .translate(0, neckR * 0.1, (canH - 10) / 2 + shoulderH + rimH / 2 - lidDepth + 1.5)
  .color("#a0a0a5");

// Combine all parts
const canBody = body
  .union(shoulder)
  .union(rim)
  .subtract(opening);

const finalCan = canBody
  .union(lid)
  .union(tab)
  .named("Opened Aluminum Can")
  .color("#d0d0d5"); // Matte technical aluminum

return { 
  model: finalCan, 
  camera: [120, 150, 150] 
};
