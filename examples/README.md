# CadLad Examples

This folder contains example CAD models demonstrating the capabilities of CadLad MCP server.

## Structure

Each example is organized in its own folder with the following files:

- `model.py` - The CadQuery model definition (must assign to `result`)
- `render.png` - Pre-rendered PNG visualization
- `render.stl` - Exported STL mesh
- `README.md` - (Optional) Detailed documentation for complex examples

## Available Examples

### Simple Box (`simple_box/`)

A basic 10x10x10mm box demonstrating fundamental CadQuery operations.

### Parametric Gear (`parametric_gear/`)

A parametric spur gear with configurable teeth count, module, pressure angle, thickness, and bore diameter.

### Lumber Storage Rack (`lumber_storage_rack/`)

A fence-mounted cantilever lumber storage rack with 4 storage levels. See `lumber_storage_rack/README.md` for build instructions.

### Platform Deck (`platform_deck/`)

A 10' x 10' rectangular platform deck with posts, beams, joists, and decking.

### Greenhouse (`greenhouse/`)

An 8' x 6' backyard greenhouse frame with shed-style roof, wood frame, and door opening.

### Opus Outdoor Counter Cabinet (`opus_outdoor_counter_cabinet/`)

A 12' outdoor counter with concrete countertop, 4 cabinet bays, and double doors.

### Opus Outdoor Counter Cabinet Frame (`opus_outdoor_counter_cabinet_frame/`)

Frame-only version of the outdoor counter using exclusively 2x6 lumber.

### Outdoor Countertop (`outdoor_countertop/`)

A 12' x 18" outdoor countertop with concrete pour-in-place surface and base structure.

### Soccer Ball (`soccer_ball/`)

A classic soccer ball with 12 black pentagons positioned at icosahedron vertices.

### Wall Vent Hood (`wall_vent_hood/`)

A 6-inch wall vent hood with redirected discharge chute.

## Regenerating Example Outputs

Whenever you update an example's `model.py` file, regenerate the outputs to keep them in sync:

```bash
# All examples
python regenerate_examples.py

# Specific example
python regenerate_examples.py simple_box
```

New examples are auto-discovered (no manual list to maintain).

## Creating New Examples

1. Complete the [Design Brief Template](../docs/DESIGN_BRIEF_TEMPLATE.md) first
2. Create a new folder: `mkdir -p examples/my_example`
3. Create `model.py` that assigns a CadQuery result to `result`
4. Run `python regenerate_examples.py my_example` to generate PNG and STL
5. (Optional) Add a `README.md` for complex models

See the [Modeling Workflow Guide](../docs/MODELING_WORKFLOW.md) for best practices.

### Code Structure Pattern

```python
"""
Brief: [One-line description]
Assembly: [foundation] -> [middle] -> [top]
"""
import cadquery as cq

# ===== DESIGN PARAMETERS =====
WIDTH = 96        # X-axis (inches)
DEPTH = 72        # Y-axis (inches)

# ===== DERIVED DIMENSIONS =====
half_width = WIDTH / 2

# ===== COMPONENT BUILDERS =====
def make_base():
    """Base sits on ground at Z=0"""
    ...

# ===== ASSEMBLY =====
result = make_base().union(make_frame())

# ===== OUTPUT =====
print(f"Model: {WIDTH}\" x {DEPTH}\"")
```

## Requirements

- Python 3.10+
- CadQuery 2.4.0+

Install with:
```bash
pip install -e .
```
