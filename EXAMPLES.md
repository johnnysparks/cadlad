# CadLad Usage Examples

This document shows example prompts you can use with Claude Code to create 3D models.

## Basic Shapes

### Simple Box
```
Create a 3D model of a 20x20x20mm cube and show me a preview
```

### Cylinder
```
Create a cylinder that's 30mm tall with a 10mm radius
```

### Hollow Tube
```
Create a hollow tube: 40mm long, 15mm outer diameter, 10mm inner diameter
```

## Mechanical Parts

### Bearing Pillow Block
```
Design a bearing pillow block with these specs:
- Base: 60mm x 60mm x 10mm
- Center bore: 22mm diameter
- 4 mounting holes: 5mm diameter, 45mm apart
- Rounded edges with 3mm fillet
```

### Parametric Bracket
```
Create an L-bracket with:
- Two 40mm x 40mm x 3mm plates at 90 degrees
- 5mm mounting holes in each plate
- Chamfered edges
Then show me front and side views
```

### Spacer
```
Make a spacer: 20mm OD, 8mm ID, 5mm height
Add a 1mm chamfer on both sides
```

## Iteration Examples

### Gear Design Session
```
You: Create a spur gear with 16 teeth, 2mm module, 6mm thick

Claude: [Creates and shows initial gear]

You: Make it 20 teeth instead and add a 6mm bore hole

Claude: [Updates model with changes]

You: Perfect! Add 4 small lightening holes around the center

Claude: [Adds holes and shows final design]

You: Export this as STL for 3D printing

Claude: [Exports to file]
```

### Housing Design
```
You: Design a rectangular electronics housing:
- 100mm x 60mm x 30mm outer dimensions
- 3mm wall thickness
- Open top
- 4 mounting posts inside (M3 screw holes)

Claude: [Creates initial design]

You: Add ventilation slots on the sides - 5 slots, 1mm wide, 20mm long

Claude: [Adds ventilation]

You: Add 4 feet on the bottom with screw holes

Claude: [Adds feet]

You: Show me the bottom view

Claude: [Renders bottom view]
```

## Advanced Parametric Design

### Customizable Enclosure
```
Create a parametric box function where I can easily change:
- Width, height, depth
- Wall thickness
- Corner radius
- Number and size of mounting holes

Then create a 80x50x30mm version with 2mm walls, 5mm corner radius,
and 4x M3 mounting holes in the corners
```

### Pulley System
```
Design a timing belt pulley:
- 30 teeth
- GT2 profile (2mm pitch)
- 8mm bore with a keyway
- Flanges on both sides
- 10mm wide belt path
```

## Export Workflows

### Multiple Format Export
```
Create a simple mounting bracket, then export it in:
1. STL for 3D printing
2. STEP for CAD software
3. SVG for documentation
```

### Variation Export
```
Create a spacer design, then make 3 versions with different heights:
- 5mm
- 10mm
- 15mm

Export each as a separate STL file
```

## Tips for Best Results

1. **Be Specific**: Include dimensions and requirements
2. **Iterate Gradually**: Make one change at a time for complex designs
3. **Ask for Views**: Request different angles to verify the design
4. **Use Parametric Thinking**: Define key dimensions so they're easy to change
5. **Be Semantic in Code**: Use descriptive variable names that keep the purpose of parts top of mind (e.g., `vertical_bracket`, `mounting_holes`, `left_arm`)
6. **Use Assemblies for Complex Designs**: As parts become more complicated, break them into semantic sub-assemblies to maintain healthy abstractions and scalable designs
7. **Export When Done**: Save your models in appropriate formats

## CadQuery Code Patterns

Claude will generate code using these common patterns:

### Basic Primitives
```python
# Box
result = cq.Workplane("XY").box(10, 10, 10)

# Cylinder
result = cq.Workplane("XY").cylinder(height=10, radius=5)

# Sphere
result = cq.Workplane("XY").sphere(5)
```

### Boolean Operations
```python
# Box with hole
result = (
    cq.Workplane("XY")
    .box(20, 20, 10)
    .faces(">Z")
    .hole(5)
)

# Union
result = cq.Workplane("XY").box(10, 10, 10).union(
    cq.Workplane("XY").transformed(offset=(15, 0, 0)).box(10, 10, 10)
)
```

### Arrays and Patterns
```python
# Linear pattern
result = (
    cq.Workplane("XY")
    .box(50, 50, 5)
    .rarray(20, 20, 2, 2)  # 2x2 array
    .hole(3)
)

# Polar pattern
result = (
    cq.Workplane("XY")
    .circle(30)
    .extrude(5)
    .faces(">Z")
    .workplane()
    .polarArray(radius=20, startAngle=0, angle=360, count=6)
    .hole(3)
)
```

### Fillets and Chamfers
```python
# Rounded edges
result = (
    cq.Workplane("XY")
    .box(20, 20, 10)
    .edges("|Z")  # Vertical edges
    .fillet(2)
)

# Chamfered edges
result = (
    cq.Workplane("XY")
    .box(20, 20, 10)
    .edges(">Z")  # Top edges
    .chamfer(1)
)
```

## Next Steps

- Read the main [README.md](README.md) for installation
- Check out the [CadQuery documentation](https://cadquery.readthedocs.io/)
- Try the standalone examples in `examples/`
- Start creating your own designs!
