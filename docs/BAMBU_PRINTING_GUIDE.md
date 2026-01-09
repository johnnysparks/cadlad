# Bambu Lab 3D Printing Guide

This guide explains how to export models from CadLad and import them into Bambu Studio for 3D printing.

## Overview

CadLad automatically exports all models in **3MF format**, which is the native format for Bambu Lab printers. 3MF files include:

- Precise geometry
- Color information (if specified)
- Material metadata
- Units (millimeters by default)

## Automatic Export

When you create any model using the `create_3d_model` tool, CadLad automatically exports it in three formats:

- **STL** - Universal 3D printing format
- **STEP** - Parametric CAD format for editing
- **3MF** - Bambu Lab native format (recommended)

All exports are saved to: `~/.cadlad/models/`

### Example

```python
import cadquery as cq

# Create a simple mounting bracket
result = (
    cq.Workplane("XY")
    .box(50, 40, 5)
    .faces(">Z")
    .workplane()
    .rect(30, 20)
    .cutThruAll()
    .faces(">Z")
    .workplane()
    .pushPoints([(-15, 15), (15, 15)])
    .hole(4)
)
```

After creating this model as `mounting_bracket`, you'll find:
- `~/.cadlad/models/mounting_bracket.3mf` ← **Use this for Bambu Studio**
- `~/.cadlad/models/mounting_bracket.stl`
- `~/.cadlad/models/mounting_bracket.step`

## Importing to Bambu Studio

### Method 1: Drag and Drop (Easiest)

1. Open Bambu Studio
2. Navigate to `~/.cadlad/models/` in your file manager
3. Drag the `.3mf` file directly onto the Bambu Studio build plate
4. The model will appear ready for slicing

### Method 2: File Menu

1. Open Bambu Studio
2. Click **File** → **Import** → **Import 3MF/STL**
3. Navigate to `~/.cadlad/models/`
4. Select your `.3mf` file
5. Click **Open**

### Method 3: Command Line (Advanced)

You can export directly to a specific location:

```python
# Via MCP tool
export_model(
    name="mounting_bracket",
    format="3mf",
    output_path="/path/to/bambu/projects/bracket.3mf"
)
```

## Export Location Reference

| File Type | Default Location | Purpose |
|-----------|-----------------|---------|
| Auto-exports | `~/.cadlad/models/{name}.3mf` | Automatic on model creation |
| Manual exports | `~/.cadlad/exports/{name}.3mf` | Using `export_model` tool |
| Custom path | User-specified | Using `output_path` parameter |

## Printing Workflow

### Step 1: Create Your Model
Use CadQuery to design your part programmatically.

### Step 2: Verify in CadLad
CadLad renders a PNG preview - verify the geometry looks correct.

### Step 3: Locate the 3MF File
```bash
# Models are saved in:
ls ~/.cadlad/models/

# Find your specific model:
ls ~/.cadlad/models/your_model_name.3mf
```

### Step 4: Import to Bambu Studio
Drag the `.3mf` file into Bambu Studio.

### Step 5: Configure Print Settings
- **Material**: Select your filament (PLA, PETG, ABS, etc.)
- **Layer Height**: 0.2mm (standard) or 0.1mm (fine detail)
- **Infill**: 15-20% for structural parts
- **Supports**: Enable if overhangs exceed 45°

### Step 6: Slice and Print
1. Click **Slice Plate**
2. Review the preview
3. Click **Print Plate** or export G-code
4. Send to your Bambu printer

## Multi-Color Printing

CadLad supports exporting multi-color models for AMS (Automatic Material System) equipped printers.

### Example: Two-Color Part

```python
import cadquery as cq
from cadlad_mcp.exporter_3mf import export_multi_color_3mf

# Create base (wood brown)
base = cq.Workplane("XY").box(60, 60, 4)

# Create lettering (white)
letters = (
    cq.Workplane("XY")
    .workplane(offset=4)
    .text("CADLAD", 12, 2)
)

# Export with colors
components = [
    (base, (139, 90, 43)),      # RGB for wood brown
    (letters, (255, 255, 255))  # RGB for white
]

export_multi_color_3mf(
    components,
    "~/.cadlad/models/sign.3mf",
    material_name="PLA"
)
```

### Bambu AMS Configuration

When you import a multi-color 3MF:
1. Bambu Studio detects multiple objects with different colors
2. Assign each color to an AMS slot
3. The printer automatically switches filaments during printing

## Advanced: Custom Colors

You can manually export models with specific colors using Python:

```python
from cadlad_mcp.exporter_3mf import export_to_3mf
import cadquery as cq

# Create model
result = cq.Workplane("XY").box(20, 20, 10)

# Export with custom orange color
export_to_3mf(
    result,
    "~/.cadlad/models/orange_box.3mf",
    color=(255, 165, 0),  # RGB for orange
    material_name="PETG"
)
```

## Troubleshooting

### Issue: "File not found" in Bambu Studio

**Solution**: Verify the file exists:
```bash
ls -lh ~/.cadlad/models/your_model.3mf
```

### Issue: Model appears at wrong scale

**Solution**: CadLad exports in millimeters by default. In Bambu Studio:
1. Select the model
2. Check the dimensions in the properties panel
3. If needed, scale using the **Scale** tool (default should be correct)

### Issue: Model is upside down or rotated

**Solution**: In Bambu Studio, use the **Rotate** tool:
- Rotate 180° around X-axis to flip upside down
- Rotate 90° around Z-axis to change orientation

### Issue: 3MF export fails

**Solution**: Ensure `trimesh` is installed:
```bash
uv pip install trimesh
```

### Issue: Complex assemblies don't import correctly

**Solution**: For complex multi-part assemblies:
1. Use `.union()` in CadQuery to combine parts
2. Or export each part separately and assemble in Bambu Studio

## Tips for Best Results

### Design Tips
- **Wall Thickness**: Minimum 1.2mm (3 perimeters at 0.4mm nozzle)
- **Small Features**: Minimum 0.6mm for reliable printing
- **Overhangs**: Keep under 45° to avoid supports
- **Bridges**: Keep under 10mm for bridging without supports

### CadQuery Best Practices
```python
# Good: Rounds and fillets for strength
result = (
    cq.Workplane("XY")
    .box(30, 20, 10)
    .edges("|Z")
    .fillet(2)  # Rounded edges are stronger
)

# Good: Proper hole sizing for bolts
result = (
    cq.Workplane("XY")
    .box(40, 40, 5)
    .faces(">Z")
    .workplane()
    .hole(3.2)  # M3 bolt = 3mm + 0.2mm clearance
)
```

### Export Optimization
- **STL**: Good for simple models, universal compatibility
- **3MF**: Best for Bambu printers, preserves colors and metadata
- **STEP**: Best for editing in CAD software (Fusion 360, FreeCAD)

## File Format Comparison

| Format | Size | Colors | Metadata | Bambu Support | Recommended For |
|--------|------|--------|----------|---------------|----------------|
| **3MF** | Small | ✓ | ✓ | Native | Bambu printing (best choice) |
| **STL** | Large | ✗ | ✗ | ✓ | Universal compatibility |
| **STEP** | Medium | ✗ | ✓ | ✗ | CAD editing |

## Quick Reference

### Find Your Models
```bash
cd ~/.cadlad/models/
ls -lh *.3mf
```

### Export Specific Model
```python
# In CadLad MCP context
export_model(name="my_part", format="3mf")
```

### Manual Export with Color
```python
from cadlad_mcp.exporter_3mf import export_to_3mf
export_to_3mf(result, "part.3mf", color=(255, 0, 0))  # Red
```

## Resources

- **Bambu Studio**: https://bambulab.com/en/download/studio
- **CadQuery Documentation**: https://cadquery.readthedocs.io/
- **3MF Specification**: https://3mf.io/
- **Bambu Lab Wiki**: https://wiki.bambulab.com/

## Next Steps

1. **Create a test cube** to verify your workflow:
   ```python
   import cadquery as cq
   result = cq.Workplane("XY").box(20, 20, 20)
   ```

2. **Import to Bambu Studio** and verify dimensions (should be 20mm × 20mm × 20mm)

3. **Print a calibration cube** to ensure your printer is properly tuned

4. **Design your actual part** using CadQuery's parametric features

5. **Iterate quickly** - CadLad's automatic exports make the design-print cycle fast

Happy printing!
