# CadLad Modeling Workflow Guide

This guide documents the workflow patterns that produce high-quality 3D models with minimal iteration, based on analysis of 77 commits across 10 example models.

---

## The Core Insight

> **Models with clear "why" documentation are correct on first attempt.**
> **Models that evolve by visual feedback alone require 3+ redesign cycles.**

| Model | Iterations | Had Design Brief? | Outcome |
|-------|-----------|-------------------|---------|
| Greenhouse | 1 | ✅ Full spec | Correct first try |
| Lumber rack | 1 | ✅ 255-line README | Correct first try |
| Soccer ball | 3 | ❌ "Make it look like..." | Multiple redesigns |
| Platform deck | 3 | ⚠️ Partial | Joist placement error |
| Opus cabinet | 6+ | ❌ Evolved organically | Ongoing sync issues |

---

## Workflow Phases

### Phase 1: Design Brief (30% of total time)

**Do not skip this phase.** Complete the [Design Brief Template](./DESIGN_BRIEF_TEMPLATE.md).

Key questions that prevent rework:
1. What sits on what? (assembly sequence)
2. What are the Z-heights of each layer?
3. What's structural vs aesthetic?
4. What parameters should be adjustable?

**Exit criteria:** You can verbally describe the assembly sequence from ground up without hesitation.

---

### Phase 2: Skeleton Code (10% of total time)

Write the parameter block and component stubs **before** implementing geometry.

```python
"""
Brief: [One-line description]
Assembly: [foundation] → [middle] → [top]
"""
import cadquery as cq

# ===== DESIGN PARAMETERS =====
WIDTH = 96        # X-axis (inches)
DEPTH = 72        # Y-axis (inches)
HEIGHT = 48       # Z-axis (inches)

# ===== DERIVED DIMENSIONS =====
# (calculations that depend on parameters)
half_width = WIDTH / 2

# ===== COMPONENT BUILDERS =====
def make_base():
    """Base sits on ground at Z=0"""
    pass  # TODO

def make_frame():
    """Frame sits on base at Z=BASE_HEIGHT"""
    pass  # TODO

def make_top():
    """Top sits on frame at Z=BASE_HEIGHT + FRAME_HEIGHT"""
    pass  # TODO

# ===== ASSEMBLY =====
components = {
    'base': make_base(),
    'frame': make_frame(),
    'top': make_top(),
}

result = components['base']
for name, part in list(components.items())[1:]:
    result = result.union(part)

# ===== OUTPUT =====
print(f"Model: {WIDTH}\" × {DEPTH}\" × {HEIGHT}\"")
```

**Why this works:**
- Forces you to name components before building them
- Documents assembly sequence in function order
- Makes Z-height assumptions explicit in docstrings

---

### Phase 3: Bottom-Up Implementation (40% of total time)

Implement components **in assembly order**, starting from Z=0.

#### The Golden Rule: Build What You Can Stand On First

```python
# CORRECT: Build from ground up
base = make_base()           # Z = 0
posts = make_posts()         # Z = 0 to POST_HEIGHT
beams = make_beams()         # Z = POST_HEIGHT
joists = make_joists()       # Z = POST_HEIGHT + BEAM_HEIGHT
deck = make_deck()           # Z = POST_HEIGHT + BEAM_HEIGHT + JOIST_HEIGHT

# WRONG: Building top-down or out-of-order
deck = make_deck()           # What Z? You don't know yet!
joists = make_joists()       # Where do they attach?
```

#### Z-Height Calculation Pattern

Always calculate Z from the bottom up:

```python
# Each layer's Z depends on layers below it
BASE_Z = 0
BASE_TOP = BASE_Z + BASE_HEIGHT

POST_Z = BASE_TOP
POST_TOP = POST_Z + POST_HEIGHT

BEAM_Z = POST_TOP
BEAM_TOP = BEAM_Z + BEAM_HEIGHT

# Now joist placement is unambiguous
JOIST_Z = BEAM_TOP  # Joists sit ON beams, not inside them
```

#### Component Verification

After each component, verify with a quick render:

```python
# Temporarily set result to just the new component
result = make_beams()  # Check this looks right before continuing
```

---

### Phase 4: Assembly & Coloring (10% of total time)

Use semantic colors to verify structure:

```python
# Semantic color scheme reveals structural hierarchy
COLORS = {
    'foundation': (100, 100, 100),  # Gray - ground level
    'posts': (45, 85, 140),         # Dark blue - vertical
    'beams': (70, 120, 180),        # Medium blue - primary horizontal
    'joists': (100, 150, 200),      # Light blue - secondary horizontal
    'deck': (160, 120, 80),         # Brown - surface
}

components = {
    'foundation': (make_foundation(), COLORS['foundation']),
    'posts': (make_posts(), COLORS['posts']),
    # ...
}
```

**Color reveals errors:**
- Can't see posts? They might be inside something else
- Joists same color as deck? They might be at wrong Z
- All one color? Component separation failed

---

### Phase 5: Validation & Output (10% of total time)

#### Console Output Checklist

Every complex model should print:

```python
print("=" * 60)
print(f"MODEL NAME — {WIDTH}\" × {DEPTH}\"")
print("=" * 60)
print(f"Dimensions: {WIDTH}\" × {DEPTH}\" × {HEIGHT}\"")
print(f"Material: {MATERIAL}")
print()
print("COMPONENTS:")
for name, (part, color) in components.items():
    bb = part.val().BoundingBox()
    print(f"  {name}: {bb.xlen:.1f}\" × {bb.ylen:.1f}\" × {bb.zlen:.1f}\"")
print()
print("MATERIALS LIST:")
# Print cut list for lumber/materials
```

#### Structural Verification Checklist

- [ ] No components at Z < 0 (below ground)
- [ ] No overlapping components (unless intentional)
- [ ] All components connected (no floating parts)
- [ ] Assembly is physically possible (can reach all fastener points)

#### Export Verification

```bash
# Check STL file size (warning signs)
# < 100KB: Simple model, probably fine
# 100KB - 1MB: Medium complexity, normal
# 1MB - 10MB: Complex, check for unnecessary detail
# > 10MB: Problem - mesh too dense or boolean issues

# Check in slicer/CAD for:
# - Correct overall dimensions
# - No inverted normals
# - Watertight mesh
```

---

## Common Failure Patterns & Solutions

### 1. Joist-Above-Deck Syndrome

**Symptom:** Supporting members placed above the surface they support

**Cause:** Calculating Z from top surface instead of bottom

**Solution:** Always ask "what does this sit ON?" and calculate Z from there

```python
# WRONG: "Joists are at deck height"
joist_z = DECK_HEIGHT  # This puts joists AT deck level

# CORRECT: "Joists support deck from below"
deck_bottom = DECK_HEIGHT
joist_z = deck_bottom - JOIST_HEIGHT  # Joists are BELOW deck
```

### 2. 2D Thinking in 3D Space

**Symptom:** Flat shapes that should be oriented in 3D are all in XY plane

**Cause:** Creating 2D geometry and forgetting to rotate/position in 3D

**Solution:** Explicitly define orientation for each component

```python
# WRONG: Pentagon at origin, no orientation
pentagon = cq.Workplane("XY").polygon(5, radius)

# CORRECT: Pentagon oriented tangent to sphere surface
pentagon = (
    cq.Workplane("XY")
    .polygon(5, radius)
    .extrude(thickness)
    .rotate((0,0,0), rotation_axis, rotation_angle)
    .translate(position_on_sphere)
)
```

### 3. Parameter Coupling Chaos

**Symptom:** Changing one parameter breaks unrelated parts

**Cause:** Implicit dependencies between parameters

**Solution:** Document all derived dimensions explicitly

```python
# WRONG: Magic numbers scattered in code
door_width = 32  # Where did this come from?

# CORRECT: Derived from parameters with explanation
DOOR_WIDTH = BAY_WIDTH - (2 * WALL_THICKNESS) - DOOR_GAP
# Door fills bay minus walls and clearance
```

### 4. Boolean Operation Failures

**Symptom:** Union/cut operations produce unexpected results or crash

**Cause:** Invalid intermediate geometry, non-manifold edges

**Solution:** Build and validate each component independently

```python
# WRONG: Chain of operations that's hard to debug
result = base.union(posts).union(beams).cut(holes).union(deck)

# CORRECT: Build each part, verify, then combine
base = make_base()
assert base.val().isValid(), "Base geometry invalid"

posts = make_posts()
assert posts.val().isValid(), "Posts geometry invalid"

# ... validate each ...

result = base.union(posts).union(beams).union(deck)
```

### 5. Sync Drift Between Related Models

**Symptom:** Two models that should match have different dimensions

**Cause:** Duplicated parameter definitions

**Solution:** Single source of truth

```python
# WRONG: Parameters defined in two files
# cabinet/model.py: WIDTH = 144
# cabinet_frame/model.py: WIDTH = 144  # Must remember to update both!

# CORRECT: Shared config
# cabinet/config.py
WIDTH = 144
BAY_COUNT = 4

# cabinet/model.py
from .config import WIDTH, BAY_COUNT

# cabinet_frame/model.py
from .config import WIDTH, BAY_COUNT
```

---

## Multi-View Rendering (Recommended)

A single isometric view can hide errors. Generate multiple views:

```python
def render_multi_view(model, output_prefix):
    """Generate front, side, top, and isometric views"""
    views = {
        'front': ('XZ', (0, -1, 0)),   # Looking from -Y
        'side': ('YZ', (1, 0, 0)),     # Looking from +X
        'top': ('XY', (0, 0, 1)),      # Looking from +Z
        'iso': None,                    # Default isometric
    }
    for name, orientation in views.items():
        render(model, f"{output_prefix}_{name}.png", orientation)
```

This catches:
- Front view: Height proportions, door placement
- Side view: Depth, assembly layer stacking
- Top view: Layout, spacing, alignment
- Iso view: Overall appearance

---

## Quick Reference: The 5-Minute Checklist

Before writing any geometry code:

- [ ] I can describe the assembly sequence verbally (ground → top)
- [ ] I know the Z-height of every major component
- [ ] I've identified what's structural vs aesthetic
- [ ] I've checked existing examples for similar patterns
- [ ] Parameters are defined at top of file with units in comments

Before marking complete:

- [ ] Console output shows dimensions and materials
- [ ] Colored render shows distinct components
- [ ] STL file size is reasonable
- [ ] No components are floating or overlapping incorrectly
- [ ] Code comments explain "why" not just "what"
