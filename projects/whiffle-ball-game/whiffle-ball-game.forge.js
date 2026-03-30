// Whiffle Ball Carnival Shooter — v4: A-frame mount, no top box
//
// Flower rockers hang from a pivot shaft supported by two A-frames.
// Open structure — no box over the top.
// Chalkboard is just the back wall.

const spacing  = param("Rocker Spacing", 160, { min: 120, max: 240, unit: "mm" });
const ballR    = param("Ball Radius",     38, { min:  30, max:  45, unit: "mm" });

const pivotZ   = 750;
const upperArm = 300;
const lowerArm = 220;
const discT    = 10;

const PLEXI1 = "#BCEEFF";
const PLEXI2 = "#7DCCE8";
const PLEXI3 = "#3DAAD8";
const CHALK  = "#0D0D0D";
const WOOD   = "#C8A060";
const STEEL  = "#909090";
const IRON   = "#383838";
const NEON   = "#CCFF00";
const ORNG   = "#E87020";
const PVC_W  = "#ECECEC";

// ── Helper: flat disc in XZ plane, centered at (cx, cy, cz) ──────────────────
function discAt(r, h, cx, cy, cz) {
  return cylinder(h, r).rotate(-90, 0, 0).translate(cx, cy - h / 2, cz);
}

// ── Rocker unit built in unit space — pivot at (0, 0, 0) ─────────────────────
function makeRocker(numPetals, petalR, petalDist, color) {
  const armLen = upperArm + lowerArm;
  const arm = box(30, 18, armLen)
    .translate(0, 0, (upperArm - lowerArm) / 2)
    .color(WOOD);
  const bearing = discAt(42, 36, 0, 0, 0).color(STEEL);
  const cw      = discAt(82, 72, 0, 0, -lowerArm).color(IRON);
  const hub     = discAt(58, discT, 0, 0, upperArm);
  let flower = hub;
  for (let i = 0; i < numPetals; i++) {
    const a = (i * 2 * Math.PI) / numPetals;
    flower = flower.union(
      discAt(petalR, discT,
        petalDist * Math.cos(a), 0,
        upperArm + petalDist * Math.sin(a))
    );
  }
  return { arm, bearing, cw, flower: flower.color(color) };
}

function placeRocker(parts, tiltDeg, yPos) {
  const p = s => s.rotate(0, tiltDeg, 0).translate(0, yPos, pivotZ);
  return { arm: p(parts.arm), bearing: p(parts.bearing),
           cw:  p(parts.cw),  flower:  p(parts.flower) };
}

const y1 = 0, y2 = spacing, y3 = spacing * 2;

const r1 = placeRocker(makeRocker(4, 70, 160, PLEXI1),  20, y1);
const r2 = placeRocker(makeRocker(5, 58, 162, PLEXI2), -16, y2);
const r3 = placeRocker(makeRocker(6, 42, 158, PLEXI3),   9, y3);

// ── Pivot shaft ───────────────────────────────────────────────────────────────
const shaftY0  = -120;
const shaftLen = y3 + 370;
const pivotShaft = cylinder(shaftLen, 18)
  .rotate(-90, 0, 0).translate(0, shaftY0, pivotZ).color(STEEL);

// ── A-frame geometry ──────────────────────────────────────────────────────────
// Each A-frame: two diagonal legs meeting at the pivot shaft, spreading to the floor.
//   Left leg : foot at (-legSpread, yPos, 0) → apex at (0, yPos, pivotZ)
//   Right leg: foot at (+legSpread, yPos, 0) → apex at (0, yPos, pivotZ)
//
// Rotation proof (side = -1 = left):
//   rotate(0, +legAngle, 0) tilts a Z-axis box toward +X at the top
//   translate(-legSpread/2, yPos, pivotZ/2) puts center at leg midpoint
//   → top ends up at (0, yPos, pivotZ), bottom at (-legSpread, yPos, 0) ✓

const legSpread = 390;
const legW      = 48;
const legLen    = Math.sqrt(legSpread * legSpread + pivotZ * pivotZ);
const legAngle  = Math.atan2(legSpread, pivotZ) * 180 / Math.PI;

const yFront = shaftY0 - 20;
const yBack  = y3 + 180;

function aLeg(side, yPos) {
  return box(legW, legW, legLen)
    .rotate(0, -side * legAngle, 0)
    .translate(side * legSpread / 2, yPos, pivotZ / 2)
    .color(WOOD);
}

// Horizontal foot crossbar connecting both legs at floor level
function footBarX(yPos) {
  return box(legSpread * 2 + legW, legW, legW)
    .translate(0, yPos, legW / 2)
    .color(WOOD);
}

// Side ground rails connecting front and back A-frames (Y direction)
function groundRailY(side) {
  const d = yBack - yFront + legW;
  return box(legW, d, legW)
    .translate(side * legSpread, (yFront + yBack) / 2, legW / 2)
    .color(WOOD);
}

// Small apex block where both legs meet the pivot shaft
function apexBlock(yPos) {
  return box(100, legW + 10, 100)
    .translate(0, yPos, pivotZ)
    .color(WOOD);
}

// A-frame crossbar — the horizontal bar that makes it a proper "A"
// Positioned at braceZ height; span matches leg positions at that height.
const braceZ    = 310;
const xAtBrace  = legSpread * (pivotZ - braceZ) / pivotZ;  // ~228mm
function aFrameCrossbar(yPos) {
  return box(xAtBrace * 2 + legW * 2, legW, legW)
    .translate(0, yPos, braceZ)
    .color(WOOD);
}

// Cross-rails connecting front and back A-frames at brace height
function braceRailY(side) {
  const d = yBack - yFront + legW;
  return box(legW, d, legW)
    .translate(side * xAtBrace, (yFront + yBack) / 2, braceZ)
    .color(WOOD);
}

// ── Ball return ramp (sits between the A-frames) ──────────────────────────────
const ramp = box(legSpread * 2 - 60, y3 + 160, 18)
  .rotate(7, 0, 0)
  .translate(0, y1 + (y3 + 160) / 2, pivotZ - lowerArm - 58)
  .color(WOOD);

// ── Chalkboard — just a wall ──────────────────────────────────────────────────
const chalkboard = box(900, 20, 1500)
  .translate(0, y3 + 108, 760)
  .color(CHALK);

// ── PVC cannon (hand-held — no cradle stand) ──────────────────────────────────
const aimZ      = pivotZ + upperArm;
const muzzleY   = -120;
const barrelLen = 500;
const barrelOD  = 44;

const cannon = cylinder(barrelLen, barrelOD)
  .rotate(-90, 0, 0).translate(0, muzzleY - barrelLen, aimZ)
  .subtract(
    cylinder(barrelLen + 10, barrelOD - 7)
      .rotate(-90, 0, 0).translate(0, muzzleY - barrelLen - 5, aimZ)
  ).color(PVC_W);

const blower = box(200, 165, 230)
  .translate(0, muzzleY - barrelLen - 85, aimZ).color(ORNG);

// ── Neon balls ────────────────────────────────────────────────────────────────
const ball1 = sphere(ballR).translate(0, -200, aimZ).color(NEON);
const ball2 = sphere(ballR).translate(25, y2 - 50, aimZ + 15).color(NEON);

// ── Assembly ──────────────────────────────────────────────────────────────────
const game = assembly("Whiffle Ball Bee Blast")
  .add("Chalkboard",   chalkboard)
  .add("Flower 1",     r1.flower)
  .add("Arm 1",        r1.arm)
  .add("CW 1",         r1.cw)
  .add("Bearing 1",    r1.bearing)
  .add("Flower 2",     r2.flower)
  .add("Arm 2",        r2.arm)
  .add("CW 2",         r2.cw)
  .add("Bearing 2",    r2.bearing)
  .add("Flower 3",     r3.flower)
  .add("Arm 3",        r3.arm)
  .add("CW 3",         r3.cw)
  .add("Bearing 3",    r3.bearing)
  .add("Pivot Shaft",  pivotShaft)
  .add("Leg FL",       aLeg(-1, yFront))
  .add("Leg FR",       aLeg( 1, yFront))
  .add("Leg BL",       aLeg(-1, yBack))
  .add("Leg BR",       aLeg( 1, yBack))
  .add("Foot Front",   footBarX(yFront))
  .add("Foot Back",    footBarX(yBack))
  .add("Rail L",       groundRailY(-1))
  .add("Rail R",       groundRailY( 1))
  .add("Apex Front",   apexBlock(yFront))
  .add("Apex Back",    apexBlock(yBack))
  .add("Crossbar F",   aFrameCrossbar(yFront))
  .add("Crossbar B",   aFrameCrossbar(yBack))
  .add("Brace Rail L", braceRailY(-1))
  .add("Brace Rail R", braceRailY( 1))
  .add("Ramp",         ramp)
  .add("Cannon",       cannon)
  .add("Blower",       blower)
  .add("Ball 1",       ball1)
  .add("Ball 2",       ball2);

return {
  model: game,
  camera: [-550, -950, 1150],
};
