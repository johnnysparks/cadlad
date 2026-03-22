// Push lawn mower — deck, wheels, handle
const deckW = param("Deck Width", 50, { min: 35, max: 70, unit: "mm" });
const deckD = param("Deck Depth", 40, { min: 30, max: 55, unit: "mm" });
const deckH = param("Deck Height", 8, { min: 5, max: 12, unit: "mm" });
const wheelR = param("Wheel Radius", 7, { min: 4, max: 12, unit: "mm" });
const handleH = param("Handle Height", 35, { min: 20, max: 50, unit: "mm" });

const deckZ = wheelR + deckH / 2;

// Deck
const deck = box(deckW, deckD, deckH)
  .translate(0, 0, deckZ);

// Blade housing underneath
const housing = cylinder(3, deckW / 2 - 5)
  .translate(0, 0, wheelR - 1);

// Wheels — rotate(0,90,0) so axle runs along X (out the sides)
const wheel = cylinder(3, wheelR).rotate(0, 90, 0);
const wx = deckW / 2 + 1.5;
const wy = deckD / 2 - wheelR;

const w1 = wheel.translate(-wx, -wy, wheelR);
const w2 = wheel.translate( wx, -wy, wheelR);
const w3 = wheel.translate(-wx,  wy, wheelR);
const w4 = wheel.translate( wx,  wy, wheelR);

// Handle — simple approach: two vertical posts + one crossbar.
// Posts rise from the rear edge of the deck, straight up.
// No tilt — keep it simple and correct.
const postW = 2.5;
const postSpread = 12;
const postBase = deckZ + deckH / 2;
const rearY = deckD / 2;

const leftPost = box(postW, postW, handleH)
  .translate(-postSpread, rearY - postW / 2, postBase + handleH / 2);
const rightPost = box(postW, postW, handleH)
  .translate( postSpread, rearY - postW / 2, postBase + handleH / 2);

// Crossbar grip at the top
const grip = box(postSpread * 2 + postW, postW, postW)
  .translate(0, rearY - postW / 2, postBase + handleH);

// Engine cover bump on top
const engine = box(deckW * 0.5, deckD * 0.4, 5)
  .translate(0, -deckD * 0.15, deckZ + deckH / 2 + 2.5);

const mower = deck
  .union(housing)
  .union(w1).union(w2).union(w3).union(w4)
  .union(leftPost).union(rightPost).union(grip)
  .union(engine)
  .named("Lawn Mower").color("#2a8c2a");

return { model: mower, camera: [90, 50, -60] };
