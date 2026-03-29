// Whiffle Ball Carnival Shooter — cadlad forge
// Leaf blower PVC cannon fires 3" whiffle balls through layered plexiglass panels
// Front panels: wide holes → back panels: tight holes = scaled depth & difficulty
// Black chalkboard backdrop for neon ball contrast + chalk marker artwork

const panelW   = param("Panel Width",    610, { min: 400, max: 800,  unit: "mm" });
const panelH   = param("Panel Height",  1220, { min: 800, max: 1600, unit: "mm" });
const panelT   = param("Panel Thickness", 10, { min:   6, max:   16, unit: "mm" });
const layerGap = param("Layer Gap",      152, { min: 100, max: 300,  unit: "mm" }); // 6"
const ballR    = param("Ball Radius",     38, { min:  30, max:   45, unit: "mm" }); // 3" ball

const PLEXI = "#AADDF5";  // pale blue — clear plexiglass tint
const CHALK = "#0D0D0D";  // near-black chalkboard
const STEEL = "#909090";  // aluminum frame
const NEON  = "#CCFF00";  // neon yellow-green ball
const PVC_W = "#E8E8E8";  // white PVC pipe
const ORNG  = "#E87020";  // leaf blower orange

// Hole radii per panel (front = generous/easy, back = tight/hard)
// Ball dia = 76mm; front = 164mm clear, mid = 108mm, back = 88mm (6mm clearance/side)
const hR = [82, 54, 44];

// Build a plexiglass panel with 4 holes in 2×2 grid, panel normal along Y
function makePanel(holeRad, yPos) {
  let p = box(panelW, panelT, panelH).translate(0, yPos, panelH / 2);

  const ox = panelW * 0.265;  // ±162mm horizontal offset
  const oz = panelH * 0.215;  // ±263mm vertical offset

  // Long cutter along +Y axis, centered on the panel's Y position
  const cutLen = panelT + 60;
  for (const dx of [-ox, ox]) {
    for (const dz of [-oz, oz]) {
      const cut = cylinder(cutLen, holeRad)
        .rotate(-90, 0, 0)                              // Z → +Y
        .translate(dx, yPos - cutLen / 2, panelH / 2 + dz); // centered at yPos
      p = p.subtract(cut);
    }
  }
  return p.color(PLEXI);
}

// Three plexiglass panels — front (easy) to back (hard)
const frontPanel = makePanel(hR[0], 0);
const midPanel   = makePanel(hR[1], layerGap);
const backPanel  = makePanel(hR[2], layerGap * 2);

// Black chalkboard backdrop — slightly wider/taller for full coverage
const chalkboard = box(panelW + 120, 22, panelH + 180)
  .translate(0, layerGap * 2 + 95, panelH / 2 - 60)
  .color(CHALK);

// Frame — 4 corner posts + top perimeter rails
const postSz  = 40;
const postHgt = panelH + 140;
const pxOff   = panelW / 2 + postSz / 2 + 8; // 333mm from center
const pyFront = -(postSz + 8);               // -48mm
const pyBack  = layerGap * 2 + postSz + 8;  // 352mm

function vPost(x, y) {
  return box(postSz, postSz, postHgt)
    .translate(x, y, postHgt / 2)
    .color(STEEL);
}

// Front/back horizontal top rails
function topRailX(y) {
  const w = panelW + postSz * 2 + 16;
  return box(w, postSz, postSz)
    .translate(0, y, postHgt)
    .color(STEEL);
}

// Left/right side top rails
function topRailY(x) {
  const d = pyBack - pyFront + postSz;
  return box(postSz, d, postSz)
    .translate(x, (pyFront + pyBack) / 2, postHgt)
    .color(STEEL);
}

// Horizontal cross-rail at mid-height to hold panels (one per panel row)
function midRail(x, yPos) {
  const d = pyBack - pyFront + postSz;
  return box(postSz, d, postSz)
    .translate(x, (pyFront + pyBack) / 2, panelH / 2)
    .color(STEEL);
}

// PVC cannon — 600mm barrel, 96mm OD (~3.5" nominal pipe), aims at panel center height
const barrelLen = 600;
const barrelOD  = 48;        // radius = 48mm → 96mm OD
const muzzleY   = -120;      // muzzle sits 120mm in front of front panel (Y=0)
const breezeY   = muzzleY - barrelLen;  // -720mm
const cannonZ   = panelH * 0.50;       // aimed at panel mid-height

// Barrel: after rotate(-90,0,0) cylinder is along +Y, translate so Y=[breezeY, muzzleY]
const barrel = cylinder(barrelLen, barrelOD)
  .rotate(-90, 0, 0)
  .translate(0, breezeY, cannonZ)
  .color(PVC_W);

// Barrel hollow (thin PVC wall)
const barrelInner = cylinder(barrelLen + 20, barrelOD - 8)
  .rotate(-90, 0, 0)
  .translate(0, breezeY - 10, cannonZ);
const hollowBarrel = barrel.subtract(barrelInner).color(PVC_W);

// Cannon stand post under barrel midpoint
const standMidY = (muzzleY + breezeY) / 2; // -420mm
const standH    = cannonZ - barrelOD;
const standPost = cylinder(standH, 18)
  .translate(0, standMidY, 0)
  .color(STEEL);

const standBase = box(200, 400, 20)
  .translate(0, standMidY, 10)
  .color(STEEL);

// Leaf blower body (attached at cannon breech end)
const blowerBody = box(200, 160, 230)
  .translate(0, breezeY - 80, cannonZ)
  .color(ORNG);

const blowerHandle = box(40, 40, 200)
  .translate(60, breezeY - 80, cannonZ - 160)
  .color(ORNG);

// Whiffle balls — one in flight, one near mid-panel for scale
const ballFlight = sphere(ballR)
  .translate(0, -220, cannonZ)
  .color(NEON);

const ballNearMid = sphere(ballR)
  .translate(hR[0] * 0.4, layerGap * 0.65, panelH / 2 + hR[1] * 0.4)
  .color(NEON);

const game = assembly("Whiffle Ball Cannon Game")
  .add("Chalkboard",   chalkboard)
  .add("Back Panel",   backPanel)
  .add("Mid Panel",    midPanel)
  .add("Front Panel",  frontPanel)
  .add("Post FL",      vPost(-pxOff, pyFront))
  .add("Post FR",      vPost( pxOff, pyFront))
  .add("Post BL",      vPost(-pxOff, pyBack))
  .add("Post BR",      vPost( pxOff, pyBack))
  .add("Top Rail F",   topRailX(pyFront))
  .add("Top Rail B",   topRailX(pyBack))
  .add("Top Rail L",   topRailY(-pxOff))
  .add("Top Rail R",   topRailY( pxOff))
  .add("Cannon",       hollowBarrel)
  .add("Stand Post",   standPost)
  .add("Stand Base",   standBase)
  .add("Blower Body",  blowerBody)
  .add("Blower Handle", blowerHandle)
  .add("Ball Flight",  ballFlight)
  .add("Ball Near Mid", ballNearMid);

return {
  model: game,
  camera: [-700, -1100, 900],
};
