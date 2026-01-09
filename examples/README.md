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

1. Create a new folder in `examples/`
2. Create `model.py` with your CadQuery code (must define a `result` variable)
3. Add the example name to the `EXAMPLES` list in `regenerate_examples.py`
4. Run `python regenerate_examples.py your_example_name` to generate PNG and STL
5. (Optional) Add a `README.md` with detailed documentation

## Code Organization Best Practices

When creating models, follow these principles for maintainable, scalable designs:

### Be Heavily Semantic

Use descriptive variable names that keep the purpose of parts top of mind:

```python
# Good - purpose is clear
vertical_bracket = cq.Workplane("XY").box(5.5, 1.5, 36)
mounting_holes = vertical_bracket.faces("<Y").pushPoints([...]).hole(0.1875)
left_arm = cq.Workplane("XY").box(5.5, 24, 1.5)

# Avoid - unclear purpose
b1 = cq.Workplane("XY").box(5.5, 1.5, 36)
holes = b1.faces("<Y").pushPoints([...]).hole(0.1875)
a = cq.Workplane("XY").box(5.5, 24, 1.5)
```

### Use Assemblies for Complex Designs

As parts become more complicated, break them into semantic sub-assemblies:

```python
# Build individual components
vertical_support = create_vertical_support()
horizontal_arms = create_horizontal_arms()

# Assemble into logical units
single_bracket = vertical_support.union(horizontal_arms)

# Create final assembly
left_bracket = single_bracket.translate((-POST_SPACING/2, 0, 0))
right_bracket = single_bracket.translate((POST_SPACING/2, 0, 0))
result = left_bracket.union(right_bracket)
```

This approach:
- Maintains healthy abstractions
- Makes designs more scalable and modifiable
- Keeps code readable as complexity grows
- Mirrors real-world manufacturing and assembly processes

See `lumber_storage_rack/model.py` for a complete example of these patterns.

## Requirements

All examples require:
- Python 3.10+
- CadQuery 2.4.0+
- Pillow (for rendering)

Install with:
```bash
pip install -e .
```
