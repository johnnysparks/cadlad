# Workflow: Build a New Project Model

You're creating a `.forge.js` model file. This is the most common task in this repo.

> **For interactive iteration with frequent screenshots**, see `workflow-vibe-modeling.md`.

## Pre-flight

```bash
npm run dev    # Vite at localhost:5173 (check if already running first)
ls projects/   # See what exists — don't duplicate
```

## The folder

Create `projects/your-model/your-model.forge.js`. No imports — the API is injected at runtime.

Each example lives in its own folder:
```
projects/your-model/
  your-model.forge.js   # the model (required)
  README.md             # design notes, requirements, what worked/didn't
  reference/            # inspiration images
```

Must `return` one of: a Solid, an Assembly, an array of Solids, or `{ model, camera: [x,y,z] }`.

## Coordinate system

**Z-up. Always.** Ground plane is Z=0. Build upward along +Z. Front faces -Y.

- `cylinder()` is vertical (along Z) by default
- `Sketch.begin()` draws in XY, `.extrude()` pushes along +Z
- To make a profile along Y: use `.extrudeAlong([0,1,0], h)` — no manual rotation needed

## API cheat sheet

```js
// Parameters (create sliders in the UI)
const w = param("Width", 60, { min: 20, max: 120, unit: "mm" });

// Primitives
box(w, d, h)                          // centered at origin
cylinder(height, radius)              // along Z, centered
cylinder(height, rBottom, rTop, segs) // cone/taper
sphere(radius)
roundedRect(w, d, cornerR, height)    // 2D rounded rect extruded — edges along Z are SHARP
roundedBox(w, d, h, radius)           // box with ALL edges/corners rounded
taperedBox(h, w1, d1, w2, d2)        // box tapering from (w1×d1) to (w2×d2) along Z

// 2D → 3D
Sketch.begin(x, y).lineTo(x2, y2).arcTo(x3, y3, r).close().extrude(h)
Sketch.begin(x, y)...close().extrudeAlong([x,y,z], h)  // extrude along any direction
Sketch.begin(x, y)...close().revolve(segments)  // spins around Y axis
circle(r).extrude(h)                  // shorthand
rect(w, h).extrude(depth)            // shorthand

// Booleans
a.union(b)       // combine
a.subtract(b)    // cut — OVERSIZE cutters by +2mm to avoid coplanar artifacts
a.intersect(b)   // overlap

// Transforms
.translate(x, y, z)
.rotate(xDeg, yDeg, zDeg)
.scale(x, y, z)     // or .scale(uniform)
.mirror([x, y, z])  // mirror plane normal

// Metadata
.color("#hex")
.named("Part Name")

// Multi-part (USE THIS when parts need different colors)
assembly("Name")
  .add("Part A", solidA, [x, y, z])   // optional position offset
  .add("Part B", solidB)

// Spatial queries
solid.boundingBox()  // { min: {x,y,z}, max: {x,y,z} }
solid.volume()
solid.surfaceArea()
```

## Critical gotchas

1. **`.color()` after `.union()` overwrites ALL colors.** Use `assembly()` for multi-color models.
2. **Oversize boolean cutters** by +2mm in the cutting direction. `cylinder(h + 2, r)` for through-holes.
3. **`roundedRect` is NOT a rounded cube.** Use `roundedBox(w, d, h, r)` for fully-rounded 3D boxes.
4. **Polygon winding is auto-fixed** in `extrude()` and `revolve()`, but if you use `CrossSection` directly, ensure CCW.
5. **Boolean junction artifacts.** When a handle overlaps a hollow body, subtract the inner cavity from the handle to clean interior faces.
6. **Tapered handles.** Use `taperedBox(h, w1, d1, w2, d2)` or `sketch.extrudeAlong([1,0,0], length)` instead of hacking box subtractions.

## Design approach

1. **Describe before you build.** Write a comment block describing what the component looks like visually — proportions, distinctive features, cross-section. Then translate that into geometry.
2. **Component decomposition.** Break the model into 3-6 logical parts. Build each independently, then assemble.
3. **Parameters first.** Define all `param()` calls at the top. Derive dimensions from parameters, not magic numbers.
4. **Profile extrusion for shaped parts.** If a part has a distinctive silhouette (L-bracket, channel, wedge), use `Sketch` → `.extrude()` rather than boolean-sculpting from boxes.

## Evaluation

After writing the model, you MUST evaluate it visually from multiple angles. A model that looks correct from one angle can be completely broken from another.

See: `workflow-evaluate-model.md`

## Done criteria

- [ ] Folder at `projects/NAME/NAME.forge.js` with `README.md`
- [ ] Loads without errors in studio (localhost:5173, paste code or use gallery)
- [ ] Parameters work across their min/max range
- [ ] Visually evaluated from multiple angles
- [ ] Recognizable as the thing it's supposed to be
