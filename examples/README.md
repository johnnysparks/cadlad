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

## Regenerating Example Outputs

**IMPORTANT**: Whenever you update an example's `model.py` file, you **must** regenerate both the PNG render and STL model to keep them in sync.

### Regenerate All Examples

```bash
# From the repository root
python regenerate_examples.py
```

### Regenerate a Specific Example

```bash
python regenerate_examples.py simple_box
```

This ensures that:
- `render.png` - PNG visualization is up to date
- `render.stl` - STL model file is up to date

## Creating Your Own Examples

**Before writing any code**, complete the [Design Brief Template](../docs/DESIGN_BRIEF_TEMPLATE.md). Models with clear design briefs are typically correct on the first attempt; models without them average 3+ redesign cycles.

See the [Modeling Workflow Guide](../docs/MODELING_WORKFLOW.md) for detailed best practices.

### Quick Start

1. Complete the design brief (30% of your time should be here)
2. Create a new folder in `examples/`
3. Create `model.py` with your CadQuery code (must define a `result` variable)
4. Run `python regenerate_examples.py your_example_name` to generate PNG and STL
5. (Optional) Add a `README.md` with detailed documentation

### Code Structure Pattern

```python
"""
Brief: [One-line description]
Assembly: [foundation] → [middle] → [top]
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
print(f"Model: {WIDTH}\" × {DEPTH}\"")
```

## Requirements

All examples require:
- Python 3.10+
- CadQuery 2.4.0+
- Pillow (for rendering)

Install with:
```bash
pip install -e .
```
