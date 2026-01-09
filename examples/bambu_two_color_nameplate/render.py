"""
Custom renderer for two-color nameplate example.

This script exports the nameplate with two distinct colors for Bambu AMS printing.
"""

import sys
from pathlib import Path

# Add src to path for direct execution
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

import cadquery as cq
from cadlad_mcp.exporter_3mf import export_multi_color_3mf

# Parameters (must match model.py)
plate_width = 80
plate_depth = 30
plate_thickness = 3
text_height = 1.5

# Create base plate (dark gray)
base = (
    cq.Workplane("XY")
    .box(plate_width, plate_depth, plate_thickness)
    .edges("|Z")
    .fillet(2)
)

# Create raised text (bright white)
text = (
    cq.Workplane("XY")
    .workplane(offset=plate_thickness / 2)
    .text("CADLAD", 10, text_height, font="Arial")
)

# Define components with colors
components = [
    (base, (64, 64, 64)),      # Dark gray base
    (text, (255, 255, 255))    # White text
]

# Export to home directory for easy access
output_dir = Path.home() / ".cadlad" / "models"
output_dir.mkdir(parents=True, exist_ok=True)
output_path = output_dir / "bambu_two_color_nameplate.3mf"

print("Exporting two-color nameplate...")
export_multi_color_3mf(components, str(output_path), material_name="PLA")
print(f"✓ Exported to: {output_path}")
print("\nTo print:")
print("1. Open Bambu Studio")
print("2. Import the .3mf file")
print("3. Assign dark gray to AMS slot 1")
print("4. Assign white to AMS slot 2")
print("5. Slice and print!")
