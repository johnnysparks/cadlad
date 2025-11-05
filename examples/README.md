# CadLad Examples

This folder contains example CAD models demonstrating the capabilities of CadLad MCP server.

## Structure

Each example is organized in its own folder with the following files:

- `model.py` - The CadQuery model definition
- `render.py` - Script to generate a PNG rendering of the model
- `render.png` - Pre-rendered PNG visualization
- `README.md` - (Optional) Detailed documentation for complex examples

## Available Examples

### 1. Simple Box (`simple_box/`)

A basic 10x10x10mm box demonstrating fundamental CadQuery operations.

**What you'll learn:**
- Basic workplane creation
- Simple box primitive
- Basic CadQuery syntax

### 2. Parametric Gear (`parametric_gear/`)

A parametric gear design with configurable parameters.

**What you'll learn:**
- Parametric design patterns
- Functions for reusable components
- Circular patterns and transformations
- Boolean operations (cuts)

**Parameters:**
- Number of teeth
- Module (mm per tooth)
- Pressure angle
- Thickness
- Bore diameter

### 3. Lumber Storage Rack (`lumber_storage_rack/`)

A real-world fence-mounted lumber storage rack design.

**What you'll learn:**
- Complex assemblies with multiple components
- Practical engineering design
- Mounting holes and hardware considerations
- Design for real-world manufacturing

See `lumber_storage_rack/README.md` for detailed build instructions.

## Running the Examples

### View a model

Each folder contains a pre-rendered `render.png` that you can view directly.

### Generate a new rendering

```bash
cd examples/simple_box
python3 render.py
```

### Use with CadLad MCP

The MCP server can execute these models and return inline visualizations:

```python
# In your MCP client
execute_cadquery(open('examples/simple_box/model.py').read())
```

### Export to 3D formats

Add export code to any model:

```python
from cadquery import exporters

# Export to STL for 3D printing
exporters.export(result, "output.stl")

# Export to STEP for CAD software
exporters.export(result, "output.step")
```

## Creating Your Own Examples

1. Create a new folder in `examples/`
2. Create `model.py` with your CadQuery code (must define a `result` variable)
3. Copy `render.py` from another example
4. Run `python3 render.py` to generate the PNG
5. (Optional) Add a `README.md` with detailed documentation

## Requirements

All examples require:
- Python 3.10+
- CadQuery 2.4.0+
- Pillow (for rendering)

Install with:
```bash
pip install -e .
```
