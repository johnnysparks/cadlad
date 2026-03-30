// Whiffle Ball Carnival Shooter — v3: swaying flower rockers
//
// Big plexiglass "flowers" hang on counterweighted rocker arms. A push (or a
// ball hit) sets them swaying side-to-side like flowers in a breeze.
// High counterweight inertia + low bearing friction = long lazy oscillation.
// Adjacent rockers sway in different phases — simultaneous alignment is the skill.
//
// Depth progression (front → back = easy → hard):
//   Flower 1: 4 wide petals  — generous gaps ~86mm  (ball = 76mm)
//   Flower 2: 5 medium petals — moderate gaps ~84mm
//   Flower 3: 6 narrow petals — tight gaps ~76mm (barely clears)

const spacing  = param("Rocker Spacing", 160, { min: 120, max: 240, unit: "mm" });
const ballR    = param("Ball Radius",     38, { min:  30, max:  45, unit: "mm" });

// Rocker geometry
const pivotZ   = 750;   // pivot shaft height from floor (Z)
const upperArm = 300;   // arm: pivot to flower center
const lowerArm = 220;   // arm: pivot to counterweight center
const discT    = 10;    // flower disc thickness

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

// ── Helper: flat cylinder (disc) in XZ plane, centered at (cx, cy, cz) ───────
// Normal along Y. Used for flower petals, counterweights, bearings.
function discAt(r, h, cx, cy, cz) {
  return cylinder(h, r)
    .rotate(-90, 0, 0)
    .translate(cx, cy - h / 2, cz);
}

// ── Build one rocker unit in UNIT SPACE — pivot at (0, 0, 0) ─────────────────
// Arm spans Z from -lowerArm to +upperArm.
// Flower is centered at Z = +upperArm.
// Counterweight is centered at Z = -lowerArm.
// Apply .rotate(0, tiltDeg, 0).translate(0, yPos, pivotZ) to place in the world.
function makeRocker(numPetals, petalR, petalDist, color) {
  const armW   = 30;
  const armT   = 18;
  const armLen = upperArm + lowerArm;   // 520mm total

  // Vertical arm bar (box centered along the arm span)
  const arm = box(armW, armT, armLen)
    .translate(0, 0, (upperArm - lowerArm) / 2)  // shift so Z: [-lowerArm, +upperArm]
    .color(WOOD);

  // Pivot bearing (disc at Z=0)
  const bearing = discAt(42, 36, 0, 0, 0).color(STEEL);

  // Counterweight (heavy iron disc at Z=-lowerArm)
  const cw = discAt(82, 72, 0, 0, -lowerArm).color(IRON);

  // Flower: hub disc + numPetals petal discs, all at Z=+upperArm
  const hub = discAt(58, discT, 0, 0, upperArm);
  let flowerSolid = hub;
  for (let i = 0; i < numPetals; i++) {
    const a = (i * 2 * Math.PI) / numPetals;
    flowerSolid = flowerSolid.union(
      discAt(petalR, discT,
        petalDist * Math.cos(a), 0,
        upperArm + petalDist * Math.sin(a))
    );
  }
  const flower = flowerSolid.color(color);

  return { arm, bearing, cw, flower };
}

// Apply tilt + world placement to all parts of a rocker unit
function placeRocker(parts, tiltDeg, yPos) {
  const place = s => s.rotate(0, tiltDeg, 0).translate(0, yPos, pivotZ);
  return {
    arm:     place(parts.arm),
    bearing: place(parts.bearing),
    cw:      place(parts.cw),
    flower:  place(parts.flower),
  };
}

// ── Three rocker units ────────────────────────────────────────────────────────
// Petal gaps (chord between petal edges) vs 76mm ball:
//   4 petals @ dist=160, r=70:  gap ≈ 86mm  ✓ generous
//   5 petals @ dist=162, r=58:  gap ≈ 84mm  ✓ moderate
//   6 petals @ dist=158, r=42:  gap ≈ 76mm  ✓ tight
const y1 = 0, y2 = spacing, y3 = spacing * 2;

const rp1 = makeRocker(4, 70, 160, PLEXI1);
const rp2 = makeRocker(5, 58, 162, PLEXI2);
const rp3 = makeRocker(6, 42, 158, PLEXI3);

// Different tilt angles simulate mid-sway in different phases
const r1 = placeRocker(rp1,  14, y1);
const r2 = placeRocker(rp2, -11, y2);
const r3 = placeRocker(rp3,   7, y3);

// ── Pivot shaft ───────────────────────────────────────────────────────────────
const shaftLen = y3 + 350;
const shaftY0  = -115;
const pivotShaft = cylinder(shaftLen, 18)
  .rotate(-90, 0, 0)
  .translate(0, shaftY0, pivotZ)
  .color(STEEL);

// ── Frame (2×4 lumber) ────────────────────────────────────────────────────────
const frameHW  = 390;                         // half-width — covers disc at max tilt
const frameTop = pivotZ + upperArm + 180;     // 1230mm
const yFront   = shaftY0 - 20;               // -135mm
const yBack    = y3 + 185;                   // ~505mm
const pSz      = 45;

function fPost(x, y) {
  return box(pSz, pSz, frameTop).translate(x, y, frameTop / 2).color(WOOD);
}
function topBeamX(y) {
  return box(frameHW * 2 + pSz, pSz, pSz).translate(0, y, frameTop).color(WOOD);
}
function topBeamY(x) {
  return box(pSz, yBack - yFront + pSz, pSz)
    .translate(x, (yFront + yBack) / 2, frameTop).color(WOOD);
}
function pivBeamX(y) {
  // Horizontal beam at pivot height on front/back faces — shaft rides through center
  return box(frameHW * 2 + pSz, pSz, pSz).translate(0, y, pivotZ).color(WOOD);
}
function baseBeamY(x) {
  return box(pSz, yBack - yFront + pSz, pSz)
    .translate(x, (yFront + yBack) / 2, pSz / 2).color(WOOD);
}
function baseBeamX(y) {
  return box(frameHW * 2 + pSz, pSz, pSz).translate(0, y, pSz / 2).color(WOOD);
}

// ── Ball return ramp (slopes front-to-back, catches cleared balls) ─────────────
const rampW = frameHW * 2 - 80;
const rampD = y3 - y1 + 120;
const ramp  = box(rampW, rampD, 18)
  .rotate(8, 0, 0)          // slight forward slope — balls roll back to player
  .translate(0, y1 + rampD / 2, pivotZ - lowerArm - 55)
  .color(WOOD);

// ── PVC cannon (aimed at flower height) ───────────────────────────────────────
const barrelLen = 500;
const barrelOD  = 44;
const muzzleY   = -115;
const aimZ      = pivotZ + upperArm;   // 1050mm — flower center height when upright

const barrelOut = cylinder(barrelLen, barrelOD)
  .rotate(-90, 0, 0).translate(0, muzzleY - barrelLen, aimZ);
const barrelIn  = cylinder(barrelLen + 10, barrelOD - 7)
  .rotate(-90, 0, 0).translate(0, muzzleY - barrelLen - 5, aimZ);
const cannon    = barrelOut.subtract(barrelIn).color(PVC_W);

const blowerBody = box(200, 165, 230)
  .translate(0, muzzleY - barrelLen - 85, aimZ).color(ORNG);

// Simple cannon cradle
const cradleH    = aimZ - barrelOD;
const cradlePost = cylinder(cradleH, 18)
  .translate(0, muzzleY - barrelLen * 0.5, 0).color(WOOD);
const cradleBase = box(180, 300, 20)
  .translate(0, muzzleY - barrelLen * 0.5, 10).color(WOOD);

// ── Chalkboard backdrop ────────────────────────────────────────────────────────
const chalkboard = box(900, 22, 1500)
  .translate(0, y3 + 115, 810).color(CHALK);

// ── Neon balls ────────────────────────────────────────────────────────────────
const ballFlight = sphere(ballR).translate(0, -200, aimZ).color(NEON);
const ballMid    = sphere(ballR).translate(25, y2 - 50, aimZ + 15).color(NEON);

// ── Assembly ──────────────────────────────────────────────────────────────────
const game = assembly("Whiffle Ball Bee Blast")
  .add("Chalkboard",    chalkboard)
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
  .add("Post FL",      fPost(-frameHW, yFront))
  .add("Post FR",      fPost( frameHW, yFront))
  .add("Post BL",      fPost(-frameHW, yBack))
  .add("Post BR",      fPost( frameHW, yBack))
  .add("Top F",        topBeamX(yFront))
  .add("Top B",        topBeamX(yBack))
  .add("Top L",        topBeamY(-frameHW))
  .add("Top R",        topBeamY( frameHW))
  .add("Pivot Beam F", pivBeamX(yFront))
  .add("Pivot Beam B", pivBeamX(yBack))
  .add("Base L",       baseBeamY(-frameHW))
  .add("Base R",       baseBeamY( frameHW))
  .add("Base F",       baseBeamX(yFront))
  .add("Base B",       baseBeamX(yBack))
  .add("Ball Ramp",    ramp)
  .add("Cannon",       cannon)
  .add("Blower",       blowerBody)
  .add("Cradle Post",  cradlePost)
  .add("Cradle Base",  cradleBase)
  .add("Ball 1",       ballFlight)
  .add("Ball 2",       ballMid);

return {
  model: game,
  camera: [-500, -900, 1200],
};
