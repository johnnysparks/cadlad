// Soap dish with drainage slots
const dishW = param("Width", 50, { min: 35, max: 70, unit: "mm" });
const dishD = param("Depth", 35, { min: 25, max: 50, unit: "mm" });
const dishH = param("Height", 12, { min: 8, max: 20, unit: "mm" });
const wallT = param("Wall Thickness", 2.5, { min: 1.5, max: 4, unit: "mm" });
const slotCount = param("Drain Slots", 5, { min: 3, max: 8 });
const slotW = param("Slot Width", 2, { min: 1, max: 3, unit: "mm" });

// Outer shell — rounded rectangle
const outer = roundedRect(dishW, dishD, 4, dishH).color("#e8e0d0");

// Inner cavity
const inner = roundedRect(dishW - wallT * 2, dishD - wallT * 2, 3, dishH)
  .translate(0, 0, wallT);

// Drainage slots in the bottom
let dish = outer.subtract(inner);

const slotSpacing = (dishW - wallT * 4) / (slotCount + 1);
for (let i = 1; i <= slotCount; i++) {
  const slotX = -dishW / 2 + wallT * 2 + slotSpacing * i;
  const slot = box(slotW, dishD - wallT * 4, wallT + 2)
    .translate(slotX, 0, -dishH / 2);
  dish = dish.subtract(slot);
}

return dish.named("Soap Dish");
