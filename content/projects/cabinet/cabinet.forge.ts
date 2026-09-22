// Kitchen cabinet — box with door, shelf, and handle
const cabinetW = param("Width", 60, { min: 40, max: 100, unit: "mm" });
const cabinetH = param("Height", 80, { min: 50, max: 120, unit: "mm" });
const cabinetD = param("Depth", 40, { min: 25, max: 60, unit: "mm" });
const wallT = param("Wall Thickness", 2, { min: 1.5, max: 4, unit: "mm" });
const doorT = param("Door Thickness", 2, { min: 1.5, max: 3, unit: "mm" });
const handleLen = param("Handle Length", 15, { min: 8, max: 25, unit: "mm" });

// Outer shell
const outer = box(cabinetW, cabinetD, cabinetH).color("#d4b896");

// Inner cavity (open front)
const innerW = cabinetW - wallT * 2;
const innerH = cabinetH - wallT * 2;
const innerD = cabinetD - wallT;
const cavity = box(innerW, innerD, innerH)
  .translate(0, -wallT / 2, 0);

// Shelf at midpoint
const shelf = box(innerW, innerD - wallT, wallT)
  .translate(0, -wallT / 2, 0)
  .color("#c4a882");

// Door — slightly proud of the front face
const door = box(cabinetW - 1, doorT, cabinetH - 1)
  .translate(0, -cabinetD / 2 + doorT / 2, 0)
  .color("#b89a72");

// Handle — horizontal bar
const handle = box(handleLen, 2, 2)
  .translate(cabinetW / 4, -cabinetD / 2 - 1, cabinetH / 6)
  .color("#888888");

const cabinet = outer
  .subtract(cavity)
  .union(shelf)
  .union(door)
  .union(handle)
  .named("Cabinet").color("#d4b896");

return { model: cabinet, camera: [80, 60, -80] };
