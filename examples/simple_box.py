"""Example: Create a simple box using CadQuery.

This demonstrates the basic CadQuery code that the MCP server executes.
You can run this standalone to test CadQuery installation.
"""

import cadquery as cq

# Create a simple box
result = cq.Workplane("XY").box(10, 10, 10)

# Print bounding box info
bbox = result.val().BoundingBox()
print(f"Box dimensions: {bbox.xlen} x {bbox.ylen} x {bbox.zlen}")
print(f"Volume: {result.val().Volume()} mm³")

# Export to STL
from cadquery import exporters
exporters.export(result, "/tmp/simple_box.stl")
print("Exported to /tmp/simple_box.stl")

# Export to STEP
exporters.export(result, "/tmp/simple_box.step")
print("Exported to /tmp/simple_box.step")
