"""3MF exporter for CadQuery models, optimized for Bambu Lab printers."""

import tempfile
from pathlib import Path
from typing import Optional, Tuple

import trimesh
from cadquery import exporters


def export_to_3mf(
    result,
    output_path: str,
    color: Optional[Tuple[int, int, int]] = None,
    material_name: str = "PLA",
    units: str = "millimeter"
) -> None:
    """
    Export a CadQuery model to 3MF format for Bambu Lab printers.

    3MF (3D Manufacturing Format) is the native format for Bambu Studio and supports:
    - Precise geometry
    - Colors and materials
    - Multiple objects with positioning
    - Metadata for manufacturing

    Args:
        result: CadQuery Workplane or Shape object
        output_path: Path where the 3MF file will be saved
        color: Optional RGB color tuple (0-255), e.g., (255, 128, 0) for orange
        material_name: Material name for metadata (default: "PLA")
        units: Units for the model (default: "millimeter")

    Example:
        >>> import cadquery as cq
        >>> from cadlad_mcp.exporter_3mf import export_to_3mf
        >>>
        >>> result = cq.Workplane("XY").box(20, 20, 10)
        >>> export_to_3mf(result, "box.3mf", color=(255, 165, 0))
    """
    # Create a temporary STL file since CadQuery exports STL reliably
    with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as tmp_stl:
        tmp_stl_path = tmp_stl.name

    try:
        # Export to STL using CadQuery's native exporter
        exporters.export(result, tmp_stl_path)

        # Load the STL with trimesh
        mesh = trimesh.load_mesh(tmp_stl_path)

        # Apply color if specified
        if color:
            # Normalize RGB values from 0-255 to 0-1 for trimesh
            normalized_color = [c / 255.0 for c in color] + [1.0]  # Add alpha
            mesh.visual.face_colors = normalized_color

        # Add metadata for 3D printing
        mesh.metadata = {
            "units": units,
            "material": material_name,
            "source": "CadLad MCP Server",
        }

        # Export to 3MF format
        # trimesh automatically handles the 3MF XML structure, including:
        # - Object definitions
        # - Build items (object placement)
        # - Material/color resources
        # - Relationships and content types
        mesh.export(output_path, file_type="3mf")

    finally:
        # Clean up temporary STL file
        Path(tmp_stl_path).unlink(missing_ok=True)


def export_multi_color_3mf(
    components: list[Tuple[any, Tuple[int, int, int]]],
    output_path: str,
    material_name: str = "PLA",
    units: str = "millimeter"
) -> None:
    """
    Export multiple CadQuery components with different colors to a single 3MF file.

    This is useful for multi-color prints or visualizing different parts of an assembly.

    Args:
        components: List of (cadquery_object, rgb_color) tuples
        output_path: Path where the 3MF file will be saved
        material_name: Material name for metadata (default: "PLA")
        units: Units for the model (default: "millimeter")

    Example:
        >>> import cadquery as cq
        >>> from cadlad_mcp.exporter_3mf import export_multi_color_3mf
        >>>
        >>> base = cq.Workplane("XY").box(30, 30, 2)
        >>> post = cq.Workplane("XY").box(4, 4, 20).translate((0, 0, 11))
        >>>
        >>> components = [
        ...     (base, (139, 90, 43)),   # Wood brown
        ...     (post, (192, 192, 192))  # Silver gray
        ... ]
        >>> export_multi_color_3mf(components, "assembly.3mf")
    """
    meshes = []

    # Create a temporary directory for STL files
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)

        for idx, (cq_object, color) in enumerate(components):
            # Export each component to STL
            stl_path = tmp_path / f"component_{idx}.stl"
            exporters.export(cq_object, str(stl_path))

            # Load with trimesh and apply color
            mesh = trimesh.load_mesh(str(stl_path))

            # Normalize RGB values from 0-255 to 0-1
            normalized_color = [c / 255.0 for c in color] + [1.0]  # Add alpha
            mesh.visual.face_colors = normalized_color

            meshes.append(mesh)

        # Combine all meshes into a scene
        scene = trimesh.Scene(meshes)

        # Add metadata
        scene.metadata = {
            "units": units,
            "material": material_name,
            "source": "CadLad MCP Server",
            "component_count": len(components)
        }

        # Export the scene to 3MF
        scene.export(output_path, file_type="3mf")
