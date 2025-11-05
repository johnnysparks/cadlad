#!/usr/bin/env python3
"""Generate STL files for all example models."""

import sys
from pathlib import Path
from cadquery import exporters

# Add the examples to the path
examples_dir = Path(__file__).parent / "examples"

examples = [
    "simple_box",
    "parametric_gear",
    "platform_deck",
    "lumber_storage_rack"
]

for example_name in examples:
    example_path = examples_dir / example_name
    model_file = example_path / "model.py"
    stl_output = example_path / "render.stl"

    print(f"Processing {example_name}...")

    if not model_file.exists():
        print(f"  ⚠️  Model file not found: {model_file}")
        continue

    try:
        # Read and execute the model file
        namespace = {}
        with open(model_file, 'r') as f:
            code = f.read()
        exec(code, namespace)

        # Get the result object
        result = namespace.get('result')
        if result is None:
            print(f"  ⚠️  No 'result' variable found in {example_name}")
            continue

        # Export to STL
        exporters.export(result, str(stl_output))
        print(f"  ✓ Generated {stl_output}")

    except Exception as e:
        print(f"  ✗ Error processing {example_name}: {e}")
        continue

print("\nDone!")
