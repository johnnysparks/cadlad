# Measuring Scoop

A kitchen measuring scoop with a cup-shaped bowl and tapered handle.

## Design

- **Bowl**: Revolved profile with flat bottom for stability. Outer and inner profiles define wall thickness. 48-segment revolve for smooth curves.
- **Handle**: Sketch-extruded side profile with thickness taper (thick at bowl, thin at grip). Width taper via angled boolean cuts. Attaches at rim height.
- **Assembly**: Bowl and handle as separate assembly parts with distinct colors. Avoids the `.color()` after `.union()` gotcha.

## Parameters

| Parameter | Default | Range | Notes |
|---|---|---|---|
| Bowl Diameter | 40mm | 25-60mm | Outer diameter of the cup |
| Bowl Depth | 22mm | 12-35mm | Height from flat bottom to rim |
| Wall Thickness | 1.8mm | 1.2-3mm | Uniform wall thickness |
| Handle Length | 55mm | 30-80mm | From bowl to grip end |
| Handle Width | 14mm | 8-20mm | Width at bowl junction (tapers to 65%) |
| Handle Thickness | 4mm | 2.5-6mm | Thickness at junction (tapers to 60%) |

## Techniques Used

- `Sketch.begin().revolve()` for axisymmetric bowl shape
- `Sketch.begin().extrude()` + `.rotate()` for handle side profile
- Boolean `.subtract()` to clean handle-bowl junction (cylinder carve prevents interior artifacts)
- Angled box subtraction for width taper
- `assembly()` for multi-color parts

## What Worked / What Didn't

**Worked well:**
- Revolve is perfect for cup/bowl shapes — much cleaner than sphere-subtraction
- Sketch side profile for the handle gives natural thickness taper
- Subtracting a cylinder matching the inner bowl radius cleans the junction

**Challenges:**
- Tip rounding via cylinder intersection created messy artifacts — dropped in favor of clean square tip
- Sketch extrude orientation requires careful mental mapping (draw in XY, extrude along Z, rotate into final position)
- The handle sketch extrude goes along Z but needs to end up along X — requires two rotations to reorient
