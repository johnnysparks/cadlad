#!/usr/bin/env python3
"""Generate PNG rendering of the parametric organic vine bracket."""

import sys
import os
from pathlib import Path

# Add src and examples to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from cadlad_mcp.renderer import render_to_png

# Execute the model to get components
model_code = open(Path(__file__).parent / 'model.py').read()
exec(model_code)

# Render to PNG
# Note: This model works best with SVG rendering due to its organic complexity
print("\nRendering parametric vine bracket...")
png_bytes = render_to_png(result, width=1600, height=1200)

# Save PNG
output_path = Path(__file__).parent / 'render.png'
with open(output_path, 'wb') as f:
    f.write(png_bytes)

print(f"Saved: {output_path}\n")
