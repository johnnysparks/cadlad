// DeWalt-style battery push mower — detailed multi-part assembly
//
// IMPROVEMENTS OVER V1:
//   - Assembly with per-part colors (yellow deck, black housing, silver handle)
//   - Larger rear wheels, smaller front casters (like a real mower)
//   - Angled handle bars with ergonomic grip
//   - Battery pack + motor housing detail
//   - Grass collection bag at rear
//   - Blade disc under deck
//   - Wheel hub details and axle cylinders
//   - Front bumper / deck lip in accent color

const deckW = param("Deck Width", 52, { min: 40, max: 65, unit: "mm" });
const deckD = param("Deck Depth", 48, { min: 35, max: 60, unit: "mm" });
const rearWheelR = param("Rear Wheel Radius", 10, { min: 7, max: 14, unit: "mm" });
const handleH = param("Handle Height", 55, { min: 35, max: 70, unit: "mm" });

// Derived dimensions
const frontWheelR = rearWheelR * 0.6;
const deckH = 6;
const deckZ = rearWheelR + 2; // clearance above ground
const wheelWidth = 4;
const hubR = 2.5;

// Colors
const YELLOW = "#e8b818";
const BLACK = "#1a1a1a";
const DARK_GRAY = "#333333";
const SILVER = "#a8a8a8";
const GRIP_BLACK = "#222222";
const TIRE_BLACK = "#2a2a2a";

// ── DECK ─────────────────────────────────────────────
// Main deck body — low profile housing
const deckBody = roundedRect(deckW, deckD, 4, deckH)
  .translate(0, 0, deckZ)
  .color(BLACK);

// Yellow front bumper lip — wraps around the front edge
const bumperH = 4;
const bumper = roundedRect(deckW + 2, 6, 3, bumperH)
  .translate(0, -deckD / 2 + 2, deckZ - deckH / 2 + bumperH / 2)
  .color(YELLOW);

// Yellow accent stripe along the deck sides (bottom edge)
const sideStripeL = box(2, deckD - 8, 3)
  .translate(-deckW / 2 + 1, 0, deckZ - deckH / 2 + 1.5)
  .color(YELLOW);
const sideStripeR = box(2, deckD - 8, 3)
  .translate(deckW / 2 - 1, 0, deckZ - deckH / 2 + 1.5)
  .color(YELLOW);

// ── BLADE HOUSING (underneath) ───────────────────────
const bladeHousing = cylinder(2.5, deckW / 2 - 4)
  .translate(0, -2, deckZ - deckH / 2 - 1)
  .color(DARK_GRAY);

// Blade disc
const blade = cylinder(1, deckW / 2 - 8)
  .translate(0, -2, deckZ - deckH / 2 - 2)
  .color(SILVER);

// ── MOTOR HOUSING ────────────────────────────────────
const motorW = deckW * 0.5;
const motorD = deckD * 0.45;
const motorH = 7;
const motorZ = deckZ + deckH / 2 + motorH / 2;

const motorHousing = roundedRect(motorW, motorD, 3, motorH)
  .translate(0, -3, motorZ)
  .color(BLACK);

// Motor vents (subtle cuts on the sides)
const ventSlot = box(1.5, motorD - 4, 3);
const vent1 = ventSlot.translate(-motorW / 2 + 2, -3, motorZ + 1).color(DARK_GRAY);
const vent2 = ventSlot.translate(motorW / 2 - 2, -3, motorZ + 1).color(DARK_GRAY);

// ── BATTERY PACK ─────────────────────────────────────
const battW = motorW * 0.7;
const battD = motorD * 0.6;
const battH = 5;
const battZ = motorZ + motorH / 2 + battH / 2;

const battery = roundedRect(battW, battD, 2, battH)
  .translate(0, -3, battZ)
  .color(YELLOW);

// Battery latch detail
const battLatch = box(battW * 0.4, 1.5, 2)
  .translate(0, -3 - battD / 2 + 0.5, battZ)
  .color(DARK_GRAY);

// ── REAR WHEELS (larger) ─────────────────────────────
const rearWheelBase = cylinder(wheelWidth, rearWheelR).rotate(0, 90, 0);
const rearHub = cylinder(wheelWidth + 1, hubR).rotate(0, 90, 0);

const rwx = deckW / 2 + wheelWidth / 2 + 0.5;
const rwy = deckD / 2 - rearWheelR * 0.8;

// Rear left wheel
const rearWL = rearWheelBase.translate(-rwx, rwy, rearWheelR).color(TIRE_BLACK);
const rearHubL = rearHub.translate(-rwx, rwy, rearWheelR).color(DARK_GRAY);
// Rear right wheel
const rearWR = rearWheelBase.translate(rwx, rwy, rearWheelR).color(TIRE_BLACK);
const rearHubR = rearHub.translate(rwx, rwy, rearWheelR).color(DARK_GRAY);

// Rear axle covers (where wheels attach to deck)
const rearAxleL = cylinder(3, 2.5).rotate(0, 90, 0)
  .translate(-deckW / 2 + 1, rwy, rearWheelR).color(BLACK);
const rearAxleR = cylinder(3, 2.5).rotate(0, 90, 0)
  .translate(deckW / 2 - 1, rwy, rearWheelR).color(BLACK);

// ── FRONT WHEELS (smaller casters) ───────────────────
const frontWheelBase = cylinder(3, frontWheelR).rotate(0, 90, 0);
const frontHub = cylinder(3.5, hubR * 0.7).rotate(0, 90, 0);

const fwx = deckW / 2 - 3;
const fwy = -deckD / 2 + frontWheelR + 2;

// Front wheel mounting brackets
const bracketH = deckZ - frontWheelR - 1;
const bracketL = box(2, 3, bracketH)
  .translate(-fwx, fwy, deckZ - deckH / 2 - bracketH / 2)
  .color(BLACK);
const bracketR = box(2, 3, bracketH)
  .translate(fwx, fwy, deckZ - deckH / 2 - bracketH / 2)
  .color(BLACK);

// Front left wheel
const frontWL = frontWheelBase.translate(-fwx, fwy, frontWheelR).color(TIRE_BLACK);
const frontHubL = frontHub.translate(-fwx, fwy, frontWheelR).color(DARK_GRAY);
// Front right wheel
const frontWR = frontWheelBase.translate(fwx, fwy, frontWheelR).color(TIRE_BLACK);
const frontHubR = frontHub.translate(fwx, fwy, frontWheelR).color(DARK_GRAY);

// ── GRASS BAG ────────────────────────────────────────
const bagW = deckW * 0.55;
const bagD = 18;
const bagH = 16;
const bagZ = deckZ + bagH / 2 - 2;
const bagY = deckD / 2 + bagD / 2 - 2;

// Main bag body
const bagOuter = box(bagW, bagD, bagH)
  .translate(0, bagY, bagZ)
  .color(BLACK);

// Bag top frame / lip
const bagFrame = box(bagW + 2, 2, 2)
  .translate(0, bagY - bagD / 2, bagZ + bagH / 2)
  .color(DARK_GRAY);

// Bag handle on top
const bagHandle = box(8, 3, 1.5)
  .translate(0, bagY - 3, bagZ + bagH / 2 + 1)
  .color(DARK_GRAY);

// ── HANDLE BARS ──────────────────────────────────────
// Continuous bars angling back from rear deck to grip height (~38° from vertical)
const handleBarR = 1.8;
const handleSpread = 14;
const handleAngle = 38; // degrees back from vertical — realistic push angle
const angleRad = handleAngle * Math.PI / 180;

const rearEdgeY = deckD / 2;
const barBaseZ = deckZ + deckH / 2;

// Full-length angled bar from deck to grip
const barOffset_Y = Math.sin(angleRad) * handleH / 2;
const barOffset_Z = Math.cos(angleRad) * handleH / 2;

// Negative rotation around X tilts the bar top toward +Y (backward)
const handleBar = cylinder(handleH, handleBarR).rotate(-handleAngle, 0, 0);

const handleBarL = handleBar
  .translate(-handleSpread, rearEdgeY + barOffset_Y, barBaseZ + barOffset_Z)
  .color(SILVER);
const handleBarR_part = handleBar
  .translate(handleSpread, rearEdgeY + barOffset_Y, barBaseZ + barOffset_Z)
  .color(SILVER);

// Grip position — at the top end of the angled bars
const gripTopY = rearEdgeY + barOffset_Y * 2;
const gripTopZ = barBaseZ + barOffset_Z * 2;

// Crossbar grip connecting the two bars (horizontal at bar tops)
const gripBar = box(handleSpread * 2 + handleBarR * 2, 3.5, 3.5)
  .translate(0, gripTopY, gripTopZ)
  .color(GRIP_BLACK);

// Grip rubber covers on the ends
const gripCoverL = box(8, 4, 4)
  .translate(-handleSpread + 2, gripTopY, gripTopZ)
  .color(GRIP_BLACK);
const gripCoverR = box(8, 4, 4)
  .translate(handleSpread - 2, gripTopY, gripTopZ)
  .color(GRIP_BLACK);

// Handle height adjuster knobs (at the base where bars meet the deck)
const knobL = cylinder(2, 2.2)
  .translate(-handleSpread, rearEdgeY, barBaseZ)
  .color(YELLOW);
const knobR = cylinder(2, 2.2)
  .translate(handleSpread, rearEdgeY, barBaseZ)
  .color(YELLOW);

// ── SAFETY BAIL BAR ─────────────────────────────────
// The bar you squeeze to keep the mower running — horizontal at grip height
const bailBar = box(handleSpread * 1.6, 2, 1.5)
  .translate(0, gripTopY, gripTopZ + 3.5)
  .color(YELLOW);

// ── DECK TOP DETAILS ─────────────────────────────────
// Height adjustment lever (left side)
const heightLever = box(4, 1.5, 5)
  .translate(-deckW / 2 + 3, -deckD / 4, deckZ + deckH / 2 + 2.5)
  .color(YELLOW);

// Discharge chute cover (right side)
const chuteCover = box(4, deckD * 0.5, 2)
  .translate(deckW / 2 + 1, 0, deckZ)
  .color(BLACK);

// ── ASSEMBLE ─────────────────────────────────────────
const asm = assembly("Push Lawn Mower")
  // Deck
  .add("Deck Body", deckBody)
  .add("Front Bumper", bumper)
  .add("Left Stripe", sideStripeL)
  .add("Right Stripe", sideStripeR)
  // Under deck
  .add("Blade Housing", bladeHousing)
  .add("Blade", blade)
  // Motor + battery
  .add("Motor Housing", motorHousing)
  .add("Left Vent", vent1)
  .add("Right Vent", vent2)
  .add("Battery Pack", battery)
  .add("Battery Latch", battLatch)
  // Rear wheels
  .add("Rear Left Wheel", rearWL)
  .add("Rear Left Hub", rearHubL)
  .add("Rear Right Wheel", rearWR)
  .add("Rear Right Hub", rearHubR)
  .add("Rear Left Axle", rearAxleL)
  .add("Rear Right Axle", rearAxleR)
  // Front wheels
  .add("Front Left Bracket", bracketL)
  .add("Front Right Bracket", bracketR)
  .add("Front Left Wheel", frontWL)
  .add("Front Left Hub", frontHubL)
  .add("Front Right Wheel", frontWR)
  .add("Front Right Hub", frontHubR)
  // Grass bag
  .add("Grass Bag", bagOuter)
  .add("Bag Frame", bagFrame)
  .add("Bag Handle", bagHandle)
  // Handle
  .add("Handle Bar Left", handleBarL)
  .add("Handle Bar Right", handleBarR_part)
  .add("Grip Bar", gripBar)
  .add("Grip Cover Left", gripCoverL)
  .add("Grip Cover Right", gripCoverR)
  .add("Knob Left", knobL)
  .add("Knob Right", knobR)
  .add("Safety Bail", bailBar)
  // Details
  .add("Height Lever", heightLever)
  .add("Chute Cover", chuteCover);

return { model: asm, camera: [80, -50, 50] };
