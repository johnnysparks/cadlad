# Master Architect Skills — CAD Fabrication & Building Design

A complete skill tree for mastering the craft of parametric CAD, physical fabrication, and building design. Each skill area includes what to know, why it matters, and how it maps to CadLad's API.

---

## 1. Spatial Reasoning & Geometry

The foundation. You cannot design what you cannot see in your mind.

### Coordinate Systems
- Right-hand rule (CadLad: Y-up in viewport, Z-up in Manifold)
- Local vs world space — every `translate()` operates in world; chained transforms compose
- When to center at origin vs place at corner (`box(x,y,z)` is centered; offsets via `translate`)

### Primitives as Building Blocks
- **Box** — walls, plates, beams, housings. `box(w, d, h)` centered at origin
- **Cylinder** — shafts, holes, pins, standoffs. `cylinder(height, rBottom, rTop?, segments?)`
- **Sphere** — domes, joints, fillets. `sphere(radius, segments?)`
- **Rounded Rectangle** — enclosures, ergonomic surfaces. `roundedRect(w, d, radius, height?)`
- Know segment count tradeoffs: fewer = faster + smaller files; more = smoother curves. 32 is default, 8 is fine for hidden geometry, 64+ for visible arcs

### Boolean Operations — The Core of Solid Modeling
- **Union** `.union()` — joining parts, building up complex shapes from simple ones
- **Subtract** `.subtract()` — cutting holes, pockets, channels, clearances
- **Intersect** `.intersect()` — finding overlap, trimming to boundaries
- Order matters: `A.subtract(B)` ≠ `B.subtract(A)`
- Always oversize cutters slightly (`height + 2`) to avoid z-fighting and coplanar faces

### Transforms
- **Translate** — positioning parts in assemblies, creating patterns
- **Rotate** — angled features, radial patterns. Degrees, not radians. `rotate(x, y, z)`
- **Scale** — uniform scaling preserves proportions; non-uniform creates distortion (useful for ovals)
- **Mirror** — symmetry. `mirror([1,0,0])` mirrors across YZ plane. Design half, mirror for the whole

### 2D to 3D — Profiles and Sweeps
- **Sketch** — define 2D profiles with `Sketch.begin()`, `lineTo()`, `lineBy()`, `arcTo()`, `close()`
- **Extrude** — push a 2D profile into 3D along Z. `sketch.extrude(height)`
- **Revolve** — spin a 2D profile around Y to make axisymmetric parts. `sketch.revolve(segments?)`
- Winding order matters: counter-clockwise for solid faces pointing outward
- Most real-world parts are extruded or revolved profiles with boolean cuts

### Spatial Queries
- **Bounding box** — `.boundingBox()` → `{min, max}`. Use for auto-positioning, clearance checks
- **Volume** — `.volume()` for mass estimation (volume × density)
- **Surface area** — `.surfaceArea()` for coating, painting, heat transfer calculations

---

## 2. Parametric Design Thinking

The difference between a shape and a *design* is parameters.

### Design Intent
- Every dimension should be either *driven* (by a parameter) or *derived* (computed from parameters)
- Ask: "If the user changes this value, what else should change?" — that's your parameter graph
- Name parameters for the *what*, not the *how*: `"Wall Thickness"` not `"box_z_minus_2"`

### Parameter Definition
```js
const width = param("Width", 60, { min: 20, max: 200, unit: "mm" });
```
- **Default value** — the "golden path" dimension that makes a good starting point
- **Min/max** — physical constraints (can't be negative, can't exceed material size)
- **Step** — meaningful increments (0.5mm for precision, 5mm for rough sizing)
- **Unit** — always specify. Ambiguity kills fabrication

### Parametric Patterns
- **Proportional**: hole radius = wall thickness × 0.4
- **Clearance-based**: hole diameter = bolt diameter + 0.3mm
- **Grid/array**: position = index × pitch
- **Conditional**: if thickness < 3mm, add ribs

### Robustness
- Test parameters at min, max, and several mid-values
- Geometry must never self-intersect or produce zero-thickness walls at any valid parameter value
- Boolean operations fail silently on degenerate geometry — always oversize cutters

---

## 3. Materials Science

You design for a material. The material dictates every dimension.

### Material Properties That Drive Design
| Property | What It Means | Design Impact |
|---|---|---|
| Yield strength | Stress before permanent deformation | Wall thickness, cross-sections |
| Ultimate tensile | Stress at failure | Safety factors |
| Young's modulus | Stiffness (stress/strain ratio) | Deflection under load |
| Density | Mass per volume | Weight estimation (volume × density) |
| Thermal expansion | Growth per degree | Clearances, joint design |
| Hardness | Resistance to indentation | Wear surfaces, fastener choice |
| Fatigue limit | Stress for infinite cycles | Moving parts, vibration |
| Melting point | Phase change temperature | Welding, operating environment |

### Common Materials by Application

**Metals:**
- **Mild steel (A36)** — structural, cheap, weldable. 250 MPa yield. Default for buildings
- **Aluminum 6061-T6** — lightweight, machinable, corrosion-resistant. 275 MPa yield
- **Stainless 304** — food-safe, chemical-resistant. 205 MPa yield. Expensive to machine
- **Brass** — decorative, low friction. Good for bearings and fittings

**Plastics:**
- **PLA** — easy to 3D print, brittle, not outdoor-rated. Prototyping only
- **PETG** — printable, tougher than PLA, moderate chemical resistance
- **ABS** — tough, heat-resistant, post-processable with acetone
- **Nylon (PA)** — strong, flexible, wear-resistant. Absorbs moisture
- **Acetal (Delrin)** — self-lubricating, dimensionally stable. Gears, bearings
- **Polycarbonate** — impact-resistant, transparent. Safety glazing

**Sheet goods:**
- **Plywood** — strong, cheap, laser-cuttable. Watch grain direction for strength
- **MDF** — uniform, paintable, weak when wet. Interior only
- **Acrylic** — laser-cuts clean, brittle. Light pipes, windows
- **HDPE** — chemical-resistant, slippery. Cutting boards, tanks

### Material Selection Checklist
1. What loads will it see? (tension, compression, shear, fatigue)
2. What environment? (indoor/outdoor, chemicals, UV, temperature range)
3. How will it be manufactured? (machined, printed, cast, bent, welded)
4. What finish is needed? (painted, anodized, raw, food-safe)
5. What's the budget? (material cost × waste factor + machining time)

---

## 4. Structural Engineering Fundamentals

Stuff breaks. Know why, where, and how to prevent it.

### Load Types
- **Dead load** — weight of the structure itself
- **Live load** — people, furniture, equipment, snow
- **Wind load** — lateral forces, uplift
- **Seismic** — dynamic lateral forces
- **Point load** — concentrated force (shelf bracket, bolt hole)
- **Distributed load** — spread across area (floor, roof)

### Stress & Strain
- **Stress** = Force / Area (Pa or psi). Higher stress → closer to failure
- **Strain** = Change in length / Original length (dimensionless)
- **Factor of safety** = Yield strength / Working stress. Minimum 2× for static, 4× for dynamic, 10× for life safety

### Key Structural Shapes
- **I-beam** — maximum stiffness for weight in bending
- **Tube/pipe** — torsion resistance, columns
- **Channel** — mounting, moderate bending
- **Angle** — bracing, framing
- **Gusset** — reinforcement at joints (triangulate for rigidity)

### Rules of Thumb
- Triangles are rigid; rectangles are not (add diagonals or gussets)
- Doubling thickness = 8× bending stiffness (cube law)
- Holes weaken by more than their area — stress concentrators at edges
- Round holes are better than square holes (no stress concentration at corners)
- Minimum edge distance for bolt holes: 1.5× bolt diameter from edge
- Ribs add stiffness without adding much weight — height matters more than thickness

### Deflection
- Acceptable deflection: typically L/360 for floors, L/240 for roofs (L = span)
- Deflection ∝ load × length³ / (modulus × moment of inertia)
- If it deflects too much, increase depth before increasing width

---

## 5. Manufacturing Methods

Design is constrained by how you make it. Know the methods.

### Subtractive (Removing Material)

**CNC Milling**
- Flat bottom pockets, contoured surfaces, drilled holes
- Minimum internal radius = tool radius (typically 1.5mm minimum)
- Maximum depth-to-width ratio: 4:1 for standard, 8:1 for specialized
- Access matters: 3-axis can only cut what's visible from above. Undercuts need 5-axis or fixtures
- Design for fixturing: leave tabs, add clamping surfaces

**Laser Cutting**
- 2D profiles from sheet material (metal, wood, acrylic)
- Kerf: 0.1-0.3mm for CO2 laser, 0.05-0.15mm for fiber laser
- Minimum feature size: ~1mm for wood, ~0.5mm for metal
- No internal corners sharper than kerf width — add relief cuts (dog-bone, T-bone)
- Tab-and-slot joints for 3D assemblies from flat sheets

**Turning (Lathe)**
- Axisymmetric parts only — shafts, cylinders, cones, spheres
- Use `revolve()` for these parts in CAD
- Undercuts need special tooling; avoid when possible

### Additive (Adding Material)

**FDM/FFF 3D Printing**
- Layer height: 0.1-0.3mm typical
- Minimum wall: 2× nozzle diameter (0.8mm for 0.4mm nozzle)
- Overhangs >45° need supports — design to avoid them (chamfers, not fillets on bottom faces)
- Bridges up to 10mm without support
- Hole accuracy: print 0.2-0.4mm undersize, drill to final dimension
- Orientation matters: strong in XY plane, weak between layers (Z axis)
- Snap fits, living hinges work with PETG/nylon, not PLA

**SLA/Resin Printing**
- High detail (0.025-0.05mm layers), brittle
- Needs supports everywhere — orientation optimization critical
- Post-cure required. Dimensional accuracy ±0.1mm
- Good for: molds, jewelry masters, dental, miniatures

**SLS/MJF (Powder Bed)**
- No supports needed (powder supports itself)
- Minimum wall: 0.7mm. Minimum detail: 0.5mm
- Nylon (PA12) — functional parts, hinges, clips
- Best process for complex internal geometry

### Forming (Reshaping Material)

**Sheet Metal Bending**
- Minimum bend radius: 1× material thickness for steel, 1.5× for aluminum
- K-factor: 0.33-0.5 — determines bend allowance
- Minimum flange length: 4× material thickness + bend radius
- Relief cuts at bend intersections to prevent tearing
- Design flat pattern first, verify folded clearances second

**Vacuum Forming**
- Draft angles: minimum 3° (5° preferred) for easy release
- Undercuts impossible without multi-part molds
- Wall thinning at corners — add extra material allowance
- Minimum radius on all edges: 1× material thickness

### Casting & Molding

**Injection Molding**
- Uniform wall thickness (±10%) to prevent sink marks and warping
- Draft angle: 1-2° minimum on all vertical faces
- Ribs: 60% of wall thickness, 3× wall thickness height max
- Minimum wall: 1mm for small parts, 2mm for large parts
- Gate location affects flow, aesthetics, and strength
- Undercuts need side actions (expensive tooling)

---

## 6. Tolerances & Fits

The gap between "designed" and "built." Master this or nothing fits.

### Tolerance Classes (ISO)
| Class | Tolerance | Use |
|---|---|---|
| IT6 (±0.01mm) | Precision | Bearing bores, shaft fits |
| IT8 (±0.03mm) | General machining | Pins, holes, mating parts |
| IT10 (±0.1mm) | Rough machining | Non-critical dimensions |
| IT12 (±0.3mm) | Sheet metal | Bent parts, welded frames |
| IT14 (±1.0mm) | 3D printing | FDM parts, rough castings |

### Fit Types
- **Clearance fit** — shaft always smaller than hole. Sliding, easy assembly. Gap = 0.1-0.5mm
- **Transition fit** — might be tight or loose. Light press, alignment pins
- **Interference fit** — shaft larger than hole. Press fit, permanent assembly

### Practical Tolerances by Process
| Process | Achievable | Notes |
|---|---|---|
| CNC milling | ±0.025mm | With good fixturing |
| Laser cutting | ±0.1mm | Kerf compensation |
| FDM printing | ±0.2mm | XY; Z is ±layer height |
| SLA printing | ±0.1mm | After post-cure |
| Sheet metal | ±0.3mm | Bend location |
| Hand-cut wood | ±1mm | Measure twice |

### CadLad Clearance Patterns
```js
// Press fit: hole = shaft diameter (interference from print expansion)
const holeDia = shaftDia;

// Sliding fit: add clearance
const holeDia = shaftDia + 0.3; // FDM printing
const holeDia = shaftDia + 0.1; // CNC machining

// Loose fit: generous clearance
const holeDia = shaftDia + 1.0; // bolt through-hole

// Subtract the hole with oversize height to ensure clean cut
const hole = cylinder(wallThickness + 2, holeDia / 2);
part = part.subtract(hole.translate(holeX, holeY, 0));
```

---

## 7. Joinery & Fastening

How parts connect. The joint is always the weakest point.

### Mechanical Fasteners
- **Bolts/screws** — M3 through M12 cover 90% of cases
  - Clearance hole = bolt diameter + 0.5mm
  - Counterbore depth = head height + 0.5mm
  - Thread engagement: minimum 1.5× diameter in steel, 2× in aluminum, 2.5× in plastic
- **Nuts** — hex nuts need wrench clearance: 2× nut width
- **Rivets** — permanent, good for thin sheet. Hole = rivet diameter + 0.1mm
- **Pins** — dowel pins for alignment, roll pins for retention

### Interlocking Joints (No Fasteners)
- **Tab-and-slot** — laser-cut sheet assemblies. Tab width = material thickness. Slot = tab + kerf
- **Box joint (finger joint)** — strong, decorative, laser-cuttable
- **Dovetail** — resists pulling apart. CNC or hand-cut
- **Mortise-and-tenon** — strongest wood joint. Tenon = 1/3 rail thickness
- **Snap fit** — cantilever beams with catches. Design for deflection < yield strain
- **Press fit** — interference fit. 0.01-0.05mm interference for metal, 0.1-0.3mm for plastic

### CadLad Assembly Patterns
```js
// Tab and slot from sheet
const tabWidth = thickness;
const slotWidth = thickness + 0.1; // clearance

// Positioned assembly
const asm = assembly("Frame")
  .add("left", side, [-width/2, 0, 0])
  .add("right", side.mirror([1,0,0]), [width/2, 0, 0])
  .add("top", shelf, [0, 0, height]);
```

---

## 8. Building Design & Codes

Buildings keep people alive. Codes encode centuries of failures.

### Structural Systems
- **Post-and-beam** — columns + beams, open floor plans. Wood, steel, concrete
- **Load-bearing wall** — walls carry floor/roof loads. Masonry, concrete, wood stud
- **Truss** — triangulated frames for long spans. Roof trusses, bridges
- **Frame** — rigid connections resist lateral loads. Steel moment frames

### Key Dimensions (Residential)
| Element | Standard | Notes |
|---|---|---|
| Ceiling height | 2.4m (8') minimum | 2.7m (9') preferred |
| Door width | 810mm (32") minimum | 910mm (36") for accessibility |
| Door height | 2030mm (80") standard | 2130mm (84") for tall doors |
| Stair width | 910mm (36") minimum | 1m for comfort |
| Stair rise | 178mm (7") max | 127-178mm (5-7") range |
| Stair run | 254mm (10") min | 254-305mm (10-12") range |
| Hallway width | 910mm (36") minimum | 1.2m for accessibility |
| Window sill | 610mm (24") from floor | Code varies by jurisdiction |
| Railing height | 910mm (36") residential | 1070mm (42") commercial |

### Load Requirements (Typical)
| Occupancy | Live Load | Notes |
|---|---|---|
| Residential | 1.9 kPa (40 psf) | Bedrooms: 1.4 kPa (30 psf) |
| Office | 2.4 kPa (50 psf) | |
| Retail | 4.8 kPa (100 psf) | |
| Roof (flat) | 1.0 kPa (20 psf) | Plus snow load |
| Deck/balcony | 2.9 kPa (60 psf) | |

### Accessibility (ADA/Universal Design)
- 1.5m (60") turning radius for wheelchair
- 910mm (36") minimum clear width through all paths
- Maximum 1:12 ramp slope (1" rise per 12" run)
- Lever handles, not knobs
- 430-1220mm (17-48") reach range for controls

### Environmental
- **R-value** — thermal resistance. Walls: R-13 to R-21. Roof: R-30 to R-49
- **Air changes per hour** — ventilation. 0.35 ACH minimum for residential
- **Moisture barrier** — warm side of insulation to prevent condensation
- **Drainage plane** — water must always have a path down and out
- **Thermal bridging** — metal studs, concrete penetrations lose heat. Break the bridge

---

## 9. Design for Assembly (DFA)

The best parts are the ones you don't need.

### Principles
1. **Minimize part count** — every part is a potential failure point and assembly step
2. **Design for top-down assembly** — gravity is free fixturing
3. **Self-locating features** — chamfers, tapers, pins that guide parts into position
4. **Symmetry** — if a part can be installed wrong, it will be. Make it symmetric or impossible to misassemble
5. **Poka-yoke** — mistake-proofing. Asymmetric bolt patterns, keyed connectors

### Assembly Sequence
- Plan the assembly order before designing parts
- Can each part be added without removing a previously installed part?
- Can a single tool reach every fastener?
- Is the assembly testable at intermediate stages?

---

## 10. Surface Treatment & Finishing

What the user sees and touches.

### Metal Finishes
- **Raw/mill** — cheapest, rusts. Interior only
- **Powder coat** — durable, many colors, 60-100μm thick. Add clearance for coating thickness
- **Anodize** — aluminum only, hard, corrosion-resistant. Type II: 5-25μm. Type III (hard anodize): 25-75μm
- **Plating** — chrome, nickel, zinc. Thin (5-25μm) but uniform
- **Paint** — cheap, many colors. Needs primer. 25-75μm per coat
- **Bead blast** — matte texture, hides machining marks. Does not protect against corrosion

### Plastic Finishes
- **As-printed** — layer lines visible. Sand + fill + prime for smooth
- **Acetone vapor** — smooths ABS only. Loses detail
- **Epoxy coat** — smooth, strong, waterproof. 0.1-0.3mm thick
- **Spray paint** — needs primer for adhesion on most plastics

### Wood Finishes
- **Oil** — penetrating, natural look, reapply periodically
- **Polyurethane** — hard, water-resistant, builds film
- **Paint** — prime first, especially on end grain
- **Wax** — soft sheen, minimal protection

---

## 11. Cost Estimation & Optimization

Design is constrained by budget. Know the cost drivers.

### Cost Components
1. **Material** — raw stock price × (finished volume + waste)
2. **Machine time** — hourly rate × setup time + cut time
3. **Labor** — assembly, finishing, inspection
4. **Tooling** — molds, fixtures, jigs (amortized over quantity)
5. **Finishing** — coating, plating, painting

### Material Efficiency
- **Nesting** — arrange parts on sheet stock to minimize waste. Target >70% utilization
- **Near-net-shape** — choose stock close to final size
- **Standard sizes** — design to standard sheet/bar/tube sizes to avoid custom orders
- **Buy vs make** — standard hardware (screws, bearings, hinges) is always cheaper than custom

### Quantity Breaks
| Quantity | Best Process | Notes |
|---|---|---|
| 1-5 | 3D printing, hand fabrication | No tooling cost |
| 5-50 | CNC machining, laser cutting | Setup cost amortized |
| 50-500 | CNC + jigs, sheet metal | Fixtures justify themselves |
| 500-5000 | Soft tooling, urethane casting | Bridge to injection molding |
| 5000+ | Injection molding, stamping | High tooling, low unit cost |

### CadLad Optimization
```js
// Calculate material usage
const partVolume = part.volume();          // mm³
const boundingVol = bbox.x * bbox.y * bbox.z; // stock volume
const efficiency = partVolume / boundingVol;    // aim for > 0.3

// Weight estimation
const density = 7.85e-6; // steel, kg/mm³
const weight = partVolume * density; // kg
```

---

## 12. Documentation & Communication

If it's not documented, it doesn't exist.

### Technical Drawing Essentials
- **Title block** — part name, material, scale, date, author, revision
- **Three-view orthographic** — front, top, right side. Only include views that add information
- **Section views** — show internal features. Crosshatch cut surfaces
- **Detail views** — zoom into complex areas
- **Dimensions** — baseline or chain dimensioning. Reference features, not edges
- **Tolerances** — general tolerance in title block, specific tolerances on critical dimensions
- **GD&T** — geometric dimensioning and tolerancing for precision parts (flatness, parallelism, true position)

### Bill of Materials (BOM)
| Field | Purpose |
|---|---|
| Part number | Unique identifier |
| Description | What it is |
| Material | What it's made of |
| Quantity | How many per assembly |
| Source | Buy or make |
| Unit cost | For cost rollup |

### Revision Control
- Version every design change
- Note what changed and why
- Git works for code-based CAD (CadLad .forge.ts files are diffable text)

---

## 13. Digital Fabrication Workflow

From model to physical object.

### Export Pipeline
```
CadLad model → .STL export → Slicer/CAM → G-code/toolpath → Machine
```

### STL Best Practices
- Check for manifold errors (no holes, no self-intersections — Manifold guarantees this)
- Sufficient polygon count for smooth curves (increase segments for export)
- Units must match slicer expectations (CadLad uses mm)
- Export via `solid.toSTL()` or the studio Export button

### Slicer Settings (FDM)
| Setting | Structural Parts | Visual Parts | Prototypes |
|---|---|---|---|
| Layer height | 0.15-0.2mm | 0.1-0.15mm | 0.25-0.3mm |
| Infill | 40-100% | 15-20% | 10-15% |
| Walls | 3-4 | 3 | 2 |
| Top/bottom layers | 4-5 | 4 | 3 |
| Support | As needed | Yes + interface | Minimal |

### CNC CAM Basics
- **Roughing** — remove bulk material fast with large tool
- **Finishing** — final surface with small tool, tight stepover
- **Drilling** — holes are faster with drill cycles than milling
- **Fixturing** — how you hold the part determines what you can cut

---

## 14. Thermal & Environmental Design

Things expand, contract, corrode, and degrade. Plan for it.

### Thermal Expansion
| Material | Coefficient (μm/m/°C) | 1m bar, 50°C rise |
|---|---|---|
| Steel | 12 | 0.6mm |
| Aluminum | 23 | 1.15mm |
| Brass | 19 | 0.95mm |
| PLA | 68 | 3.4mm |
| ABS | 73 | 3.65mm |
| Wood (along grain) | 3-5 | 0.15-0.25mm |

- Slot holes for bolted joints to allow movement
- Expansion gaps in flooring, cladding, long assemblies
- Dissimilar materials expand at different rates — use flexible connections

### Corrosion
- **Galvanic corrosion** — dissimilar metals in contact + moisture = corrosion. Use isolators
- **Galvanic series** — more noble (gold, stainless) corrodes less noble (zinc, aluminum, steel)
- **Protection** — coatings, sacrificial anodes, material selection, drainage design

### UV & Weather
- Most plastics degrade in UV — add stabilizers or paint opaque
- Wood needs protection from both UV and moisture
- Drain all horizontal surfaces — no standing water anywhere
- Vent enclosed spaces to prevent condensation

---

## 15. Ergonomics & Human Factors

Things are used by bodies. Design for the body.

### Anthropometric Data (5th-95th percentile adults)
| Dimension | 5th% Female | 50th% Male | 95th% Male |
|---|---|---|---|
| Standing height | 1510mm | 1755mm | 1905mm |
| Eye height (standing) | 1405mm | 1630mm | 1790mm |
| Seated eye height | 685mm | 790mm | 875mm |
| Shoulder width | 355mm | 455mm | 510mm |
| Reach (forward) | 610mm | 720mm | 825mm |
| Grip diameter | 25mm | 35mm | 50mm |

### Design Targets
- **Work surface height** — 720-760mm for desk, 900-950mm for standing counter
- **Grip diameter** — 30-45mm for power grip, 8-12mm for precision grip
- **Button/switch size** — minimum 10mm for finger, 20mm for gloved hand
- **Display viewing angle** — 15-50° below horizontal eye line
- **Force limits** — maximum 23N (5 lb) for frequent one-hand operation

---

## 16. Putting It Together — Design Process

### The Design Loop
1. **Define** — What problem? What constraints? What's the success criteria?
2. **Sketch** — Rough proportions on paper or whiteboard. Don't CAD yet
3. **Parameterize** — Identify the key variables. What should be adjustable?
4. **Model** — Build in CadLad. Start with the most constrained feature
5. **Analyze** — Check volume, clearances, structural adequacy
6. **Prototype** — Print or cut the first version. It will be wrong
7. **Measure** — Compare physical to CAD. Note every discrepancy
8. **Iterate** — Fix parameters, not geometry. The model should flex, not be rebuilt
9. **Document** — BOM, assembly instructions, critical dimensions
10. **Fabricate** — Final production with verified parameters

### CadLad Workflow
```js
// 1. Parameters first — the knobs the user turns
const width  = param("Width",  100, { min: 50, max: 200, unit: "mm" });
const height = param("Height",  60, { min: 30, max: 120, unit: "mm" });
const wall   = param("Wall",     3, { min: 1.5, max: 8, unit: "mm" });
const holeD  = param("Hole Diameter", 5, { min: 2, max: 20, unit: "mm" });

// 2. Build from most constrained to least
const shell = box(width, width, height);
const cavity = box(width - wall*2, width - wall*2, height - wall)
  .translate(0, 0, wall);
const base = shell.subtract(cavity);

// 3. Add features parametrically
const hole = cylinder(wall + 2, holeD / 2);
const mounting = base
  .subtract(hole.translate( width/3, 0, 0))
  .subtract(hole.translate(-width/3, 0, 0));

// 4. Color and name for clarity
return mounting
  .color("#4a90d9")
  .named("Mounting Bracket");
```

### Checklist Before Fabrication
- [ ] All dimensions parametric — no magic numbers
- [ ] Parameters tested at min and max values
- [ ] Clearances added for all fits
- [ ] No thin walls below manufacturing minimum
- [ ] No unsupported overhangs (if 3D printing)
- [ ] Fillet/chamfer all sharp edges for handling safety
- [ ] Volume/weight within budget
- [ ] Assembly sequence verified
- [ ] Fastener sizes and quantities documented
- [ ] Material specified with finish
