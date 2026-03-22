// Smartphone — rounded slab with screen cutout and camera bump
const w = param("Width", 35, { min: 28, max: 42, unit: "mm" });
const h = param("Height", 72, { min: 60, max: 85, unit: "mm" });
const t = param("Thickness", 4, { min: 3, max: 8, unit: "mm" });
const screenInset = param("Screen Inset", 2, { min: 1, max: 5, unit: "mm" });
const camR = param("Camera Radius", 3, { min: 2, max: 5, unit: "mm" });

// Body — rounded rectangle
const body = roundedRect(w, h, 3, t).color("#2d2d3a");

// Screen recess on the front face
const screenW = w - screenInset * 2;
const screenH = h - screenInset * 2;
const screenDepth = 0.5;
const screen = box(screenW, screenH, screenDepth + 1)
  .translate(0, 0, t / 2)
  .color("#1a1a2e");

// Camera bump on the back
const camBump = cylinder(1.5, camR + 1)
  .translate(-w / 2 + camR + 4, h / 2 - camR - 4, -t / 2 + 0.5);
const camLens = cylinder(2, camR)
  .translate(-w / 2 + camR + 4, h / 2 - camR - 4, -t / 2);

const phone = body
  .subtract(screen)
  .union(camBump)
  .subtract(camLens)
  .named("Smartphone")
  .color("#2d2d3a");

return { model: phone, camera: [50, 40, 60] };
