// Measuring Scoop — cup-shaped bowl with tapered handle
//
// A kitchen measuring scoop: round cup with flat bottom for stability,
// tapered handle attached at the rim. Revolve for the bowl, simple
// tapered box for the handle.

const bowlD     = param("Bowl Diameter", 40, { min: 25, max: 60, unit: "mm" });
const bowlDepth = param("Bowl Depth", 22, { min: 12, max: 35, unit: "mm" });
const wallT     = param("Wall Thickness", 1.8, { min: 1.2, max: 3, unit: "mm" });
const handleL   = param("Handle Length", 55, { min: 30, max: 80, unit: "mm" });
const handleW   = param("Handle Width", 14, { min: 8, max: 20, unit: "mm" });
const handleT   = param("Handle Thickness", 4, { min: 2.5, max: 6, unit: "mm" });

const outerR = bowlD / 2;
const innerR = outerR - wallT;
const flatR  = outerR * 0.4;

// ── Bowl (revolved profile) ──────────────────────────────────────────
const outerProfile = Sketch.begin(0, 0)
  .lineTo(flatR, 0)
  .lineTo(outerR * 0.7, bowlDepth * 0.12)
  .lineTo(outerR * 0.92, bowlDepth * 0.45)
  .lineTo(outerR, bowlDepth * 0.8)
  .lineTo(outerR, bowlDepth)
  .lineTo(0, bowlDepth)
  .lineTo(0, 0)
  .close();

const outerBowl = outerProfile.revolve(48);

const innerFlatR = Math.max(flatR - wallT, 1);
const innerTop   = bowlDepth - wallT;
const innerProfile = Sketch.begin(0, wallT)
  .lineTo(innerFlatR, wallT)
  .lineTo(innerR * 0.7, wallT + innerTop * 0.12)
  .lineTo(innerR * 0.92, wallT + innerTop * 0.45)
  .lineTo(innerR, wallT + innerTop * 0.8)
  .lineTo(innerR, bowlDepth + 2)
  .lineTo(0, bowlDepth + 2)
  .lineTo(0, wallT)
  .close();

const innerCavity = innerProfile.revolve(48);
const bowl = outerBowl.subtract(innerCavity);

// ── Handle ───────────────────────────────────────────────────────────
// Starts at the bowl outer wall and extends along +X.
// Side profile: sketch in XZ showing the taper from thick (bowl end)
// to thin (grip end), positioned at rim height.

const handleStartX = outerR - 2;  // overlap slightly into bowl wall
const handleEndX   = handleStartX + handleL;
const handleTopZ   = bowlDepth;
const handleBotZ   = bowlDepth - handleT;
const tipT         = handleT * 0.6;
const tipBotZ      = bowlDepth - tipT;

// Side profile (XZ plane) — viewed from the side
const handleSideProfile = Sketch.begin(handleStartX, handleBotZ)
  .lineTo(handleEndX, tipBotZ)           // bottom edge tapers up
  .lineTo(handleEndX, handleTopZ)        // tip top
  .lineTo(handleStartX, handleTopZ)      // junction top (at rim)
  .lineTo(handleStartX, handleBotZ)      // back to start
  .close();

// Extrude in Y direction for the width, then center
const handleRaw = handleSideProfile.extrude(handleW)
  .translate(0, 0, -handleW / 2)   // center on Y after extrude (extrude goes +Z)
  .rotate(90, 0, 0);               // rotate so Z-extrusion becomes Y-width

// Cut away the part inside the bowl cavity so no artifact shows inside
const bowlCarve = cylinder(bowlDepth * 3, innerR - 0.5)
  .translate(0, 0, bowlDepth / 2);
const handle = handleRaw.subtract(bowlCarve);

// Taper the width: narrower at the tip, wider at the bowl
const tipW = handleW * 0.65;
const taperAmount = (handleW - tipW) / 2;
const taperAngle = Math.atan2(taperAmount, handleL) * 180 / Math.PI;

// Cut wedges from +Y and -Y sides
const wedge = box(handleL * 1.5, handleW, handleT * 3);
const topWedge = wedge
  .rotate(0, 0, taperAngle)
  .translate(handleEndX - handleL * 0.2, handleW * 0.75, bowlDepth - handleT / 2);
const botWedge = wedge
  .rotate(0, 0, -taperAngle)
  .translate(handleEndX - handleL * 0.2, -handleW * 0.75, bowlDepth - handleT / 2);

const handleTapered = handle
  .subtract(topWedge)
  .subtract(botWedge);

// ── Assembly ─────────────────────────────────────────────────────────
return {
  model: assembly("Measuring Scoop")
    .add("Bowl", bowl.color("#e8e0d0"))
    .add("Handle", handleTapered.color("#d4c9b5")),
  camera: [60, -40, 50]
};
