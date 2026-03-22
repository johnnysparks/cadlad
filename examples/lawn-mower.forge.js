// Push lawn mower — deck, wheels, handle
const deckW = param("Deck Width", 50, { min: 35, max: 70, unit: "mm" });
const deckD = param("Deck Depth", 40, { min: 30, max: 55, unit: "mm" });
const deckH = param("Deck Height", 8, { min: 5, max: 12, unit: "mm" });
const wheelR = param("Wheel Radius", 8, { min: 5, max: 12, unit: "mm" });
const wheelT = param("Wheel Thickness", 3, { min: 2, max: 5, unit: "mm" });
const handleH = param("Handle Height", 45, { min: 30, max: 60, unit: "mm" });
const handleW = param("Handle Width", 30, { min: 20, max: 45, unit: "mm" });

// Mower deck
const deck = box(deckW, deckD, deckH).color("#2a8c2a");

// Blade housing — cylinder underneath
const housing = cylinder(3, deckW / 2 - 2)
  .translate(0, 0, -deckH / 2 - 1.5)
  .color("#333333");

// Wheels — four at corners
const wheel = cylinder(wheelT, wheelR)
  .rotate(0, 90, 0);

const xW = deckW / 2;
const yW = deckD / 2 - wheelR / 2;
const zW = -deckH / 2 + wheelR / 3;

const w1 = wheel.translate(-xW, -yW, zW).color("#333333");
const w2 = wheel.translate( xW, -yW, zW).color("#333333");
const w3 = wheel.translate(-xW,  yW, zW).color("#333333");
const w4 = wheel.translate( xW,  yW, zW).color("#333333");

// Handle — two vertical bars + crossbar
const handleBar = cylinder(handleH, 1.5, 1.5, 8);
const hx = handleW / 2;

const leftBar = handleBar
  .rotate(-15, 0, 0)
  .translate(-hx, -deckD / 2 + 2, handleH / 2 + deckH / 2)
  .color("#444444");

const rightBar = handleBar
  .rotate(-15, 0, 0)
  .translate(hx, -deckD / 2 + 2, handleH / 2 + deckH / 2)
  .color("#444444");

// Crossbar grip at top
const grip = box(handleW, 2, 2)
  .translate(0, -deckD / 2 - handleH * 0.24, handleH + deckH / 2 - 3)
  .color("#222222");

const mower = deck
  .union(housing)
  .union(w1).union(w2).union(w3).union(w4)
  .union(leftBar).union(rightBar)
  .union(grip)
  .named("Lawn Mower").color("#2a8c2a");

return mower;
