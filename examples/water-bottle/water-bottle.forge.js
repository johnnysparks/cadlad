// Vacuum sport bottle inspired by a technical section drawing.
//
// Improvements over previous version:
// - Double-wall bottle profile (body + shoulder + neck ring) with explicit inner cavity.
// - Visible liquid volume and meniscus so "water" reads clearly in renders.
// - Thread collar + cap + carry loop to better match the reference silhouette.
// - Uses assembly() so each part keeps its own color/material identity.

const bodyR = param("Body Radius", 37, { min: 30, max: 45, unit: "mm" });
const bodyH = param("Body Height", 180, { min: 140, max: 230, unit: "mm" });
const shoulderH = param("Shoulder Height", 20, { min: 12, max: 32, unit: "mm" });
const neckR = param("Neck Radius", 21, { min: 16, max: 26, unit: "mm" });
const neckH = param("Neck Height", 24, { min: 12, max: 36, unit: "mm" });
const wallT = param("Wall Thickness", 2.8, { min: 1.8, max: 4, unit: "mm" });
const bottomT = param("Bottom Thickness", 4, { min: 2, max: 8, unit: "mm" });
const fillPct = param("Water Fill %", 68, { min: 10, max: 95, unit: "%" });
const capH = param("Cap Height", 26, { min: 16, max: 40, unit: "mm" });

const totalH = bodyH + shoulderH + neckH;
const bodyCenterZ = bodyH / 2;

// Outer shell: cylindrical body + tapered shoulder + neck land
const outerBody = cylinder(bodyH, bodyR).translate(0, 0, bodyCenterZ);
const shoulder = cylinder(shoulderH, bodyR, neckR + 2)
  .translate(0, 0, bodyH + shoulderH / 2);
const neckLand = cylinder(neckH, neckR + 2)
  .translate(0, 0, bodyH + shoulderH + neckH / 2);

const outerShell = outerBody
  .union(shoulder)
  .union(neckLand)
  .named("Outer Shell")
  .color([0.82, 0.9, 0.96, 0.34]);

// Inner cavity (double-wall visual effect via translucent outer shell)
const innerBodyR = bodyR - wallT;
const innerNeckR = neckR - wallT * 0.7;
const cavityBodyH = totalH - bottomT - wallT;
const innerBody = cylinder(cavityBodyH, innerBodyR)
  .translate(0, 0, bottomT + cavityBodyH / 2);
const innerShoulder = cylinder(shoulderH, innerBodyR, innerNeckR)
  .translate(0, 0, bodyH + shoulderH / 2);
const innerNeck = cylinder(neckH + 2, innerNeckR)
  .translate(0, 0, bodyH + shoulderH + neckH / 2 + 1);

const cavity = innerBody.union(innerShoulder).union(innerNeck);
const bottleBody = outerShell.subtract(cavity).named("Bottle Body");

// Thread collar band (simplified)
const threadOuter = cylinder(6, neckR + 3)
  .translate(0, 0, bodyH + shoulderH + 8);
const threadInner = cylinder(8, neckR + 0.8)
  .translate(0, 0, bodyH + shoulderH + 8);
const threadBand = threadOuter.subtract(threadInner).color("#b9c2cb");

// Water volume + shallow meniscus dome for a readable liquid surface
const fillHeight = (cavityBodyH - 6) * (fillPct / 100);
const waterBody = cylinder(fillHeight, innerBodyR - 0.8)
  .translate(0, 0, bottomT + fillHeight / 2 + 1.5);
const meniscus = sphere(innerBodyR - 1.1)
  .scale(1, 1, 0.08)
  .translate(0, 0, bottomT + fillHeight + 1.5);
const water = waterBody
  .union(meniscus)
  .named("Water")
  .color([0.2, 0.55, 0.9, 0.62]);

// Lid + carry loop inspired by the reference top assembly
const cap = cylinder(capH, neckR + 5)
  .translate(0, 0, totalH + capH / 2 + 1)
  .color("#21252b")
  .named("Cap");

const loopOuter = box((neckR + 10) * 2, 10, 22)
  .translate(0, 0, totalH + capH + 12);
const loopInner = box((neckR + 5) * 2, 14, 12)
  .translate(0, 0, totalH + capH + 12);
const carryLoop = loopOuter
  .subtract(loopInner)
  .fillet(2)
  .color("#2c3138")
  .named("Carry Loop");

const bottle = assembly("Vacuum Sport Bottle")
  .add("bottle-body", bottleBody)
  .add("thread-band", threadBand)
  .add("water", water)
  .add("cap", cap)
  .add("loop", carryLoop);

return { model: bottle, camera: [140, -120, 150] };
