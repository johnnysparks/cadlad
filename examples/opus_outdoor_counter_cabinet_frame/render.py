#!/usr/bin/env python3
"""Generate PNG rendering of Opus's Outdoor Counter Cabinet Frame with colors."""

import sys
import os
from pathlib import Path
import cadquery as cq

# Add src and examples to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from cadlad_mcp.renderer import render_to_png
from materials import STRUCTURAL, CONTEXT

# Import the model (this creates separate component variables)
model_code = open(Path(__file__).parent / 'model.py').read()

# Replace the final result line to keep components separate
model_code = model_code.replace(
    "# 7. COMBINE ALL FRAME COMPONENTS\nresult = (",
    "# 7. Keep components separate for colored rendering\n_skip = ("
)

exec(model_code)

# Frame-specific colors (all structural elements)
FRAME_COLORS = {
    'base_frame': STRUCTURAL['base_frame'],
    'walls': (140, 160, 180),           # Slightly different blue-gray for wall frames
    'ledger': STRUCTURAL['ledger'],
    'front_beam': STRUCTURAL['beams'],
    'joists': STRUCTURAL['joists'],
    'ground': CONTEXT['ground_concrete'],
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
    'ground': (ground_plane, FRAME_COLORS['ground']),
    'base_frame': (base_frame, FRAME_COLORS['base_frame']),
    'walls': (all_walls, FRAME_COLORS['walls']),
    'ledger': (ledger, FRAME_COLORS['ledger']),
    'front_beam': (front_beam, FRAME_COLORS['front_beam']),
    'joists': (joists, FRAME_COLORS['joists']),
}

# Render to PNG with dimensions suitable for construction review
print("\nRendering Opus's Outdoor Counter Cabinet Frame (2x6 only, isometric view)...")
png_bytes = render_to_png(None, width=1600, height=1200, components=components)

# Save PNG
output_path = Path(__file__).parent / 'render.png'
with open(output_path, 'wb') as f:
    f.write(png_bytes)

print(f"Saved: {output_path}\n")
