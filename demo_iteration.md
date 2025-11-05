# Demo: 3D Model Iteration Loop

This document demonstrates how the iteration loop works in practice.

## Session Example

### Step 1: Initial Request

**You:** Create a simple mounting bracket

**Claude Code:** Let me create a basic mounting bracket for you.

*[Uses create_3d_model tool]*

```python
import cadquery as cq

result = (
    cq.Workplane("XY")
    .box(40, 40, 5)  # Base plate
    .faces(">Z").workplane()
    .transformed(offset=(0, 15, 0))
    .box(40, 10, 30)  # Vertical wall
    .edges("|Z").fillet(2)  # Round vertical edges
)
```

*[Shows rendered preview of L-shaped bracket]*

---

### Step 2: First Iteration

**You:** Add mounting holes - two 5mm holes in the base, spaced 25mm apart

**Claude Code:** I'll add the mounting holes to the base.

*[Uses create_3d_model with updated code]*

```python
import cadquery as cq

result = (
    cq.Workplane("XY")
    .box(40, 40, 5)  # Base plate
    .faces(">Z").workplane()
    .transformed(offset=(0, 15, 0))
    .box(40, 10, 30)  # Vertical wall
    .edges("|Z").fillet(2)  # Round vertical edges
    # Add mounting holes
    .faces("<Z").workplane()
    .pushPoints([(-12.5, 0), (12.5, 0)])
    .hole(5)
)
```

*[Shows updated preview with holes]*

---

### Step 3: Second Iteration

**You:** Add a hole in the vertical wall for a screw

**Claude Code:** Adding a screw hole to the vertical wall.

*[Uses create_3d_model with updated code]*

```python
import cadquery as cq

result = (
    cq.Workplane("XY")
    .box(40, 40, 5)  # Base plate
    .faces(">Z").workplane()
    .transformed(offset=(0, 15, 0))
    .box(40, 10, 30)  # Vertical wall
    .edges("|Z").fillet(2)  # Round vertical edges
    # Add mounting holes to base
    .faces("<Z").workplane()
    .pushPoints([(-12.5, 0), (12.5, 0)])
    .hole(5)
    # Add screw hole to vertical wall
    .faces(">Y").workplane()
    .hole(4)
)
```

*[Shows updated preview with all holes]*

---

### Step 4: Refinement

**You:** Make the base thicker - 8mm instead of 5mm

**Claude Code:** Increasing the base thickness to 8mm.

*[Updates and shows final version]*

---

### Step 5: Export

**You:** Perfect! Export this as STL for 3D printing

**Claude Code:**
*[Uses export_model tool]*

✓ Exported to ~/.cadlad/exports/mounting_bracket.stl

---

## Key Features Demonstrated

1. **Visualization Loop**: Each change is immediately rendered and shown
2. **Iterative Refinement**: Claude understands context and modifies the existing design
3. **Code Evolution**: The CadQuery code evolves with each request
4. **Inline Feedback**: You can see the results instantly and request changes
5. **Final Export**: Easy export to manufacturing formats

## Behind the Scenes

What's happening in each iteration:

1. **You make a request** → Claude understands the design intent
2. **Claude generates CadQuery code** → Parametric 3D model definition
3. **MCP server executes code** → Creates the 3D geometry
4. **Renderer creates visualization** → PNG image for preview
5. **Claude shows you the result** → Inline image + description
6. **You provide feedback** → Loop continues

This cycle repeats until you're satisfied with the design!

## Try It Yourself

In Claude Code, try this sequence:

```
Create a simple cylinder, 20mm diameter, 30mm tall
```

Wait for the visualization, then:

```
Add a 6mm hole through the center
```

Then:

```
Add 4 small holes (3mm) around the outside, 12mm from center
```

Finally:

```
Export as STL
```

You'll see the model evolve with each step!
