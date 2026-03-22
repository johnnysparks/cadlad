// Push lawn mower — clearer silhouette with deck nose, staggered wheels, engine,
// rear grass bag, and a slanted handle.
const deckW = param("Deck Width", 52, { min: 38, max: 72, unit: "mm" });
const deckD = param("Deck Depth", 42, { min: 32, max: 58, unit: "mm" });
const deckH = param("Deck Height", 7, { min: 5, max: 12, unit: "mm" });
const frontWheelR = param("Front Wheel Radius", 6, { min: 4, max: 10, unit: "mm" });
const rearWheelR = param("Rear Wheel Radius", 8.5, { min: 6, max: 14, unit: "mm" });
const handleH = param("Handle Height", 44, { min: 26, max: 60, unit: "mm" });

const deckZ = rearWheelR + deckH / 2;

// Main deck body with a rounded front nose so it reads like a stamped mower deck.
const deckBody = box(deckW, deckD * 0.78, deckH)
  .translate(0, deckD * 0.1, deckZ);
const deckNose = cylinder(deckW, deckH / 2)
  .rotate(0, 90, 0)
  .translate(0, -deckD * 0.29, deckZ);
const deck = deckBody.union(deckNose);

// Blade housing under the deck.
const housing = cylinder(4, deckW * 0.34)
  .translate(0, -deckD * 0.02, rearWheelR - 1.5);

// Wheels: smaller front pair, larger rear pair.
const frontWheel = cylinder(3.2, frontWheelR).rotate(0, 90, 0);
const rearWheel = cylinder(3.2, rearWheelR).rotate(0, 90, 0);
const wx = deckW / 2 + 1.6;
const frontY = -deckD / 2 + frontWheelR * 0.4;
const rearY = deckD / 2 - rearWheelR * 0.25;

const w1 = frontWheel.translate(-wx, frontY, frontWheelR);
const w2 = frontWheel.translate(wx, frontY, frontWheelR);
const w3 = rearWheel.translate(-wx, rearY, rearWheelR);
const w4 = rearWheel.translate(wx, rearY, rearWheelR);

// Engine and rear bag to make the top profile read as a lawn mower.
const engineBase = box(deckW * 0.36, deckD * 0.33, 5.5)
  .translate(0, -deckD * 0.06, deckZ + deckH / 2 + 2.75);
const engineCap = cylinder(3.5, deckW * 0.14)
  .translate(0, -deckD * 0.06, deckZ + deckH / 2 + 7.25);
const bag = box(deckW * 0.42, deckD * 0.3, deckH * 1.2)
  .translate(0, deckD * 0.25, deckZ + deckH / 2 + deckH * 0.6);

// Handle: two slanted rails and a top grip.
const railW = 2.4;
const railLen = handleH;
const railSpread = deckW * 0.23;
const railY = rearY - 1;
const railBaseZ = deckZ + deckH / 2 + 1;

const leftRail = box(railW, railW, railLen)
  .rotate(-23, 0, 0)
  .translate(-railSpread, railY, railBaseZ + railLen / 2);
const rightRail = box(railW, railW, railLen)
  .rotate(-23, 0, 0)
  .translate(railSpread, railY, railBaseZ + railLen / 2);
const grip = box(railSpread * 2 + railW, railW, railW)
  .rotate(-23, 0, 0)
  .translate(0, railY + 1, railBaseZ + railLen);

const mower = deck
  .union(housing)
  .union(w1).union(w2).union(w3).union(w4)
  .union(engineBase).union(engineCap)
  .union(bag)
  .union(leftRail).union(rightRail).union(grip)
  .named("Lawn Mower")
  .color("#3f9f42");

return { model: mower, camera: [95, 42, -64] };
