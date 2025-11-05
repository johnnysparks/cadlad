"""Parametric Gear Example

A parametric gear design demonstrating more complex CadQuery operations
with parameters that can be easily modified.
"""

import cadquery as cq
import math

# Parameters
num_teeth = 20
module = 2.0  # mm per tooth
pressure_angle = 20  # degrees
thickness = 5  # mm
bore_diameter = 6  # mm


def create_gear(teeth, mod, angle, thick, bore):
    """Create a simplified gear with the given parameters.

    Note: This uses a simplified tooth profile. Production gears
    would use proper involute tooth profiles.
    """
    pitch_d = teeth * mod
    outer_d = pitch_d + (2 * mod)
    root_d = pitch_d - (2.5 * mod)

    result = (
        cq.Workplane("XY")
        .circle(outer_d / 2)  # Outer circle
        .extrude(thick)
        .faces(">Z")
        .workplane()
        .circle(bore / 2)  # Bore hole
        .cutThruAll()
    )

    # Add simplified teeth (using rectangles - real gears need involute curves)
    tooth_angle = 360 / teeth
    for i in range(teeth):
        angle_deg = i * tooth_angle
        result = (
            result
            .faces(">Z")
            .workplane()
            .transformed(rotate=(0, 0, angle_deg))
            .rect(mod * 0.5, outer_d * 0.6)
            .cutBlind(-thick / 2)
        )

    return result


# Create the gear
result = create_gear(num_teeth, module, pressure_angle, thickness, bore_diameter)
