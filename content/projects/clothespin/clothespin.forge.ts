// ═══════════════════════════════════════════════════════════════
// SPRING-LOADED CLOTHESPIN — Component-Based Design
// ═══════════════════════════════════════════════════════════════
//
// Three components, each visually described before being built.
//
// WHAT WORKED:
//   - Component decomposition with visual specs before geometry.
//   - bodyW > armDepth — the profiled dimension must be the TALL one.
//   - Sketch profile for arm silhouette (taper + deep V-notch).
//   - Spring coil + two visible legs for recognizable hardware.
//   - Mirror bottom arm so V-notch faces outward on both sides.
//
// WHAT DIDN'T WORK:
//   - armW > armT proportions (v2) — made arms wide and flat, hid the V-notch.
//   - Shallow V-notch (50% of 5mm = 2.5mm) — invisible. Need 60%+ of 11mm.
//   - Spring as just a hidden ring — too small, no legs, no visual weight.
//
// KEY PATTERN: Describe each component visually FIRST, then build it.
// "2D profile → extrude" for shaped wooden/plastic parts.

const armLen   = param("Arm Length", 72, { min: 50, max: 100, unit: "mm" });
const bodyW    = param("Body Width", 11, { min: 7, max: 16, unit: "mm" });
const armDepth = param("Arm Depth", 5, { min: 3, max: 8, unit: "mm" });
const openAmt  = param("Open", 0, { min: 0, max: 10, unit: "°" });

const pivotX   = armLen * 0.33;
const squeezeX = armLen - pivotX;
const wireR    = 0.8;

// ═══ COMPONENT 1: ARM ═══════════════════════════════════════
//
// Visual (side view — the defining silhouette):
//
//   SQUEEZE END (rightmost 8mm):
//     Two prongs ("ears") each 3mm wide, separated by a deep V-notch.
//     The V is 60% of body width deep — the most distinctive feature.
//     This is where you press to open the clothespin.
//
//   BODY (middle ~55%):
//     Full width (11mm), parallel edges. A 3mm round hole near the
//     pivot for the spring wire. Flat and clean.
//
//   PINCH TIP (leftmost ~35%):
//     Both edges converge to a narrow 1.5mm wedge. The outer edge
//     slopes steeply; the inner edge rises gently. The tip is where
//     fabric is gripped between the two arms.
//
// Cross-section: flat rectangle, armDepth (5mm) × bodyW (11mm).
// The TALL dimension (bodyW) is the profile; the THIN dimension
// (armDepth) is the extrusion depth.

const pinchT = bodyW * 0.14;           // tip narrowness: ~1.5mm
const earW   = 3;                       // width of each V-notch ear
const notchD = bodyW * 0.6;            // V-notch depth: 60% of body = ~6.6mm
const holeR  = 1.5;                     // spring hole radius

// Arm side profile (Sketch XY: X = length, Y = body width)
// Bottom edge = inner face. Top edge = outer face.
const taperX = -pivotX * 0.25;         // where body starts tapering to pinch

const profile = Sketch.begin(-pivotX, pinchT * 0.3)
  // ── inner face (bottom edge): mostly flat, slight rise at tip
  .lineTo(-pivotX + 6, 0)                                // bevel to flat
  .lineTo(squeezeX, 0)                                   // flat all the way to squeeze
  // ── squeeze end: up to full height
  .lineTo(squeezeX, bodyW)                                // right edge, full height
  // ── V-notch: symmetric ears with deep valley
  .lineTo(squeezeX - earW, bodyW - notchD)               // valley (centered)
  .lineTo(squeezeX - earW * 2, bodyW)                    // left ear peak
  // ── outer face (top edge): full width body section
  .lineTo(taperX, bodyW)                                  // body holds full width
  // ── taper to pinch: outer face slopes down sharply
  .lineTo(-pivotX + 6, pinchT * 0.9)                     // near tip
  .lineTo(-pivotX, pinchT)                                // pinch tip, top
  .close();

// Extrude for depth (along Z), then rotate so body width runs along Z-up
let armShape = profile.extrude(armDepth)
  .rotate(90, 0, 0)                    // profile Y → Z (tall), extrusion Z → -Y (thin)
  .translate(0, armDepth / 2, 0);      // center depth on Y=0

// Spring wire hole through arm near pivot (along Y)
const hole = cylinder(armDepth + 4, holeR, holeR, 20)
  .rotate(90, 0, 0)
  .translate(2, 0, bodyW * 0.55);      // slightly above center, near pivot

const arm = armShape.subtract(hole);

// ═══ COMPONENT 2: TORSION SPRING ════════════════════════════
//
// Visual:
//
//   COIL: A ring of wire wrapped around the pivot axis.
//     Axis runs along arm depth (Y direction). The ring sits in the
//     XZ plane, visible from front/back as a circle. Outer diameter
//     roughly matches arm body width so it's clearly visible against
//     the wood. Steel gray, darker than the wood.
//
//   LEGS: Two thin rods (~1.6mm square × 15mm long) extending from
//     the coil toward the squeeze end. One presses on each arm's
//     inner face, visible in the gap between the arms. These are
//     what provide the gripping force.

const halfGap  = wireR + 0.6;                       // clearance between inner faces
const coilIR   = bodyW * 0.32;                      // inner radius
const coilOR   = coilIR + wireR * 3;                // outer radius
const coilH    = armDepth * 0.45;                   // height along Y

const coil = cylinder(coilH, coilOR, coilOR, 32)
  .subtract(cylinder(coilH + 2, coilIR, coilIR, 32))
  .rotate(90, 0, 0)
  .color("#505050");

// Spring legs: thin rods from coil toward squeeze end
const legLen = squeezeX * 0.3;
const legW   = wireR * 2;
const legBox = box(legLen, legW, legW);

const topLeg = legBox
  .translate(legLen / 2 + 3, 0, halfGap * 0.4)
  .color("#505050");
const botLeg = legBox
  .translate(legLen / 2 + 3, 0, -halfGap * 0.4)
  .color("#505050");

// ═══ COMPONENT 3: ASSEMBLY ══════════════════════════════════
//
// Visual:
//
//   Two arms in mirror positions: top arm's V-notch faces up,
//   bottom arm's V-notch faces down. A narrow gap between their
//   inner faces holds the spring coil and legs.
//
//   CLOSED (Open=0): Pinch tips nearly touching. Squeeze ears
//   spread apart. Spring coil and legs visible at the pivot.
//
//   OPEN (Open>5): Pinch tips spread apart. Squeeze ears converge.
//
//   Lever mechanics: negative Y-rotation on top arm makes its
//   squeeze end rise and pinch end drop toward the bottom arm.

const gripAngle = (halfGap / pivotX) * (180 / Math.PI);
const netAngle  = gripAngle - openAmt * 0.5;

const topArm = arm
  .rotate(0, -netAngle, 0)
  .translate(0, 0, halfGap)
  .color("#c89860");                    // lighter wood

const botArm = arm
  .mirror([0, 0, 1])                   // V-notch faces down
  .rotate(0, netAngle, 0)
  .translate(0, 0, -halfGap)
  .color("#a67b50");                    // darker wood

const lift = halfGap + bodyW + 2;

return {
  model: assembly("Clothespin")
    .add("Top Arm",    topArm.translate(0, 0, lift))
    .add("Bottom Arm", botArm.translate(0, 0, lift))
    .add("Coil",       coil.translate(0, 0, lift))
    .add("Top Leg",    topLeg.translate(0, 0, lift))
    .add("Bottom Leg", botLeg.translate(0, 0, lift)),
  camera: [100, -80, 60]
};
