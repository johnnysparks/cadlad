"""
Example: Mounting Bracket for 3D Printing on Bambu Lab Printers

This example creates a practical mounting bracket that demonstrates:
- Proper wall thickness for 3D printing
- Mounting holes with clearance
- Filleted edges for strength
- Automatic 3MF export for Bambu Studio

Recommended print settings:
- Material: PLA or PETG
- Layer Height: 0.2mm
- Infill: 20%
- Supports: Not needed (no overhangs)
"""

import cadquery as cq

# Parameters
bracket_width = 50
bracket_depth = 40
bracket_thickness = 5
mounting_hole_diameter = 4.2  # M4 screw with 0.2mm clearance
hole_spacing = 30
fillet_radius = 2

# Create the mounting bracket
result = (
    cq.Workplane("XY")
    # Main plate
    .box(bracket_width, bracket_depth, bracket_thickness)
    # Add vertical mounting tab
    .faces(">Y")
    .workplane()
    .transformed(offset=(0, 0, bracket_thickness / 2))
    .rect(bracket_width, 30)
    .extrude(bracket_thickness)
    # Fillet all vertical edges for strength
    .edges("|Z")
    .fillet(fillet_radius)
    # Add mounting holes to the vertical tab
    .faces(">Y")
    .workplane(centerOption="CenterOfBoundBox")
    .pushPoints([(hole_spacing / 2, 10), (-hole_spacing / 2, 10)])
    .hole(mounting_hole_diameter)
    # Add center hole to the base
    .faces(">Z")
    .workplane()
    .hole(mounting_hole_diameter)
)

# This model will automatically export to:
# ~/.cadlad/models/bambu_mounting_bracket.3mf
#
# To print on Bambu Lab printer:
# 1. Open Bambu Studio
# 2. Drag ~/.cadlad/models/bambu_mounting_bracket.3mf onto the build plate
# 3. Slice and print!
