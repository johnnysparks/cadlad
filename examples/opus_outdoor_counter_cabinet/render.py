#!/usr/bin/env python3
"""Generate PNG rendering of Opus's Outdoor Counter Cabinet with colors."""

import sys
import os
from pathlib import Path
import cadquery as cq

# Add src and examples to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from cadlad_mcp.renderer import render_to_png
from materials import SEMANTIC_GROUPS

# Import the model (this creates separate component variables)
model_code = open(Path(__file__).parent / 'model.py').read()

# Replace the final result line to keep components separate
model_code = model_code.replace(
    "# 9. COMBINE ALL COMPONENTS\nresult = (",
    "# 9. Keep components separate for colored rendering\n_skip = ("
)

exec(model_code)

# Use semantic material colors for clarity
COLORS = SEMANTIC_GROUPS['cabinet_structure']

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

# Create component dictionary for colored rendering with semantic materials
components = {
    'ground': (ground_plane, COLORS['ground']),
    'base_frame': (base_frame, COLORS['base_frame']),
    'walls': (all_walls, COLORS['walls']),
    'ledger': (ledger, COLORS['ledger']),
    'front_beam': (front_beam, COLORS['front_beam']),
    'joists': (joists, COLORS['joists']),
    'deck': (deck, COLORS['deck']),
    'doors': (all_doors, COLORS['doors']),
}

# Render to PNG with dimensions suitable for construction review
print("\nRendering Opus's Outdoor Counter Cabinet with colors (isometric view)...")
png_bytes = render_to_png(None, width=1600, height=1200, components=components)

# Save PNG
output_path = Path(__file__).parent / 'render.png'
with open(output_path, 'wb') as f:
    f.write(png_bytes)

print(f"Saved: {output_path}\n")
