"""3D model rendering utilities for inline visualization."""

import base64
import io
import os
import tempfile
from pathlib import Path
from typing import Any, cast

import cadquery as cq
from PIL import Image, ImageDraw, ImageFont
import numpy as np


def _has_display() -> bool:
    """Check if a display server is available for GPU-based rendering.

    Returns False in headless environments where PyVista would segfault
    (SIGABRT) instead of raising a catchable Python exception.
    """
    # Explicit opt-in to offscreen rendering (e.g. OSMesa/EGL backend)
    if os.environ.get("PYVISTA_OFF_SCREEN") == "true":
        return True
    # Check for X11 or Wayland display
    if os.environ.get("DISPLAY", "") or os.environ.get("WAYLAND_DISPLAY", ""):
        return True
    return False


def render_to_png(result: Any, width: int = 800, height: int = 600, view_angle: tuple = (45, 45, 0), components: dict[Any, Any] | None = None) -> bytes:
    """Render a CadQuery object to PNG bytes using multiple rendering strategies.

    Args:
        result: CadQuery Workplane or Shape object (or dict of components)
        width: Image width in pixels
        height: Image height in pixels
        view_angle: Tuple of (rotation_x, rotation_y, rotation_z) in degrees
        components: Optional dict mapping component names to (object, color) tuples
                   where color is RGB tuple like (139, 90, 43) for brown

    Returns:
        PNG image as bytes
    """
    # Strategy 1: Try 3D rendering with proper depth perception (trimesh + pyrender)
    # Skip PyVista entirely if no display is available — it will SIGABRT (segfault)
    # rather than raising a catchable Python exception.
    if _has_display():
        try:
            if components:
                return _render_components_via_3d(components, width, height, view_angle)
            else:
                return _render_via_3d(result, width, height, view_angle)
        except Exception as e:
            print(f"3D rendering failed: {e}, falling back to SVG", flush=True)
    else:
        print("No display available, skipping PyVista 3D rendering", flush=True)

    # Strategy 2: Try using CadQuery's exporters to SVG (fallback)
    try:
        if components:
            return _render_components_via_svg(components, width, height)
        else:
            return _render_via_svg(result, width, height)
    except Exception as e:
        print(f"SVG rendering failed: {e}", flush=True)
        pass

    # Strategy 3: Create an info image with model stats
    return _render_info_image(result, width, height)


def _render_via_3d(result: Any, width: int, height: int, view_angle: tuple = (45, 45, 0)) -> bytes:
    """Render using 3D engine (PyVista) for proper depth perception.

    Args:
        result: CadQuery Workplane or Shape object
        width: Image width in pixels
        height: Image height in pixels
        view_angle: Tuple of (rotation_x, rotation_y, rotation_z) in degrees

    Returns:
        PNG image as bytes
    """
    import pyvista as pv
    from cadquery import exporters

    # Export to STL mesh format
    with tempfile.NamedTemporaryFile(suffix='.stl', delete=False) as f:
        stl_path = f.name

    try:
        exporters.export(result, stl_path)

        # Load mesh with PyVista
        mesh = pv.read(stl_path)

        # Render the mesh
        return _render_mesh_to_png_pyvista(mesh, width, height, view_angle)

    finally:
        if os.path.exists(stl_path):
            os.unlink(stl_path)


def _render_components_via_3d(components: dict, width: int, height: int, view_angle: tuple = (45, 45, 0)) -> bytes:
    """Render multiple components with different colors using 3D engine.

    Args:
        components: Dict mapping component names to (object, color) tuples
        width: Image width in pixels
        height: Image height in pixels
        view_angle: Tuple of (rotation_x, rotation_y, rotation_z) in degrees

    Returns:
        PNG image as bytes
    """
    import pyvista as pv
    from cadquery import exporters

    stl_files = []
    meshes_with_colors = []

    try:
        # Export each component to STL
        for name, (obj, color) in components.items():
            with tempfile.NamedTemporaryFile(suffix='.stl', delete=False) as f:
                stl_path = f.name
                stl_files.append(stl_path)

            exporters.export(obj, stl_path)
            mesh = pv.read(stl_path)

            # Normalize RGB color from 0-255 to 0-1
            color_normalized = tuple(c / 255.0 for c in color)
            meshes_with_colors.append((mesh, color_normalized))

        # Render all meshes together
        return _render_meshes_to_png_pyvista(meshes_with_colors, width, height, view_angle)

    finally:
        # Clean up temp files
        for stl_path in stl_files:
            if os.path.exists(stl_path):
                os.unlink(stl_path)


def _render_mesh_to_png_pyvista(mesh, width: int, height: int, view_angle: tuple = (45, 45, 0),
                                 color: tuple[Any, ...] | None = None) -> bytes:
    """Render a single PyVista mesh to PNG with proper lighting and shading.

    Args:
        mesh: PyVista mesh object
        width: Image width
        height: Image height
        view_angle: (rx, ry, rz) rotation angles in degrees
        color: Optional RGB color tuple (0-1 range), defaults to light gray

    Returns:
        PNG bytes
    """
    import pyvista as pv

    # Default material color (light gray with slight blue tint for better depth)
    if color is None:
        color = (0.7, 0.75, 0.8)  # RGB

    # Create plotter with offscreen rendering
    plotter = pv.Plotter(off_screen=True, window_size=(width, height))

    # Add mesh with lighting for depth perception
    plotter.add_mesh(
        mesh,
        color=color,
        smooth_shading=True,
        specular=0.5,  # Specular highlights for depth
        specular_power=15,
        ambient=0.3,  # Ambient lighting
        diffuse=0.7,  # Diffuse lighting for better depth
        show_edges=False,
    )

    # Set up camera position based on view angle
    _setup_camera_pyvista(plotter, mesh, view_angle)

    # Enable better lighting with SSAO (Screen Space Ambient Occlusion) for depth
    plotter.enable_ssao(radius=12, bias=0.5, kernel_size=64, blur=True)

    # Set background to white
    plotter.background_color = 'white'

    # Render and capture screenshot
    img_array = plotter.screenshot(return_img=True, transparent_background=False)
    plotter.close()

    # Convert numpy array to PNG bytes
    img = Image.fromarray(img_array)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def _render_meshes_to_png_pyvista(meshes_with_colors: list, width: int, height: int,
                                  view_angle: tuple = (45, 45, 0)) -> bytes:
    """Render multiple PyVista meshes with different colors to PNG.

    Args:
        meshes_with_colors: List of (mesh, color) tuples where color is RGB 0-1 range
        width: Image width
        height: Image height
        view_angle: (rx, ry, rz) rotation angles in degrees

    Returns:
        PNG bytes
    """
    import pyvista as pv

    # Create plotter with offscreen rendering
    plotter = pv.Plotter(off_screen=True, window_size=(width, height))

    # Add each mesh with its color
    for mesh, color in meshes_with_colors:
        plotter.add_mesh(
            mesh,
            color=color,
            smooth_shading=True,
            specular=0.5,
            specular_power=15,
            ambient=0.3,
            diffuse=0.7,
            show_edges=False,
        )

    # Use first mesh for camera setup (all meshes should be in same scene)
    first_mesh = meshes_with_colors[0][0]
    _setup_camera_pyvista(plotter, first_mesh, view_angle)

    # Enable SSAO for depth perception
    plotter.enable_ssao(radius=12, bias=0.5, kernel_size=64, blur=True)

    # Set background to white
    plotter.background_color = 'white'

    # Render and capture screenshot
    img_array = plotter.screenshot(return_img=True, transparent_background=False)
    plotter.close()

    # Convert numpy array to PNG bytes
    img = Image.fromarray(img_array)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def _setup_camera_pyvista(plotter, mesh, view_angle: tuple = (45, 45, 0)) -> None:
    """Set up camera with proper perspective and viewing angle for PyVista.

    Args:
        plotter: PyVista plotter object
        mesh: PyVista mesh for bounds calculation
        view_angle: (rotation_x, rotation_y, rotation_z) in degrees
    """
    import pyvista as pv

    # Get mesh bounds and center
    bounds = mesh.bounds
    center = mesh.center

    # Calculate bounding box size
    size = np.sqrt(
        (bounds[1] - bounds[0])**2 +
        (bounds[3] - bounds[2])**2 +
        (bounds[5] - bounds[4])**2
    )

    # Convert view angles to radians
    rx, ry, rz = [np.radians(angle) for angle in view_angle]

    # Calculate camera position using spherical coordinates
    camera_distance = size * 2.0
    cam_x = camera_distance * np.cos(ry) * np.cos(rx)
    cam_y = camera_distance * np.sin(rx)
    cam_z = camera_distance * np.sin(ry) * np.cos(rx)

    camera_pos = center + np.array([cam_x, cam_y, cam_z])

    # Set camera position and point it at the center
    plotter.camera_position = [
        camera_pos,  # Camera position
        center,      # Focal point
        (0, 0, 1)    # View up direction
    ]

    # Enable perspective projection for better depth perception
    plotter.camera.parallel_projection = False


def _render_via_svg(result: Any, width: int, height: int) -> bytes:
    """Render using CadQuery's SVG export."""
    from cadquery import exporters

    with tempfile.NamedTemporaryFile(suffix='.svg', delete=False, mode='w') as f:
        svg_path = f.name

    try:
        # Export to SVG with finer lines
        exporters.export(result, svg_path, opt={
            'width': width,
            'height': height,
            'marginLeft': 10,
            'marginTop': 10,
            'showAxes': True,
            'projectionDir': (1, -1, 0.5),
            'strokeWidth': 0.3,  # Much finer lines
            'strokeColor': (0, 0, 0),
            'hiddenColor': (160, 160, 160),
            'showHidden': True,
        })

        # Try to convert SVG to PNG using cairosvg
        try:
            import cairosvg
            png_bytes = cairosvg.svg2png(url=svg_path, output_width=width, output_height=height)
            return cast(bytes, png_bytes)
        except ImportError:
            # cairosvg not available, try using svglib + reportlab
            try:
                from svglib.svglib import svg2rlg
                from reportlab.graphics import renderPM
                drawing = svg2rlg(svg_path)
                png_bytes = renderPM.drawToString(drawing, fmt='PNG')
                return cast(bytes, png_bytes)
            except ImportError:
                # Fall back to reading SVG and converting with PIL (basic)
                # This won't render the SVG properly but at least shows something
                raise Exception("No SVG renderer available")

    finally:
        if os.path.exists(svg_path):
            os.unlink(svg_path)


def _render_components_via_svg(components: dict, width: int, height: int) -> bytes:
    """Render multiple components with different colors by combining SVGs."""
    from cadquery import exporters
    import xml.etree.ElementTree as ET

    svg_files = []
    try:
        # Render each component to its own SVG with specified color
        for name, (obj, color) in components.items():
            with tempfile.NamedTemporaryFile(suffix='.svg', delete=False, mode='w') as f:
                svg_path = f.name
                svg_files.append((svg_path, color))

            # Export with component-specific color
            exporters.export(obj, svg_path, opt={
                'width': width,
                'height': height,
                'marginLeft': 10,
                'marginTop': 10,
                'showAxes': False,
                'projectionDir': (1, -1, 0.5),
                'strokeWidth': 0.3,  # Much finer lines
                'strokeColor': color,
                'hiddenColor': tuple(int(c * 0.7) for c in color),  # Darker version for hidden lines
                'showHidden': True,
            })

        # Combine SVGs by merging their content
        combined_svg = None
        for svg_path, color in svg_files:
            tree = ET.parse(svg_path)
            root = tree.getroot()

            if combined_svg is None:
                combined_svg = root
            else:
                # Append all children from this SVG to the combined one
                for child in root:
                    combined_svg.append(child)

        # Write combined SVG to temp file
        with tempfile.NamedTemporaryFile(suffix='.svg', delete=False, mode='wb') as f:
            combined_path = f.name
            ET.ElementTree(combined_svg).write(f, encoding='utf-8', xml_declaration=True)

        svg_files.append((combined_path, None))

        # Convert combined SVG to PNG
        try:
            import cairosvg
            png_bytes = cairosvg.svg2png(url=combined_path, output_width=width, output_height=height)
            return cast(bytes, png_bytes)
        except ImportError:
            try:
                from svglib.svglib import svg2rlg
                from reportlab.graphics import renderPM
                drawing = svg2rlg(combined_path)
                png_bytes = renderPM.drawToString(drawing, fmt='PNG')
                return cast(bytes, png_bytes)
            except ImportError:
                raise Exception("No SVG renderer available")

    finally:
        # Clean up all temp files
        for svg_path, _ in svg_files:
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
