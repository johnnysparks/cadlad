# CadLad Design Brief Template

Complete this template **before** writing any CadQuery code. Models with clear briefs are typically correct on the first attempt; models without them average 3+ redesign cycles.

---

## 1. Purpose & Context

### What is this object?
<!-- One sentence describing what you're building -->


### Why does it exist?
<!-- What problem does it solve? What will it be used for? -->


### Where will it be used?
<!-- Indoor/outdoor? Load-bearing? Decorative? Environmental constraints? -->


### Who is the user?
<!-- Skill level for assembly? Tools available? -->


---

## 2. Critical Dimensions & Constraints

### Overall Envelope
| Dimension | Value | Rationale |
|-----------|-------|-----------|
| Width (X) |       |           |
| Depth (Y) |       |           |
| Height (Z)|       |           |

### Material Constraints
<!-- What materials? Standard lumber sizes? Sheet goods? Hardware? -->

- Primary material:
- Secondary materials:
- Available stock sizes:
- Hardware/fasteners:

### Clearances & Tolerances
<!-- What must fit inside/around this? Door clearances? Assembly tolerances? -->


### Load Requirements
<!-- Weight capacity? Dynamic loads? Safety factor? -->


---

## 3. Assembly Logic (CRITICAL)

**This section prevents the most common errors.** Describe the assembly sequence from bottom to top, explicitly stating what sits on what.

### Foundation Layer (Z = 0)
<!-- What touches the ground/mounting surface? -->


### Assembly Sequence
<!-- List each component and what it attaches to. Be explicit about Z-heights. -->

1. **[Component A]** - sits on ground at Z=0, height = ___
2. **[Component B]** - sits on top of A, Z = ___, height = ___
3. **[Component C]** - attaches to B at Z = ___, ...

### Connection Points
<!-- How do components join? Pocket holes? Bolts? Glue? Welded? -->


---

## 4. Visual Reference Analysis

### Reference Images/Sketches
<!-- Attach or link reference images. For each, note what's USEFUL vs what's MISLEADING -->

| Reference | What to copy | What to ignore |
|-----------|--------------|----------------|
|           |              |                |

### Key Visual Features
<!-- What makes this object recognizable? What details matter? -->


### Structural vs Aesthetic
<!-- Which features are structural requirements vs visual preferences? -->

- **Must have (structural)**:
- **Should have (functional)**:
- **Nice to have (aesthetic)**:

---

## 5. Parametric Design

### Primary Parameters
<!-- Which dimensions should be easily adjustable? -->

| Parameter | Default | Valid Range | Affects |
|-----------|---------|-------------|---------|
|           |         |             |         |

### Derived Dimensions
<!-- What calculations depend on the primary parameters? -->


### Invariants
<!-- What relationships must ALWAYS hold regardless of parameters? -->
<!-- e.g., "joists must always be below deck surface" -->


---

## 6. Known Complexity

### Geometric Challenges
<!-- Any tricky geometry? Angles? Curves? Boolean operations? -->


### Potential Failure Modes
<!-- What could go wrong structurally? What assumptions might be wrong? -->


### Similar Past Models
<!-- Reference existing CadLad examples that solve similar problems -->


---

## 7. Acceptance Criteria

### Structural Verification
- [ ] All components are connected (no floating parts)
- [ ] Assembly sequence is physically possible
- [ ] Load path is continuous to ground/mounting
- [ ] Clearances allow for assembly/access

### Visual Verification
- [ ] Recognizable as intended object
- [ ] Proportions match reference
- [ ] No obviously wrong orientations

### Export Verification
- [ ] STL file size is reasonable (< 1MB for simple, < 10MB for complex)
- [ ] Model is watertight (manifold) for 3D printing
- [ ] Dimensions match spec when imported to slicer/CAD

---

## 8. Output Requirements

### Deliverables
- [ ] `model.py` with parametric CadQuery code
- [ ] `render.png` visualization
- [ ] `render.stl` export
- [ ] Material/cut list printed to console
- [ ] README.md with build instructions (for complex models)

### Documentation Requirements
<!-- What should be documented in the code comments? -->


---

## Example: Completed Brief

<details>
<summary>Click to expand: Greenhouse example brief</summary>

### 1. Purpose & Context
**What:** 8'×6' backyard greenhouse frame structure
**Why:** Grow seedlings and extend growing season in temperate climate
**Where:** Outdoor, on level ground, must withstand wind/snow loads
**Who:** DIY homeowner with basic carpentry skills

### 2. Critical Dimensions
- Width: 96" (8') - fits standard polycarbonate panels
- Depth: 72" (6') - allows 2' walkway + 2' beds on each side
- Front height: 96" (8') - comfortable standing height
- Back height: 78" (6.5') - creates shed roof for rain runoff

**Materials:** Pressure-treated 2×4 lumber throughout
**Hardware:** 3" exterior screws, hurricane ties for rafters

### 3. Assembly Logic
1. **Sill plates** - on ground at Z=0, 1.5" thick
2. **Corner posts** - stand on sill plates, Z=1.5" to 96"/78"
3. **Wall studs** - between posts, same Z range
4. **Top plates** - sit on posts/studs at Z=96"/78"
5. **Rafters** - rest on top plates, span front to back
6. **Fascia** - covers rafter ends

### 4. Acceptance Criteria
- Shed roof pitches toward back (water runoff)
- Door opening on front wall (32" wide)
- All lumber is standard 2×4 dimensions
- Frame is square and plumb

</details>

---

## Tips for Success

1. **Spend 30% of time on this brief, 70% on code** - it's faster overall
2. **Draw a side-view sketch** showing Z-heights before coding
3. **Name the assembly sequence out loud** - "the joist sits ON the beam which sits ON the post"
4. **Check existing examples** for similar structural patterns
5. **When in doubt, add more constraints** - ambiguity causes iteration
