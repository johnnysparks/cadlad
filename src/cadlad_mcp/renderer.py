"""3D model rendering utilities for inline visualization."""

import base64
import io
import os
import tempfile
from pathlib import Path
from typing import Any

import cadquery as cq
from PIL import Image, ImageDraw, ImageFont


def render_to_png(result: Any, width: int = 800, height: int = 600, view_angle: tuple = (45, 45, 0)) -> bytes:
    """Render a CadQuery object to PNG bytes using multiple rendering strategies.

    Args:
        result: CadQuery Workplane or Shape object
        width: Image width in pixels
        height: Image height in pixels
        view_angle: Tuple of (rotation_x, rotation_y, rotation_z) in degrees

    Returns:
        PNG image as bytes
    """
    # Strategy 1: Try using CadQuery's exporters to SVG
    try:
        return _render_via_svg(result, width, height)
    except Exception as e:
        print(f"SVG rendering failed: {e}", flush=True)
        pass

    # Strategy 2: Create an info image with model stats
    return _render_info_image(result, width, height)


def _render_via_svg(result: Any, width: int, height: int) -> bytes:
    """Render using CadQuery's SVG export."""
    from cadquery import exporters

    with tempfile.NamedTemporaryFile(suffix='.svg', delete=False, mode='w') as f:
        svg_path = f.name

    try:
        # Export to SVG
        exporters.export(result, svg_path, opt={
            'width': width,
            'height': height,
            'marginLeft': 10,
            'marginTop': 10,
            'showAxes': True,
            'projectionDir': (1, -1, 0.5),
            'strokeWidth': 1,
            'strokeColor': (0, 0, 0),
            'hiddenColor': (160, 160, 160),
            'showHidden': True,
        })

        # Try to convert SVG to PNG using cairosvg
        try:
            import cairosvg
            png_bytes = cairosvg.svg2png(url=svg_path, output_width=width, output_height=height)
            return png_bytes
        except ImportError:
            # cairosvg not available, try using svglib + reportlab
            try:
                from svglib.svglib import svg2rlg
                from reportlab.graphics import renderPM
                drawing = svg2rlg(svg_path)
                png_bytes = renderPM.drawToString(drawing, fmt='PNG')
                return png_bytes
            except ImportError:
                # Fall back to reading SVG and converting with PIL (basic)
                # This won't render the SVG properly but at least shows something
                raise Exception("No SVG renderer available")

    finally:
        if os.path.exists(svg_path):
            os.unlink(svg_path)


def _render_info_image(result: Any, width: int, height: int) -> bytes:
    """Create an informational image with model statistics."""
    # Create image
    img = Image.new('RGB', (width, height), color='#f0f0f0')
    draw = ImageDraw.Draw(img)

    # Try to get model info
    try:
        # Get bounding box
        bbox = result.val().BoundingBox()
        dimensions = (
            f"X: {bbox.xlen:.2f}mm\n"
            f"Y: {bbox.ylen:.2f}mm\n"
            f"Z: {bbox.zlen:.2f}mm"
        )
        volume = f"{result.val().Volume():.2f} mm³"

        # Draw title
        title = "3D Model Generated"
        draw.text((20, 20), title, fill='#333333')

        # Draw info
        info_y = 60
        draw.text((20, info_y), "Dimensions:", fill='#666666')
        draw.text((20, info_y + 25), dimensions, fill='#333333')

        draw.text((20, info_y + 110), f"Volume: {volume}", fill='#333333')

        # Draw a simple wireframe representation
        draw.text((20, height - 60), "✓ Model created successfully", fill='#00AA00')
        draw.text((20, height - 35), "Export to STL/STEP for full visualization", fill='#666666')

        # Draw a simple 3D box representation
        box_x = width - 250
        box_y = height // 2 - 75
        box_size = 150

        # Simple isometric box
        points_front = [
            (box_x, box_y + box_size // 2),
            (box_x + box_size // 2, box_y + box_size // 4),
            (box_x + box_size // 2, box_y + box_size * 3 // 4),
            (box_x, box_y + box_size),
        ]
        draw.polygon(points_front, outline='#0066CC', fill='#CCE5FF', width=2)

        points_top = [
            (box_x, box_y + box_size // 2),
            (box_x + box_size // 2, box_y + box_size // 4),
            (box_x + box_size, box_y + box_size // 2),
            (box_x + box_size // 2, box_y + box_size * 3 // 4),
        ]
        draw.polygon(points_top, outline='#0066CC', fill='#99CCFF', width=2)

        points_right = [
            (box_x + box_size // 2, box_y + box_size // 4),
            (box_x + box_size, box_y + box_size // 2),
            (box_x + box_size, box_y + box_size),
            (box_x + box_size // 2, box_y + box_size * 3 // 4),
        ]
        draw.polygon(points_right, outline='#0066CC', fill='#6699FF', width=2)

    except Exception as e:
        draw.text((20, height // 2), f"Model created (stats unavailable)", fill='#333333')
        draw.text((20, height // 2 + 30), f"Error: {str(e)[:60]}", fill='#CC0000')

    # Convert to bytes
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def save_model_thumbnail(result: Any, output_path: Path) -> None:
    """Save a thumbnail of the model to a file.

    Args:
        result: CadQuery object
        output_path: Path to save PNG thumbnail
    """
    png_bytes = render_to_png(result, width=400, height=400)
    with open(output_path, 'wb') as f:
        f.write(png_bytes)
