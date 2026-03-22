// Water bottle — revolved profile with cap
const bodyR = param("Body Radius", 15, { min: 10, max: 25, unit: "mm" });
const bodyH = param("Body Height", 80, { min: 50, max: 120, unit: "mm" });
const neckR = param("Neck Radius", 8, { min: 5, max: 15, unit: "mm" });
const neckH = param("Neck Height", 10, { min: 5, max: 20, unit: "mm" });
const wallT = param("Wall Thickness", 2, { min: 1, max: 3, unit: "mm" });
const capH = param("Cap Height", 8, { min: 5, max: 15, unit: "mm" });

// Body — cylinder with rounded bottom
const bodyOuter = cylinder(bodyH, bodyR).color("#88bbdd");
const bodyInner = cylinder(bodyH, bodyR - wallT)
  .translate(0, 0, wallT);
const body = bodyOuter.subtract(bodyInner);

// Bottom dome (close off the bottom)
const bottomCap = cylinder(wallT, bodyR)
  .translate(0, 0, -bodyH / 2 + wallT / 2)
  .color("#88bbdd");

// Neck
const neckOuter = cylinder(neckH, neckR).color("#88bbdd");
const neckInner = cylinder(neckH + 2, neckR - wallT);
const neck = neckOuter.subtract(neckInner)
  .translate(0, 0, bodyH / 2 + neckH / 2);

// Thread ridge on neck (simplified as a ring)
const thread = cylinder(1.5, neckR + 0.5)
  .translate(0, 0, bodyH / 2 + neckH * 0.6)
  .color("#77aabb");
const threadInner = cylinder(2, neckR - 0.5)
  .translate(0, 0, bodyH / 2 + neckH * 0.6);
const threadRing = thread.subtract(threadInner);

// Cap
const cap = cylinder(capH, neckR + 1.5)
  .translate(0, 0, bodyH / 2 + neckH + capH / 2 + 1)
  .color("#dd5555");

const bottle = body
  .union(bottomCap)
  .union(neck)
  .union(threadRing)
  .union(cap)
  .named("Water Bottle").color("#88bbdd");

return { model: bottle, camera: [60, 80, 80] };
