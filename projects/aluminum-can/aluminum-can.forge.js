// Aluminum Beverage Can — 12oz standard
// Clean primitives for the body (cylinder + cone), revolve only for the
// bottom dome. Assembly keeps body, lid, and tab as distinct colored parts.
//
// KEY SHAPE FEATURES:
//   - Tall cylinder body (~66mm dia × 115mm tall)
//   - Concave dome on bottom (pressure resistance)
//   - Tapered shoulder: body radius → neck radius
//   - Rolled rim at top edge
//   - Recessed lid with pull tab and drink opening

const canR   = param("Can Radius", 33, { min: 25, max: 45, unit: "mm" });
const canH   = param("Can Height", 115, { min: 80, max: 160, unit: "mm" });
const wallT  = param("Wall Thickness", 1.5, { min: 1, max: 3, unit: "mm" });
const neckR  = param("Neck Radius", 27, { min: 20, max: 40, unit: "mm" });

// Derived
const shoulderH = canR * 0.35;
const rimT      = wallT * 2.5;
const rimH      = 3;
const bodyH     = canH - shoulderH - rimH;
const topZ      = canH;
const liftZ     = 3;  // above grid

// ═══ BODY — Primitives (no revolve artifacts) ═══════════════════
//
// Build from: cylinder (body) + truncated cone (shoulder) + rim ring.
// Then hollow by subtracting an inner cylinder + cone.

// Outer body cylinder
const outerBody = cylinder(bodyH, canR, canR, 64);

// Outer shoulder — truncated cone
const outerShoulder = cylinder(shoulderH, canR, neckR, 64)
  .translate(0, 0, bodyH / 2 + shoulderH / 2);

// Rim — thick ring at top
const rimOuter = cylinder(rimH, neckR + rimT / 2, neckR + rimT / 2, 64)
  .translate(0, 0, bodyH / 2 + shoulderH + rimH / 2);

// Combine outer shell
let outerShell = outerBody
  .union(outerShoulder)
  .union(rimOuter);

// Inner cavity — slightly smaller cylinder + cone
const innerBody = cylinder(bodyH + 2, canR - wallT, canR - wallT, 64)
  .translate(0, 0, wallT);
const innerShoulder = cylinder(shoulderH + 2, canR - wallT, neckR - wallT, 64)
  .translate(0, 0, bodyH / 2 + shoulderH / 2);

let innerCavity = innerBody.union(innerShoulder);

// Hollow out
let canShell = outerShell.subtract(innerCavity);

// ═══ BOTTOM DOME — concave for pressure ═════════════════════════
// Dome pushes inward from the flat bottom. Revolved arc profile.

const domeDepth = canR * 0.12;
const domeR     = canR - 2;  // slightly smaller than body

const domeProfile = Sketch.begin(0, 0)
  .lineTo(domeR, 0)
  .lineTo(domeR, domeDepth)
  .lineTo(domeR * 0.6, domeDepth * 0.8)
  .lineTo(domeR * 0.2, domeDepth * 0.3)
  .lineTo(0, 0)
  .close();

const domeAdd = domeProfile.revolve(48)
  .translate(0, 0, -bodyH / 2);

canShell = canShell.union(domeAdd);

// Lift above grid
canShell = canShell.translate(0, 0, bodyH / 2 + liftZ);

// ═══ LID — recessed disc ════════════════════════════════════════

const lidT = 1.5;
const lidR = neckR - rimT / 2 - 0.3;
const lidZ = topZ + liftZ - lidT - 0.5;

const lid = cylinder(lidT, lidR, lidR, 64)
  .translate(0, 0, lidZ);

// ═══ DRINK OPENING — kidney-shaped ══════════════════════════════

const openingR  = 8;
const openingCutter = cylinder(lidT + 4, openingR, openingR, 32)
  .scale(1.3, 0.8, 1)
  .translate(neckR * 0.3, 0, lidZ);

const lidWithOpening = lid.subtract(openingCutter);

// ═══ PULL TAB ════════════════════════════════════════════════════

const tabLen  = neckR * 1.0;
const tabW    = 11;
const tabT    = 1;
const tabZ    = lidZ + lidT;
const halfW   = tabW / 2;
const rearX   = -tabLen * 0.25;
const frontX  = tabLen * 0.75;

const tabProfile = Sketch.begin(rearX + 2, -halfW)
  .lineTo(frontX - 3, -halfW)
  .lineTo(frontX, -halfW + 3)
  .lineTo(frontX, halfW - 3)
  .lineTo(frontX - 3, halfW)
  .lineTo(rearX + 2, halfW)
  .lineTo(rearX, halfW - 2)
  .lineTo(rearX, -halfW + 2)
  .close();

let tabBody = tabProfile.extrude(tabT);

// Finger hole
const fingerHole = cylinder(tabT + 4, 4, 4, 24)
  .scale(1.3, 0.8, 1)
  .translate(frontX - 7, 0, 0);
tabBody = tabBody.subtract(fingerHole);

// Rivet
const rivet = cylinder(tabT * 0.7, 2.2, 2.2, 16)
  .translate(rearX + 5, 0, tabT);
tabBody = tabBody.union(rivet);

const tab = tabBody
  .rotate(4, 0, 0)
  .translate(0, 0, tabZ);

// ═══ ASSEMBLY ════════════════════════════════════════════════════

return assembly("Aluminum Can")
  .add("Body", canShell.color("#c0c0c8"))
  .add("Lid", lidWithOpening.color("#a0a0a8"))
  .add("Pull Tab", tab.color("#d0d0d8"));
