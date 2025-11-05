# CadLad - 3D Modeling with Claude Code

An MCP (Model Context Protocol) server that enables Claude Code to create, iterate, and visualize 3D CAD models inline using CadQuery.

## Features

- **Create 3D Models**: Generate parametric CAD models using Python/CadQuery
- **Inline Visualization**: See rendered previews of your models directly in Claude Code
- **Iteration Loop**: Claude can iteratively refine designs based on your feedback
- **Export Support**: Save models as STL, STEP, SVG, or DXF formats
- **Local & Fast**: No cloud dependencies, runs entirely on your machine

## Quick Start

### 1. Installation

```bash
# Install the MCP server
cd /home/user/cadlad
pip install -e .

# Optional: Install better rendering (recommended)
pip install -e ".[rendering]"
```

### 2. Configure Claude Code

Add the MCP server to your Claude Code configuration:

**For Linux/macOS**: Edit `~/.config/claude-code/config.json`
**For Windows**: Edit `%APPDATA%\claude-code\config.json`

```json
{
  "mcpServers": {
    "cadlad": {
      "command": "python",
      "args": ["-m", "cadlad_mcp.server"],
      "cwd": "/home/user/cadlad/src"
    }
  }
}
```

### 3. Restart Claude Code

The MCP server will automatically start when you launch Claude Code.

## Usage Examples

### Basic: Create a Simple Box

```
Create a 3D model of a 10x10x10mm cube
```

Claude will generate CadQuery code and show you a rendered preview!

### Iteration Loop Example

```
Create a parametric gear with 20 teeth and a 5mm bore hole.
Then iterate to make it larger and add mounting holes.
```

Claude will:
1. Generate initial gear model
2. Show you the visualization
3. Modify based on feedback
4. Re-render and show updates
5. Repeat until you're satisfied

### Advanced: Parametric Design

```
Design a bearing pillow block with:
- 60mm x 60mm base, 10mm thick
- 20mm center hole
- 4 mounting holes (5mm) in corners
- Rounded edges

Then export it as STL for 3D printing
```

## Available MCP Tools

### `create_3d_model`
Creates or updates a 3D model from CadQuery code.

**Parameters:**
- `name`: Model identifier (e.g., "gear_v1")
- `code`: CadQuery Python code (must assign to `result` variable)
- `description`: Optional model description

**Returns:** Rendered PNG visualization

### `list_models`
Lists all created models with descriptions.

### `export_model`
Exports a model to STL, STEP, SVG, or DXF format.

**Parameters:**
- `name`: Model name
- `format`: Export format (stl, step, svg, dxf)
- `output_path`: Optional custom path

### `get_model_code`
Retrieves the CadQuery code for a specific model.

## CadQuery Primer

CadQuery uses a fluent API for 3D modeling:

```python
import cadquery as cq

# Simple box
result = cq.Workplane("XY").box(10, 10, 10)

# Box with hole
result = (
    cq.Workplane("XY")
    .box(10, 10, 10)
    .faces(">Z")
    .hole(3)
)

# Cylinder
result = cq.Workplane("XY").cylinder(height=10, radius=5)

# Complex parametric design
result = (
    cq.Workplane("XY")
    .box(60, 60, 10)  # Base
    .faces(">Z").workplane()  # Top face
    .hole(20)  # Center hole
    .faces(">Z").workplane()
    .rect(50, 50, forConstruction=True)  # Construction geometry
    .vertices()  # Select corner vertices
    .hole(5)  # Mounting holes
)
```

## Model Storage

Models are saved to `~/.cadlad/models/` as:
- `.json` - Model metadata and code
- `.stl` - 3D printable format
- `.step` - Parametric CAD format

Exports go to `~/.cadlad/exports/` by default.

## Example Iteration Session

```
You: Create a simple gear with 12 teeth

Claude: [Creates gear, shows visualization]

You: Make it bigger and add 16 teeth instead

Claude: [Updates model, shows new visualization]

You: Perfect! Add a 6mm hexagonal bore hole

Claude: [Adds hex hole, shows final visualization]

You: Export this as STL

Claude: [Exports to ~/.cadlad/exports/gear.stl]
```

## Troubleshooting

### Models not rendering properly?
Install the optional rendering dependencies:
```bash
pip install -e ".[rendering]"
```

### MCP server not starting?
Check Claude Code logs and ensure Python is in your PATH.

### Need help with CadQuery syntax?
See the [CadQuery documentation](https://cadquery.readthedocs.io/)

## Development

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests (coming soon)
pytest

# Format code
black src/
```

## License

MIT
