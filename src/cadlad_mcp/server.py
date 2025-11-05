"""MCP server for 3D CAD modeling with CadQuery."""

import asyncio
import base64
import io
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any

import cadquery as cq
from mcp.server import Server
from mcp.types import Tool, TextContent, ImageContent, EmbeddedResource

from .renderer import render_to_png

# Storage for models
MODELS_DIR = Path.home() / ".cadlad" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Keep track of models in memory
models_db = {}


app = Server("cadlad-mcp")


@app.list_tools()
async def list_tools() -> list[Tool]:
    """List available 3D modeling tools."""
    return [
        Tool(
            name="create_3d_model",
            description="""Create or modify a 3D model using CadQuery Python code.

Returns a rendered PNG image of the model for visualization.

The code should create a CadQuery Workplane and assign it to a variable named 'result'.

Example:
```python
import cadquery as cq

# Create a simple box
result = cq.Workplane("XY").box(10, 10, 10)
```

Example with more complexity:
```python
import cadquery as cq

# Create a parametric bearing pillow block
result = (
    cq.Workplane("XY")
    .box(60, 60, 10)
    .faces(">Z")
    .workplane()
    .hole(20)
    .faces(">Z")
    .workplane()
    .rect(50, 50, forConstruction=True)
    .vertices()
    .hole(5)
)
```

The model will be saved and can be exported to various formats (STL, STEP, etc.).""",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Name for this model (e.g., 'gear_v1', 'bracket')"
                    },
                    "code": {
                        "type": "string",
                        "description": "CadQuery Python code to generate the model. Must assign result to 'result' variable."
                    },
                    "description": {
                        "type": "string",
                        "description": "Optional description of what this model represents"
                    }
                },
                "required": ["name", "code"]
            }
        ),
        Tool(
            name="list_models",
            description="List all created 3D models with their descriptions.",
            inputSchema={
                "type": "object",
                "properties": {},
            }
        ),
        Tool(
            name="export_model",
            description="Export a model to STL, STEP, or other CAD format.",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Name of the model to export"
                    },
                    "format": {
                        "type": "string",
                        "enum": ["stl", "step", "svg", "dxf"],
                        "description": "Export format"
                    },
                    "output_path": {
                        "type": "string",
                        "description": "Optional output path. If not provided, saves to ~/.cadlad/exports/"
                    }
                },
                "required": ["name", "format"]
            }
        ),
        Tool(
            name="get_model_code",
            description="Retrieve the CadQuery code for a specific model.",
            inputSchema={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Name of the model"
                    }
                },
                "required": ["name"]
            }
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: Any) -> list[TextContent | ImageContent]:
    """Handle tool calls for 3D modeling operations."""

    if name == "create_3d_model":
        model_name = arguments["name"]
        code = arguments["code"]
        description = arguments.get("description", "")

        try:
            # Execute the CadQuery code
            namespace = {"cq": cq}
            exec(code, namespace)

            if "result" not in namespace:
                return [TextContent(
                    type="text",
                    text=f"Error: Code must assign the model to a variable named 'result'"
                )]

            result = namespace["result"]

            # Save the model data
            model_data = {
                "name": model_name,
                "code": code,
                "description": description,
            }

            models_db[model_name] = model_data

            # Save to disk
            model_file = MODELS_DIR / f"{model_name}.json"
            with open(model_file, 'w') as f:
                json.dump(model_data, f, indent=2)

            # Export STL for later use
            from cadquery import exporters
            stl_path = MODELS_DIR / f"{model_name}.stl"
            exporters.export(result, str(stl_path))

            # Also save STEP format (better for parametric data)
            step_path = MODELS_DIR / f"{model_name}.step"
            exporters.export(result, str(step_path))

            # Render to image
            png_bytes = render_to_png(result)
            png_base64 = base64.b64encode(png_bytes).decode('utf-8')

            return [
                TextContent(
                    type="text",
                    text=f"""✓ Model '{model_name}' created successfully!

Description: {description if description else 'No description'}
Saved to: {model_file}
Exported formats: STL, STEP

Model visualization rendered below."""
                ),
                ImageContent(
                    type="image",
                    data=png_base64,
                    mimeType="image/png"
                )
            ]

        except Exception as e:
            error_msg = f"Error creating model:\n{traceback.format_exc()}"
            return [TextContent(type="text", text=error_msg)]

    elif name == "list_models":
        if not models_db and MODELS_DIR.exists():
            # Load models from disk
            for model_file in MODELS_DIR.glob("*.json"):
                try:
                    with open(model_file) as f:
                        model_data = json.load(f)
                        models_db[model_data["name"]] = model_data
                except Exception:
                    pass

        if not models_db:
            return [TextContent(
                type="text",
                text="No models created yet. Use create_3d_model to create your first model!"
            )]

        model_list = []
        for name, data in models_db.items():
            desc = data.get("description", "No description")
            model_list.append(f"• {name}: {desc}")

        return [TextContent(
            type="text",
            text=f"Created models ({len(models_db)}):\n" + "\n".join(model_list)
        )]

    elif name == "export_model":
        model_name = arguments["name"]
        format_type = arguments["format"]
        output_path = arguments.get("output_path")

        if model_name not in models_db:
            # Try to load from disk
            model_file = MODELS_DIR / f"{model_name}.json"
            if model_file.exists():
                with open(model_file) as f:
                    models_db[model_name] = json.load(f)
            else:
                return [TextContent(
                    type="text",
                    text=f"Error: Model '{model_name}' not found"
                )]

        model_data = models_db[model_name]
        code = model_data["code"]

        try:
            # Execute code to get the model
            namespace = {"cq": cq}
            exec(code, namespace)
            result = namespace["result"]

            # Determine output path
            if output_path:
                export_path = Path(output_path)
            else:
                exports_dir = Path.home() / ".cadlad" / "exports"
                exports_dir.mkdir(parents=True, exist_ok=True)
                export_path = exports_dir / f"{model_name}.{format_type}"

            # Export
            from cadquery import exporters
            exporters.export(result, str(export_path))

            return [TextContent(
                type="text",
                text=f"✓ Model '{model_name}' exported to {export_path}"
            )]

        except Exception as e:
            return [TextContent(
                type="text",
                text=f"Error exporting model:\n{traceback.format_exc()}"
            )]

    elif name == "get_model_code":
        model_name = arguments["name"]

        if model_name not in models_db:
            # Try to load from disk
            model_file = MODELS_DIR / f"{model_name}.json"
            if model_file.exists():
                with open(model_file) as f:
                    models_db[model_name] = json.load(f)
            else:
                return [TextContent(
                    type="text",
                    text=f"Error: Model '{model_name}' not found"
                )]

        model_data = models_db[model_name]

        return [TextContent(
            type="text",
            text=f"""Model: {model_name}
Description: {model_data.get('description', 'No description')}

CadQuery Code:
```python
{model_data['code']}
```"""
        )]

    else:
        return [TextContent(
            type="text",
            text=f"Unknown tool: {name}"
        )]


async def main():
    """Run the MCP server."""
    from mcp.server.stdio import stdio_server

    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
