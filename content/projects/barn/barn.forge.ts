// Red barn with gambrel roof, white trim, X-brace doors, and windows
//
// Reference: barn_reference_image.png — classic American red barn
// Key features: red walls, white corner/base/roof trim, white X-brace
// double doors, hay loft door above, side windows, dark gray gambrel roof.
//
// Uses assembly() for multi-color parts (NOT .union().color()).

const barnW = param("Width", 80, { min: 50, max: 120, unit: "mm" });
const barnD = param("Depth", 60, { min: 40, max: 100, unit: "mm" });
const wallH = param("Wall Height", 40, { min: 25, max: 60, unit: "mm" });
const wallT = param("Wall Thickness", 3, { min: 2, max: 6, unit: "mm" });
const roofH = param("Roof Height", 22, { min: 10, max: 35, unit: "mm" });

const trimT  = 1.5;
const trimW  = 2.5;
const red    = "#8B2020";
const white  = "#F0EDE4";
const brown  = "#4A3020";
const gray   = "#5A5A5A";
const hw     = barnW / 2;
const hd     = barnD / 2;

// ═══ WALLS — hollow red box ═════════════════════════════════════

const outerWalls = box(barnW, barnD, wallH)
  .translate(0, 0, wallH / 2);
const innerCavity = box(barnW - wallT * 2, barnD - wallT * 2, wallH)
  .translate(0, 0, wallH / 2 + wallT);
let walls = outerWalls.subtract(innerCavity);

// ═══ DOORS — double doors with X-brace on front face ════════════

const doorW    = barnW * 0.32;
const doorH    = wallH * 0.72;
const doorGap  = 2;
const halfDoor = (doorW - doorGap) / 2;

// Cut door opening
const doorCut = box(doorW + 2, wallT + 4, doorH + 1)
  .translate(0, -hd, doorH / 2);
walls = walls.subtract(doorCut);

// Door panels + X-braces clipped to door bounds
function makeDoorWithBrace(w, h, xOff) {
  const panelY = -hd - 0.5;
  const panel = box(w, trimT, h)
    .translate(xOff, panelY, h / 2);

  // X-brace: intersect diagonals with a clipping box
  const clipBox = box(w, trimT + 2, h)
    .translate(xOff, panelY - 0.5, h / 2);

  const diagLen = Math.sqrt(w * w + h * h) * 1.2;
  const diagAngle = Math.atan2(h, w) * 180 / Math.PI;

  const d1 = box(diagLen, trimT + 0.5, trimW)
    .rotate(0, diagAngle, 0)
    .translate(xOff, panelY - 0.5, h / 2)
    .intersect(clipBox);
  const d2 = box(diagLen, trimT + 0.5, trimW)
    .rotate(0, -diagAngle, 0)
    .translate(xOff, panelY - 0.5, h / 2)
    .intersect(clipBox);

  // Horizontal mid-bar
  const midBar = box(w - 1, trimT + 0.5, trimW)
    .translate(xOff, panelY - 0.5, h / 2);

  return { panel, braces: d1.union(d2).union(midBar) };
}

const leftDoor = makeDoorWithBrace(halfDoor, doorH, -halfDoor / 2 - doorGap / 2);
const rightDoor = makeDoorWithBrace(halfDoor, doorH, halfDoor / 2 + doorGap / 2);

const doorPanels = leftDoor.panel.union(rightDoor.panel);
const doorBraces = leftDoor.braces.union(rightDoor.braces);

// ═══ HAY LOFT DOOR — small X-brace door above main doors ════════

const loftW = barnW * 0.20;
const loftH = wallH * 0.25;
const loftZ = doorH + (wallH - doorH) / 2;

const loftCut = box(loftW + 2, wallT + 4, loftH + 2)
  .translate(0, -hd, loftZ);
walls = walls.subtract(loftCut);

const loftPanel = box(loftW, trimT, loftH)
  .translate(0, -hd - 0.5, loftZ);

// Clipped loft X-brace
const loftClip = box(loftW, trimT + 2, loftH)
  .translate(0, -hd - 1, loftZ);
const loftDiagLen = Math.sqrt(loftW * loftW + loftH * loftH) * 1.2;
const loftAngle = Math.atan2(loftH, loftW) * 180 / Math.PI;
const loftB1 = box(loftDiagLen, trimT + 0.5, trimW * 0.7)
  .rotate(0, loftAngle, 0)
  .translate(0, -hd - 1, loftZ)
  .intersect(loftClip);
const loftB2 = box(loftDiagLen, trimT + 0.5, trimW * 0.7)
  .rotate(0, -loftAngle, 0)
  .translate(0, -hd - 1, loftZ)
  .intersect(loftClip);
const loftBraces = loftB1.union(loftB2);

// ═══ WINDOWS — side walls + front ═══════════════════════════════

const winW = 12;
const winH = 16;
const winZ = wallH * 0.45;

function makeWindowOnWall(x, y, onY) {
  // onY = true: window on Y-facing wall, onY = false: on X-facing wall
  const cutW = onY ? winW + 2 : wallT + 4;
  const cutD = onY ? wallT + 4 : winW + 2;
  const cut = box(cutW, cutD, winH + 2).translate(x, y, winZ);

  // Frame sits proud of exterior wall surface
  const fOff = onY
    ? (y > 0 ? wallT / 2 + 0.8 : -wallT / 2 - 0.8)
    : 0;
  const fOffX = !onY
    ? (x > 0 ? wallT / 2 + 0.8 : -wallT / 2 - 0.8)
    : 0;
  const fx = x + fOffX;
  const fy = y + fOff;

  // Outer frame — thick border
  const frameThick = 2;
  const outerW = onY ? winW + frameThick * 2 : trimT + 0.5;
  const outerD = onY ? trimT + 0.5 : winW + frameThick * 2;
  const outerFrame = box(outerW, outerD, winH + frameThick * 2)
    .translate(fx, fy, winZ);

  // Inner cutout in frame — creates the visible recess
  const innerW = onY ? winW : trimT + 2;
  const innerD = onY ? trimT + 2 : winW;
  const innerCut = box(innerW, innerD, winH)
    .translate(fx, fy, winZ);
  const frame = outerFrame.subtract(innerCut);

  // Cross panes — thicker dividers for visibility
  const paneT = 1.2;
  const hBarW = onY ? winW : paneT;
  const hBarD = onY ? paneT : winW;
  const hBar = box(hBarW, hBarD, paneT)
    .translate(fx, fy, winZ);
  const vBarW = onY ? paneT : trimT + 0.3;
  const vBarD = onY ? trimT + 0.3 : paneT;
  const vBar = box(vBarW, vBarD, winH)
    .translate(fx, fy, winZ);

  return { cut, frame: frame.union(hBar).union(vBar) };
}

// Side walls face ±X. Windows positioned along Y.
// makeWindowOnWall(x, y, onY): onY=false means cut along X, frame on X face
const sideWinSpacing = barnD * 0.28;
const rSide1 = makeWindowOnWall(hw, -sideWinSpacing, false);
const rSide2 = makeWindowOnWall(hw, sideWinSpacing, false);
const lSide1 = makeWindowOnWall(-hw, -sideWinSpacing, false);
const lSide2 = makeWindowOnWall(-hw, sideWinSpacing, false);

// Front gable: one window each side of door
const fWin1 = makeWindowOnWall(doorW / 2 + winW, -hd, true);
const fWin2 = makeWindowOnWall(-doorW / 2 - winW, -hd, true);

walls = walls
  .subtract(rSide1.cut).subtract(rSide2.cut)
  .subtract(lSide1.cut).subtract(lSide2.cut)
  .subtract(fWin1.cut).subtract(fWin2.cut);

const windowFrames = rSide1.frame.union(rSide2.frame)
  .union(lSide1.frame).union(lSide2.frame)
  .union(fWin1.frame).union(fWin2.frame);

// ═══ WHITE TRIM — corners, baseboard, top rail, door frame ══════

// 4 corner posts
const cornerPost = box(trimW, trimW, wallH);
const corners = cornerPost.translate(-hw, -hd, wallH / 2)
  .union(cornerPost.translate(hw, -hd, wallH / 2))
  .union(cornerPost.translate(-hw, hd, wallH / 2))
  .union(cornerPost.translate(hw, hd, wallH / 2));

// Baseboard stripe
const baseH = 3;
const baseFront = box(barnW + trimW, trimT, baseH)
  .translate(0, -hd - 0.5, baseH / 2);
const baseBack = box(barnW + trimW, trimT, baseH)
  .translate(0, hd + 0.5, baseH / 2);
const baseLeft = box(trimT, barnD, baseH)
  .translate(-hw - 0.5, 0, baseH / 2);
const baseRight = box(trimT, barnD, baseH)
  .translate(hw + 0.5, 0, baseH / 2);
const baseboard = baseFront.union(baseBack).union(baseLeft).union(baseRight);

// Top wall trim at roof junction
const topFront = box(barnW + trimW, trimT, trimW)
  .translate(0, -hd - 0.5, wallH);
const topBack = box(barnW + trimW, trimT, trimW)
  .translate(0, hd + 0.5, wallH);
const topTrim = topFront.union(topBack);

// Door frame trim
const doorFrameL = box(trimW, trimT + 1, doorH)
  .translate(-doorW / 2 - trimW / 2, -hd - 0.8, doorH / 2);
const doorFrameR = box(trimW, trimT + 1, doorH)
  .translate(doorW / 2 + trimW / 2, -hd - 0.8, doorH / 2);
const doorFrameTop = box(doorW + trimW * 2 + 2, trimT + 1, trimW)
  .translate(0, -hd - 0.8, doorH + trimW / 2);
const doorFrame = doorFrameL.union(doorFrameR).union(doorFrameTop);

// Loft frame trim
const loftFrameL = box(trimW * 0.8, trimT + 0.5, loftH + 2)
  .translate(-loftW / 2 - trimW / 2, -hd - 0.6, loftZ);
const loftFrameR = box(trimW * 0.8, trimT + 0.5, loftH + 2)
  .translate(loftW / 2 + trimW / 2, -hd - 0.6, loftZ);
const loftFrameTop = box(loftW + trimW * 2, trimT + 0.5, trimW * 0.8)
  .translate(0, -hd - 0.6, loftZ + loftH / 2 + trimW / 2);
const loftFrame = loftFrameL.union(loftFrameR).union(loftFrameTop);

const allTrim = corners.union(baseboard).union(topTrim)
  .union(doorFrame).union(loftFrame);

// ═══ GAMBREL ROOF — steeper lower slope, generous overhang ═══════

const overhang = 6;
const rhw = barnW / 2 + overhang;
const kneeH = roofH * 0.6;           // higher knee = steeper lower slope
const kneeW = barnW * 0.25;          // narrower knee = more dramatic break
const roofProfile = Sketch.begin(-rhw, 0)
  .lineTo(-kneeW, kneeH)             // steep lower-left
  .lineTo(0, roofH)                   // shallow upper-left to peak
  .lineTo(kneeW, kneeH)              // shallow upper-right
  .lineTo(rhw, 0)                     // steep lower-right
  .close();

const roofDepth = barnD + overhang * 2;
const roof = roofProfile.extrude(roofDepth)
  .rotate(90, 0, 0)
  .translate(0, roofDepth / 2, wallH);

// Roof fascia trim — white boards along eaves (bottom edges)
const fasciaT = 2;
// Front eave
const eaveFront = box(barnW + overhang * 2, fasciaT, fasciaT)
  .translate(0, -roofDepth / 2, wallH + fasciaT / 2);
// Back eave
const eaveBack = box(barnW + overhang * 2, fasciaT, fasciaT)
  .translate(0, roofDepth / 2, wallH + fasciaT / 2);
// Side eaves along the bottom roof slope (left and right)
const eaveLen = Math.sqrt(overhang * overhang + kneeH * kneeH) + 2;
const eaveAngle = Math.atan2(kneeH, (rhw - kneeW)) * 180 / Math.PI;
const eaveRight = box(eaveLen, roofDepth, fasciaT)
  .rotate(0, eaveAngle, 0)
  .translate(rhw * 0.65, 0, wallH + kneeH * 0.3);
const eaveLeft = box(eaveLen, roofDepth, fasciaT)
  .rotate(0, -eaveAngle, 0)
  .translate(-rhw * 0.65, 0, wallH + kneeH * 0.3);

// Gable rake trim — white boards along roof slope on gable ends
// Front gable: follows the roof profile outline
const rakeFrontLower = box(fasciaT, fasciaT, Math.sqrt((rhw - kneeW) * (rhw - kneeW) + kneeH * kneeH))
  .rotate(0, 0, 0)
  .rotate(0, -Math.atan2(rhw - kneeW, kneeH) * 180 / Math.PI, 0)
  .translate((rhw + kneeW) / 2, -roofDepth / 2 + fasciaT / 2, wallH + kneeH / 2);
const rakeFrontUpper = box(fasciaT, fasciaT, Math.sqrt(kneeW * kneeW + (roofH - kneeH) * (roofH - kneeH)))
  .rotate(0, -Math.atan2(kneeW, roofH - kneeH) * 180 / Math.PI, 0)
  .translate(kneeW / 2, -roofDepth / 2 + fasciaT / 2, wallH + (kneeH + roofH) / 2);
const rakeFrontR = rakeFrontLower.union(rakeFrontUpper);
const rakeFrontL = rakeFrontR.mirror([1, 0, 0]);

const roofFascia = eaveFront.union(eaveBack)
  .union(rakeFrontR).union(rakeFrontL);

// ═══ ASSEMBLY ════════════════════════════════════════════════════

return assembly("Barn")
  .add("Walls", walls.color(red))
  .add("Roof", roof.color(gray))
  .add("Door Panels", doorPanels.color(brown))
  .add("Door X-Braces", doorBraces.color(white))
  .add("Loft Door", loftPanel.color(brown))
  .add("Loft Braces", loftBraces.color(white))
  .add("Windows", windowFrames.color(white))
  .add("Trim", allTrim.color(white))
  .add("Roof Fascia", roofFascia.color(white));
