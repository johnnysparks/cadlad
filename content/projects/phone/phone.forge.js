// Smartphone — rounded slab with screen cutout and camera bump
const w = param("Width", 35, { min: 28, max: 42, unit: "mm" });
const h = param("Height", 72, { min: 60, max: 85, unit: "mm" });
const t = param("Thickness", 4, { min: 3, max: 8, unit: "mm" });
const screenInset = param("Screen Inset", 2, { min: 1, max: 5, unit: "mm" });
const camR = param("Camera Radius", 3, { min: 2, max: 5, unit: "mm" });

// Body — rounded rectangle
const body = roundedRect(w, h, 3, t).color("#2d2d3a");

// Screen recess on the front face (roundedRect z goes 0→t, front is at z=t)
const screenW = w - screenInset * 2;
const screenH = h - screenInset * 2;
const screenDepth = 0.5;
const screen = box(screenW, screenH, screenDepth + 1)
  .translate(0, 0, t)
  .color("#1a1a2e");

// Camera bump on the back (back face is at z=0)
const camX = -w / 2 + camR + 4;
const camY = h / 2 - camR - 4;
const camBump = cylinder(2, camR + 1)
  .translate(camX, camY, 0);
const camLens = cylinder(1.5, camR)
  .translate(camX, camY, -0.5);

const phone = body
  .subtract(screen)
  .union(camBump)
  .subtract(camLens)
  .named("Smartphone")
  .color("#2d2d3a");

return { model: phone, camera: [50, 40, 60] };
