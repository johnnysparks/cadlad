#!/usr/bin/env python3
"""Generate PNG rendering of the simple box model."""

import sys
import os
from pathlib import Path

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))

from cadlad_mcp.renderer import render_to_png

# Import the model
exec(open(Path(__file__).parent / 'model.py').read())

# Render to PNG
print("Rendering simple box...")
png_bytes = render_to_png(result, width=800, height=600)

# Save PNG
output_path = Path(__file__).parent / 'render.png'
with open(output_path, 'wb') as f:
    f.write(png_bytes)

print(f"✓ Saved: {output_path}")
