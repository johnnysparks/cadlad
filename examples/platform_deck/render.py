#!/usr/bin/env python3
"""Generate PNG rendering of the simple platform deck model with colors."""

import sys
import os
from pathlib import Path
import cadquery as cq

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))

from cadlad_mcp.renderer import render_to_png

# Import the model (this creates separate component variables)
# We need to modify the model to export components separately
model_code = open(Path(__file__).parent / 'model.py').read()

# Replace the final result line to keep components separate
model_code = model_code.replace(
    "# 5. Combine all components\nresult = deck_surface.union(posts).union(beams).union(joists)",
    "# 5. Keep components separate for colored rendering\npass"
)

exec(model_code)

# Define colors for each component (RGB tuples)
COLORS = {
    'deck': (139, 90, 43),          # Wood brown (redwood)
    'posts': (120, 105, 70),        # Pressure-treated wood (greenish-brown)
    'beams': (120, 105, 70),        # Pressure-treated wood
    'joists': (120, 105, 70),       # Pressure-treated wood
}

# Add a ground plane for context
ground_margin = 40
ground_plane = (
    cq.Workplane("XY")
    .box(
        DECK_WIDTH + ground_margin * 2,
        DECK_LENGTH + ground_margin * 2,
        0.5
    )
    .translate((0, 0, -0.25))
)

# Create component dictionary for colored rendering
components = {
    'ground': (ground_plane, (85, 140, 70)),     # Grass green
    'posts': (posts, COLORS['posts']),
    'beams': (beams, COLORS['beams']),
    'joists': (joists, COLORS['joists']),
    'deck': (deck_surface, COLORS['deck']),
}

# Render to PNG with dimensions suitable for construction review
print("\nRendering simple rectangular deck with colors (isometric view)...")
png_bytes = render_to_png(None, width=1600, height=1200, components=components)

# Save PNG
output_path = Path(__file__).parent / 'render.png'
with open(output_path, 'wb') as f:
    f.write(png_bytes)

print(f"✓ Saved: {output_path}\n")
