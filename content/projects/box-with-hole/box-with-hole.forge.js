// Box with a through-hole — the "hello world" of CAD
const width  = param("Width",  60, { min: 20, max: 200, unit: "mm" });
const depth  = param("Depth",  40, { min: 20, max: 200, unit: "mm" });
const height = param("Height", 20, { min: 5,  max: 100, unit: "mm" });
const holeR  = param("Hole Radius", 8, { min: 2, max: 30, unit: "mm" });

const base = box(width, depth, height).color("#5f87c6");
const hole = cylinder(height + 2, holeR);
const part = base.subtract(hole);

return part;
