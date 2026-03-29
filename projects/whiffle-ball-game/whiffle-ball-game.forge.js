// Whiffle Ball Carnival Shooter — v2: spinning disc stack on central axis
//
// 3 vertical plexiglass discs counter-rotate on a central alignment shaft.
// Friction-drive: two bottom roller shafts carry rubber wheels; one shaft
// is powered by a hand drill. Adjacent discs reverse direction via roller geometry.
//
// Pattern progression (front → back = easy → hard):
//   Disc 1: Ring  — 6 circles at r=175mm, generous clearance
//   Disc 2: Clover — 4 large petal holes, moderate
//   Disc 3: Hex-spoke — 6 narrow openings, tight clearance

const discR   = param("Disc Radius",    275, { min: 200, max: 350, unit: "mm" });
const discT   = param("Disc Thickness",   8, { min:   6, max:  12, unit: "mm" });
const spacing = param("Disc Spacing",   165, { min: 120, max: 250, unit: "mm" });
const ballR   = param("Ball Radius",     38, { min:  30, max:  45, unit: "mm" });

// Disc center height from floor (Z)
const discCZ = 1000;

const PLEXI1 = "#BCEEFF";  // front disc — lightest
const PLEXI2 = "#80CCEE";  // mid disc
const PLEXI3 = "#44AADD";  // back disc — darkest / hardest
const CHALK  = "#0D0D0D";
const WOOD   = "#C8A060";
const STEEL  = "#909090";
const RUBBER = "#252525";
const NEON   = "#CCFF00";
const ORNG   = "#E87020";
const PVC_W  = "#ECECEC";

// ── Disc-plane helpers ────────────────────────────────────────────────────────
// Discs are vertical in the XZ plane, normal along Y.
// Shooter aims along +Y; disc faces shooter at -Y.

// Flat disc (cylinder with axis along Y), centered at (0, yPos, discCZ)
function flatDisc(r, h, yPos) {
  return cylinder(h, r)
    .rotate(-90, 0, 0)
    .translate(0, yPos - h / 2, discCZ);
}

// Cylindrical hole cutter through disc at yPos, offset (dx, dz) in XZ disc plane
function discHole(holeR, yPos, dx, dz) {
  const h = discT + 14;
  return cylinder(h, holeR)
    .rotate(-90, 0, 0)
    .translate(dx, yPos - h / 2, discCZ + dz);
}

// Rectangular spoke bar through disc center, rotated angleDeg around Y (in XZ plane)
function spokeBar(yPos, sw, angleDeg) {
  return box(discR * 2, discT, sw)
    .rotate(0, angleDeg, 0)
    .translate(0, yPos, discCZ);
}

// ── Disc 1: Ring pattern ──────────────────────────────────────────────────────
// 6 generous holes in a ring at r=175mm + shaft clearance hole at center
function makeDisc1(yPos) {
  let d = flatDisc(discR, discT, yPos);
  d = d.subtract(discHole(32, yPos, 0, 0));  // center (shaft clearance)
  for (let i = 0; i < 6; i++) {
    const a = (i * 60) * Math.PI / 180;
    d = d.subtract(discHole(52, yPos, 175 * Math.cos(a), 175 * Math.sin(a)));
  }
  return d.color(PLEXI1);
}

// ── Disc 2: Clover pattern ────────────────────────────────────────────────────
// 4 large overlapping holes on ±X and ±Z axes; petals merge near center
function makeDisc2(yPos) {
  let d = flatDisc(discR, discT, yPos);
  for (const [dx, dz] of [[115,0],[-115,0],[0,115],[0,-115]]) {
    d = d.subtract(discHole(78, yPos, dx, dz));
  }
  d = d.subtract(discHole(28, yPos, 0, 0));  // center (shaft clearance)
  return d.color(PLEXI2);
}

// ── Disc 3: Hex-spoke pattern ─────────────────────────────────────────────────
// 3 spoke bars (creating 6 spokes) + hub + outer rim. Tightest clearance.
function makeDisc3(yPos) {
  const rimW = 40, hubR = 50, sw = 52;

  // Rim: annular ring at outer edge
  const outerDisc = flatDisc(discR, discT, yPos);
  const innerCut  = flatDisc(discR - rimW, discT + 14, yPos);
  const rim       = outerDisc.subtract(innerCut);

  // Hub + 3 spoke bars (clipped to disc boundary so spokes don't overshoot)
  const hub  = flatDisc(hubR, discT, yPos);
  const bars = hub
    .union(spokeBar(yPos, sw, 0))
    .union(spokeBar(yPos, sw, 60))
    .union(spokeBar(yPos, sw, 120))
    .intersect(flatDisc(discR, discT, yPos));

  return rim.union(bars).color(PLEXI3);
}

// ── Disc positions (Y = depth from shooter) ───────────────────────────────────
const y1 = 0;
const y2 = spacing;
const y3 = spacing * 2;

const disc1 = makeDisc1(y1);
const disc2 = makeDisc2(y2);
const disc3 = makeDisc3(y3);

// ── Shafts ────────────────────────────────────────────────────────────────────
const shaftLen = y3 + 320;  // spans all discs + overhang each end
const shaftY0  = -130;       // shaft front end (in front of disc 1)

// Central shaft — alignment only, does not drive rotation
const centralShaft = cylinder(shaftLen, 16)
  .rotate(-90, 0, 0)
  .translate(0, shaftY0, discCZ)
  .color(STEEL);

// Two bottom roller shafts — one powered by hand drill
// Positioned so rubber wheels contact disc rim from below at ~±130mm X
const rollerWR  = 40;    // rubber wheel radius
const rollerXO  = 130;   // X offset of roller shafts from center
// Z: contact point on disc arc at X=±rollerXO, minus wheel radius
const rollerZ   = discCZ - Math.sqrt(discR * discR - rollerXO * rollerXO) - rollerWR;

const rollerShaftL = cylinder(shaftLen, 12)
  .rotate(-90, 0, 0)
  .translate(-rollerXO, shaftY0, rollerZ)
  .color(STEEL);

const rollerShaftR = cylinder(shaftLen, 12)
  .rotate(-90, 0, 0)
  .translate( rollerXO, shaftY0, rollerZ)
  .color(STEEL);

// Rubber drive wheels at each disc position on both roller shafts
const rollerWW = 30;  // wheel width (along Y)
function rollerWheel(discY, sx) {
  return cylinder(rollerWW, rollerWR)
    .rotate(-90, 0, 0)
    .translate(sx, discY - rollerWW / 2, rollerZ)
    .color(RUBBER);
}

// ── Frame (2×4 lumber aesthetic) ──────────────────────────────────────────────
const frameHW  = discR + 90;           // half-width: 365mm
const frameTop = discCZ + discR + 120; // ~1395mm
const yFront   = shaftY0 - 20;        // -150mm
const yBack    = y3 + 140;            // ~470mm
const pSz      = 45;                   // post cross-section

function fPost(x, y) {
  return box(pSz, pSz, frameTop)
    .translate(x, y, frameTop / 2)
    .color(WOOD);
}
function topBeamX(y) {
  return box(frameHW * 2 + pSz, pSz, pSz)
    .translate(0, y, frameTop)
    .color(WOOD);
}
function topBeamY(x) {
  return box(pSz, yBack - yFront + pSz, pSz)
    .translate(x, (yFront + yBack) / 2, frameTop)
    .color(WOOD);
}
function baseBeamY(x) {
  return box(pSz, yBack - yFront + pSz, pSz)
    .translate(x, (yFront + yBack) / 2, pSz / 2)
    .color(WOOD);
}

// ── Drill coupling on powered roller shaft (right, front end) ─────────────────
const drillExtend = cylinder(90, 12)
  .rotate(-90, 0, 0)
  .translate(rollerXO, shaftY0 - 90, rollerZ)
  .color(STEEL);

const drillBody = box(120, 100, 190)
  .translate(rollerXO, shaftY0 - 145, rollerZ)
  .color(ORNG);

// ── PVC cannon — horizontal, aimed at disc center height ─────────────────────
const barrelLen = 550;
const barrelOD  = 44;
const muzzleY   = -115;

const barrelOuter = cylinder(barrelLen, barrelOD)
  .rotate(-90, 0, 0)
  .translate(0, muzzleY - barrelLen, discCZ);
const barrelInner = cylinder(barrelLen + 10, barrelOD - 7)
  .rotate(-90, 0, 0)
  .translate(0, muzzleY - barrelLen - 5, discCZ);
const cannon = barrelOuter.subtract(barrelInner).color(PVC_W);

// V-notch cradle stand for cannon
const cradleY = muzzleY - barrelLen * 0.55;
const cradlePostH = discCZ - barrelOD;
const cradlePost = cylinder(cradlePostH, 18)
  .translate(0, cradleY, 0)
  .color(WOOD);
const cradleBase = box(180, 320, 20)
  .translate(0, cradleY, 10)
  .color(WOOD);

// Leaf blower body (attached to cannon breech)
const blowerBody = box(210, 170, 235)
  .translate(0, muzzleY - barrelLen - 90, discCZ)
  .color(ORNG);

// ── Chalkboard backdrop ────────────────────────────────────────────────────────
const chalkboard = box(880, 22, 1480)
  .translate(0, y3 + 112, 810)
  .color(CHALK);

// ── Neon balls for scale and drama ────────────────────────────────────────────
const ballInFlight = sphere(ballR)
  .translate(0, -220, discCZ)
  .color(NEON);

const ballMid = sphere(ballR)
  .translate(15, y2 - 55, discCZ + 25)
  .color(NEON);

// ── Assembly ──────────────────────────────────────────────────────────────────
const game = assembly("Whiffle Ball Cannon Game")
  .add("Chalkboard",     chalkboard)
  .add("Disc 1 Ring",   disc1)
  .add("Disc 2 Clover", disc2)
  .add("Disc 3 Spoke",  disc3)
  .add("Central Shaft", centralShaft)
  .add("Roller Shaft L", rollerShaftL)
  .add("Roller Shaft R", rollerShaftR)
  .add("Wheel 1L", rollerWheel(y1, -rollerXO))
  .add("Wheel 1R", rollerWheel(y1,  rollerXO))
  .add("Wheel 2L", rollerWheel(y2, -rollerXO))
  .add("Wheel 2R", rollerWheel(y2,  rollerXO))
  .add("Wheel 3L", rollerWheel(y3, -rollerXO))
  .add("Wheel 3R", rollerWheel(y3,  rollerXO))
  .add("Post FL",   fPost(-frameHW, yFront))
  .add("Post FR",   fPost( frameHW, yFront))
  .add("Post BL",   fPost(-frameHW, yBack))
  .add("Post BR",   fPost( frameHW, yBack))
  .add("Top F",     topBeamX(yFront))
  .add("Top B",     topBeamX(yBack))
  .add("Top L",     topBeamY(-frameHW))
  .add("Top R",     topBeamY( frameHW))
  .add("Base L",    baseBeamY(-frameHW))
  .add("Base R",    baseBeamY( frameHW))
  .add("Cannon",    cannon)
  .add("Cradle Post", cradlePost)
  .add("Cradle Base", cradleBase)
  .add("Blower",    blowerBody)
  .add("Drill Ext", drillExtend)
  .add("Drill",     drillBody)
  .add("Ball 1",    ballInFlight)
  .add("Ball 2",    ballMid);

return {
  model: game,
  camera: [-650, -1000, 1300],
};
