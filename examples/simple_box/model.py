"""Simple Box Example

A basic 10x10x10mm box demonstrating fundamental CadQuery operations.
"""

import cadquery as cq

# Create a simple box
result = cq.Workplane("XY").box(10, 10, 10)
