// Handheld game console — body, screen, d-pad, buttons, grips
const bodyW = param("Width", 100, { min: 70, max: 130, unit: "mm" });
const bodyH = param("Height", 50, { min: 35, max: 65, unit: "mm" });
const bodyT = param("Thickness", 10, { min: 6, max: 15, unit: "mm" });
const screenW = param("Screen Width", 45, { min: 30, max: 60, unit: "mm" });
const screenH = param("Screen Height", 30, { min: 20, max: 40, unit: "mm" });
const gripR = param("Grip Radius", 12, { min: 8, max: 18, unit: "mm" });
const btnR = param("Button Radius", 2.5, { min: 1.5, max: 4, unit: "mm" });

// Main body — rounded rectangle
const body = roundedRect(bodyW, bodyH, 5, bodyT).color("#2a2a3a");

// Screen recess
const screen = box(screenW, screenH, 2)
  .translate(0, 2, bodyT / 2)
  .color("#111122");

// D-pad (left side) — cross shape
const dpadArm = box(4, 12, 1.5);
const dpadCross = dpadArm.union(dpadArm.rotate(0, 0, 90))
  .translate(-bodyW / 4, 2, bodyT / 2 + 0.5)
  .color("#444455");

// Action buttons (right side) — diamond pattern
const btn = cylinder(1.5, btnR, btnR, 16);
const bx = bodyW / 4;
const btnA = btn.translate(bx, -2, bodyT / 2 + 0.5).color("#cc4444");
const btnB = btn.translate(bx + 7, 2, bodyT / 2 + 0.5).color("#44cc44");
const btnX = btn.translate(bx - 7, 2, bodyT / 2 + 0.5).color("#4444cc");
const btnY = btn.translate(bx, 6, bodyT / 2 + 0.5).color("#cccc44");

// Grips on each side — cylinders extending from body
const leftGrip = cylinder(bodyH * 0.7, gripR, gripR * 0.8, 24)
  .translate(-bodyW / 2 - gripR * 0.3, 0, -bodyT / 4)
  .color("#222233");
const rightGrip = cylinder(bodyH * 0.7, gripR, gripR * 0.8, 24)
  .translate(bodyW / 2 + gripR * 0.3, 0, -bodyT / 4)
  .color("#222233");

// Shoulder buttons (top edge)
const shoulder = box(15, 3, 3);
const lShoulder = shoulder.translate(-bodyW / 3, -bodyH / 2 - 1, bodyT / 4).color("#555566");
const rShoulder = shoulder.translate(bodyW / 3, -bodyH / 2 - 1, bodyT / 4).color("#555566");

const console = body
  .subtract(screen)
  .union(dpadCross)
  .union(btnA).union(btnB).union(btnX).union(btnY)
  .union(leftGrip).union(rightGrip)
  .union(lShoulder).union(rShoulder)
  .named("Game Console");

return console;
