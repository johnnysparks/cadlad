#!/usr/bin/env python3
"""
Render the lumber storage rack and save outputs
"""
import sys
import os

# Add src to path so we can import cadlad_mcp
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from pathlib import Path
from cadlad_mcp.renderer import render_to_png, save_model_thumbnail
import cadquery as cq

# Import the model from lumber_storage_rack.py
exec(open('examples/lumber_storage_rack.py').read())

# Render to PNG
print("Rendering lumber storage rack...")
png_bytes = render_to_png(result, width=1200, height=800)

# Save PNG
output_dir = Path.home() / '.cadlad' / 'exports'
output_dir.mkdir(parents=True, exist_ok=True)

png_path = output_dir / 'lumber_rack_design.png'
with open(png_path, 'wb') as f:
    f.write(png_bytes)

print(f"✓ Saved visualization: {png_path}")

# Export STL for 3D viewing
stl_path = output_dir / 'lumber_rack_design.stl'
cq.exporters.export(result, str(stl_path))
print(f"✓ Saved 3D model: {stl_path}")

# Export STEP for CAD software
step_path = output_dir / 'lumber_rack_design.step'
cq.exporters.export(result, str(step_path))
print(f"✓ Saved CAD file: {step_path}")

print(f"\nOpen these files to view the design:")
print(f"  - PNG: {png_path}")
print(f"  - 3D Model (STL): {stl_path}")
print(f"  - CAD (STEP): {step_path}")
