# Installation Guide

## Prerequisites

- Python 3.10 or higher
- pip package manager
- Claude Code

## Step-by-Step Installation

### 1. Clone or Download This Repository

```bash
cd ~
git clone <repository-url> cadlad
# or if you already have it:
cd ~/cadlad
```

### 2. Install the MCP Server

```bash
cd ~/cadlad
pip install -e .
```

This installs CadLad in "editable" mode, so you can modify the code if needed.

### 3. (Optional) Install Rendering Enhancements

For better 3D visualizations, install the rendering extras:

```bash
pip install -e ".[rendering]"
```

This adds support for SVG to PNG conversion using cairosvg.

### 4. Configure Claude Code

You need to tell Claude Code about the MCP server.

#### Linux/macOS

Edit `~/.config/claude-code/config.json` and add:

```json
{
  "mcpServers": {
    "cadlad": {
      "command": "python",
      "args": ["-m", "cadlad_mcp.server"]
    }
  }
}
```

#### Windows

Edit `%APPDATA%\claude-code\config.json` and add the same configuration.

If the file doesn't exist, create it with this content:

```json
{
  "mcpServers": {
    "cadlad": {
      "command": "python",
      "args": ["-m", "cadlad_mcp.server"]
    }
  }
}
```

### 5. Restart Claude Code

Close and reopen Claude Code. The MCP server will start automatically.

### 6. Verify Installation

In Claude Code, try:

```
List all 3D models
```

If the MCP server is working, Claude will respond with available tools or an empty model list.

## Testing CadQuery Installation

To verify CadQuery works correctly, regenerate a simple example:

```bash
python regenerate_examples.py simple_box
```

This should generate `examples/simple_box/render.png` and `examples/simple_box/render.stl`.

## Troubleshooting

### "Module not found: cadquery"

CadQuery failed to install. Try:

```bash
pip install cadquery --upgrade
```

### "Module not found: cadlad_mcp"

Make sure you ran `pip install -e .` from the cadlad directory.

### MCP Server Not Starting

1. Check that Python is in your PATH:
   ```bash
   which python  # Linux/macOS
   where python  # Windows
   ```

2. Test the server manually:
   ```bash
   python -m cadlad_mcp.server
   ```

   It should start without errors (press Ctrl+C to exit).

3. Check Claude Code logs for error messages.

### Models Not Rendering

The basic renderer will show model statistics even without the rendering extras.

For better visualizations, install:

```bash
pip install cairosvg svglib reportlab
```

## Updating

To update CadLad:

```bash
cd ~/cadlad
git pull  # if using git
pip install -e . --upgrade
```

## Uninstalling

```bash
pip uninstall cadlad-mcp
```

Remove the MCP server configuration from Claude Code's config.json.

## Next Steps

- Read [README.md](README.md) for usage examples
- Check [EXAMPLES.md](EXAMPLES.md) for design patterns
- Try creating your first model in Claude Code!
