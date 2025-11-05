#!/usr/bin/env python3
"""Generate PNG rendering of the platform deck model with colors."""

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
    "# 7. Combine all components\nresult = deck_surface.union(posts).union(beams).union(joists)\nresult = result.union(north_ref_line).union(east_ref_line)",
    "# 7. Keep components separate for colored rendering\npass"
)

exec(model_code)

# Define colors for each component (RGB tuples)
COLORS = {
    'deck': (139, 90, 43),          # Wood brown (redwood)
    'posts': (120, 105, 70),        # Pressure-treated wood (greenish-brown)
    'beams': (120, 105, 70),        # Pressure-treated wood
    'joists': (120, 105, 70),       # Pressure-treated wood
    'references': (150, 150, 150),  # Light gray for property lines
}

# Add a ground plane for context
min_x = min(p[0] for p in deck_points)
max_x = max(p[0] for p in deck_points)
min_y = min(p[1] for p in deck_points)
max_y = max(p[1] for p in deck_points)

# Create a larger ground plane with grass color
ground_margin = 40
ground_plane = (
    cq.Workplane("XY")
    .box(
        max_x - min_x + ground_margin * 2,
        max_y - min_y + ground_margin * 2,
        0.5
    )
    .translate((
        (max_x + min_x) / 2,
        (max_y + min_y) / 2,
        -0.25
    ))
)

# Create component dictionary for colored rendering
components = {
    'ground': (ground_plane, (85, 140, 70)),     # Grass green
    'posts': (posts, COLORS['posts']),
    'beams': (beams, COLORS['beams']),
    'joists': (joists, COLORS['joists']),
    'deck': (deck_surface, COLORS['deck']),
    'references': (north_ref_line.union(east_ref_line), COLORS['references']),
}

# Render to PNG with dimensions suitable for construction review
print("\nRendering platform deck with colors (isometric view)...")
png_bytes = render_to_png(None, width=1600, height=1200, components=components)

# Save PNG
output_path = Path(__file__).parent / 'render.png'
with open(output_path, 'wb') as f:
    f.write(png_bytes)

print(f"✓ Saved: {output_path}\n")
