"""
Example: Two-Color Nameplate for Bambu AMS

This example demonstrates multi-color 3D printing for Bambu Lab printers
with AMS (Automatic Material System).

The model consists of:
- Base plate (one color)
- Raised text (second color)

To print this example:
1. Run the accompanying render.py to export with colors
2. Import the .3mf file into Bambu Studio
3. Assign each color to an AMS slot
4. Print!

Recommended settings:
- Material: PLA
- Layer Height: 0.1mm (for text detail)
- Infill: 15%
"""

import cadquery as cq

# Parameters
plate_width = 80
plate_depth = 30
plate_thickness = 3
text_height = 1.5

# Create base plate
base = (
    cq.Workplane("XY")
    .box(plate_width, plate_depth, plate_thickness)
    .edges("|Z")
    .fillet(2)
)

# Create raised text
text = (
    cq.Workplane("XY")
    .workplane(offset=plate_thickness / 2)
    .text("CADLAD", 10, text_height, font="Arial")
)

# For single-color preview, combine them
result = base.union(text)

# Note: To export with two colors, run the render.py script
# which uses export_multi_color_3mf()
