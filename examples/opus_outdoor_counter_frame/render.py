#!/usr/bin/env python3
"""Generate PNG rendering of Opus's Outdoor Counter Frame with colors."""

import sys
import os
from pathlib import Path
import cadquery as cq

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))

from cadlad_mcp.renderer import render_to_png

# Import the model (this creates separate component variables)
model_code = open(Path(__file__).parent / 'model.py').read()

# Replace the final result line to keep components separate
model_code = model_code.replace(
    "# 8. COMBINE ALL COMPONENTS\nresult = (",
    "# 8. Keep components separate for colored rendering\n_skip = ("
)

exec(model_code)

# Define colors for each component (RGB tuples)
COLORS = {
    'ledger': (120, 105, 70),           # Pressure-treated wood (greenish-brown)
    'front_beam': (120, 105, 70),       # Pressure-treated wood
    'base_frame': (100, 90, 60),        # Pressure-treated wood (slightly darker for ground contact)
    'support_walls': (140, 120, 85),    # Pressure-treated 2x4s (lighter framing)
    'joists': (120, 105, 70),           # Pressure-treated wood
    'deck': (200, 180, 140),            # Plywood (light tan)
    'panels': (180, 160, 120),          # Plywood panels (slightly darker)
}

# Add a ground plane for context
ground_margin = 20
ground_plane = (
    cq.Workplane("XY")
    .box(
        COUNTER_LENGTH + ground_margin * 2,
        COUNTER_DEPTH + ground_margin * 2,
        0.5
    )
    .translate((0, 0, -0.25))
)

# Create component dictionary for colored rendering
components = {
    'ground': (ground_plane, (140, 130, 120)),    # Concrete/patio gray-brown
    'base_frame': (base_frame, COLORS['base_frame']),
    'support_walls': (support_walls, COLORS['support_walls']),
    'ledger': (ledger, COLORS['ledger']),
    'front_beam': (front_beam, COLORS['front_beam']),
    'joists': (joists, COLORS['joists']),
    'deck': (deck, COLORS['deck']),
    'panels': (shear_panels, COLORS['panels']),
}

# Render to PNG with dimensions suitable for construction review
print("\nRendering Opus's Outdoor Counter Frame with colors (isometric view)...")
png_bytes = render_to_png(None, width=1600, height=1200, components=components)

# Save PNG
output_path = Path(__file__).parent / 'render.png'
with open(output_path, 'wb') as f:
    f.write(png_bytes)

print(f"Saved: {output_path}\n")
