// Wooden dining chair — cylinder legs, rounded seat, slatted backrest
//
// WHAT WORKED:
//   - Back legs extend full height (legH + backH) to structurally support
//     the backrest — this is how real chairs work. No floating geometry.
//   - assembly() with per-part .color() for distinct wood tones (light seat,
//     dark legs, medium backrest). Colors survive because assembly uses toBodies().
//   - roundedRect for the seat — rounded XY corners look more chair-like than box.
//   - Cylinder legs + stretchers — turned-leg look with minimal code.
//   - Two backrest slats instead of a solid panel — lighter, more realistic.
//
// KEY PATTERN: furniture with different wood parts → assembly() not union().
//   .color() after .union() overwrites everything to one color.
const seatW = param("Seat Width", 42, { min: 30, max: 60, unit: "mm" });
const seatD = param("Seat Depth", 40, { min: 30, max: 55, unit: "mm" });
const seatT = param("Seat Thickness", 3, { min: 2, max: 5, unit: "mm" });
const legH = param("Leg Height", 40, { min: 25, max: 55, unit: "mm" });
const legR = param("Leg Radius", 1.8, { min: 1, max: 3, unit: "mm" });
const backH = param("Back Height", 38, { min: 25, max: 50, unit: "mm" });
const recline = param("Recline", 3, { min: 0, max: 8, unit: "mm" });
const strR = param("Stretcher Radius", 1, { min: 0.5, max: 2, unit: "mm" });

// Colors
const seatColor = "#d4b896";  // light honey wood
const legColor = "#8b6c4a";   // dark walnut
const backColor = "#a68b6b";  // medium oak

// Corner inset from seat edge
const xOff = seatW / 2 - legR * 2;
const yOff = seatD / 2 - legR * 2;

// Seat — rounded rectangle sitting on top of legs
const seat = roundedRect(seatW, seatD, 2, seatT)
  .translate(0, 0, legH)
  .color(seatColor);

// Front legs — from ground to seat height
const frontLeg = cylinder(legH, legR).color(legColor);
const fl = frontLeg.translate(-xOff, -yOff, legH / 2);
const fr = frontLeg.translate( xOff, -yOff, legH / 2);

// Back legs — extend full height to support backrest
const backLeg = cylinder(legH + backH, legR).color(legColor);
const bl = backLeg.translate(-xOff, yOff, (legH + backH) / 2);
const br = backLeg.translate( xOff, yOff, (legH + backH) / 2);

const legs = fl.union(fr).union(bl).union(br);

// Backrest — two horizontal slats between back legs
const slatW = seatW - legR * 6;
const slatH = 4;
const slatT = 2;

const upperSlat = box(slatW, slatT, slatH)
  .translate(0, yOff + recline, legH + backH - slatH)
  .color(backColor);
const lowerSlat = box(slatW, slatT, slatH)
  .translate(0, yOff + recline * 0.5, legH + backH * 0.45)
  .color(backColor);

const backrest = upperSlat.union(lowerSlat);

// Stretchers — cross bars between legs for structural support
const strZ = legH * 0.3;
const sideLen = seatD - legR * 4;
const frontLen = seatW - legR * 4;

const sideStretcher = cylinder(sideLen, strR).rotate(90, 0, 0).color(legColor);
const ls = sideStretcher.translate(-xOff, 0, strZ);
const rs = sideStretcher.translate( xOff, 0, strZ);

const crossStretcher = cylinder(frontLen, strR).rotate(0, 90, 0).color(legColor);
const fs = crossStretcher.translate(0, -yOff, strZ);
const bs = crossStretcher.translate(0,  yOff, strZ);

const stretchers = ls.union(rs).union(fs).union(bs);

// Assembly — keeps part groups with distinct colors
const chair = assembly("Chair")
  .add("seat", seat, [0, 0, 0])
  .add("legs", legs, [0, 0, 0])
  .add("backrest", backrest, [0, 0, 0])
  .add("stretchers", stretchers, [0, 0, 0]);

return { model: chair, camera: [80, 60, 80] };
