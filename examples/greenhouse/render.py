#!/usr/bin/env python3
"""Generate PNG rendering of the greenhouse structure with colors."""

import sys
import os
from pathlib import Path
import cadquery as cq

# Add src and examples to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from cadlad_mcp.renderer import render_to_png
from materials import STRUCTURAL, CONTEXT

# Execute the model to get components
model_code = open(Path(__file__).parent / 'model.py').read()
exec(model_code)

# Define colors for greenhouse components
COLORS = {
    'sill_plates': STRUCTURAL['base_frame'],      # Foundation framing
    'corner_posts': STRUCTURAL['posts'],          # Vertical supports
    'studs': (80, 130, 190),                       # Lighter blue for studs
    'top_plates': STRUCTURAL['beams'],            # Horizontal primary
    'mid_rails': STRUCTURAL['joists'],            # Secondary framing
    'bottom_rails': STRUCTURAL['joists'],         # Secondary framing
    'rafters': (90, 140, 200),                    # Roof framing
    'fascia': (110, 90, 70),                      # Trim color
    'ground': CONTEXT['ground_grass'],            # Grass/lawn
}

# Add a ground plane for context
ground_margin = 24
ground_plane = (
    cq.Workplane("XY")
    .box(
        WIDTH + ground_margin * 2,
        DEPTH + ground_margin * 2,
        0.5
    )
    .translate((0, 0, -0.25))
)

# Create component dictionary for colored rendering
render_components = {
    'ground': (ground_plane, COLORS['ground']),
    'sill_plates': (sill_plates, COLORS['sill_plates']),
    'corner_posts': (corner_posts, COLORS['corner_posts']),
    'studs': (studs, COLORS['studs']),
    'top_plates': (top_plates, COLORS['top_plates']),
    'mid_rails': (mid_rails, COLORS['mid_rails']),
    'bottom_rails': (bottom_rails, COLORS['bottom_rails']),
    'rafters': (rafters, COLORS['rafters']),
    'fascia': (fascia, COLORS['fascia']),
}

# Render to PNG with dimensions suitable for construction review
print("\nRendering greenhouse structure with colors (isometric view)...")
png_bytes = render_to_png(None, width=1600, height=1200, components=render_components)

# Save PNG
output_path = Path(__file__).parent / 'render.png'
with open(output_path, 'wb') as f:
    f.write(png_bytes)

print(f"Saved: {output_path}\n")
