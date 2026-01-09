#!/usr/bin/env python3
"""Regenerate all example outputs (PNG renders and STL models).

This script should be run whenever example model files are updated to ensure
that the rendered outputs stay in sync with the model code.

Usage:
    python regenerate_examples.py [example_name]

    If no example name is provided, all examples will be regenerated.
"""

import sys
import os
from pathlib import Path
from cadquery import exporters

# Add src to path for renderer
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from cadlad_mcp.renderer import render_to_png

# Define all examples
EXAMPLES_DIR = Path(__file__).parent / "examples"
EXAMPLES = [
    "simple_box",
    "parametric_gear",
    "platform_deck",
    "lumber_storage_rack",
    "outdoor_countertop",
    "soccer_ball"
]


def regenerate_example(example_name: str) -> bool:
    """Regenerate PNG and STL for a single example.

    Args:
        example_name: Name of the example directory

    Returns:
        True if successful, False otherwise
    """
    example_path = EXAMPLES_DIR / example_name
    model_file = example_path / "model.py"
    png_output = example_path / "render.png"
    stl_output = example_path / "render.stl"

    print(f"\n{'='*60}")
    print(f"Processing: {example_name}")
    print(f"{'='*60}")

    if not model_file.exists():
        print(f"  ✗ Model file not found: {model_file}")
        return False

    try:
        # Read and execute the model file
        namespace = {}
        with open(model_file, 'r') as f:
            code = f.read()
        exec(code, namespace)

        # Get the result object
        result = namespace.get('result')
        if result is None:
            print(f"  ✗ No 'result' variable found in {example_name}")
            return False

        # Generate PNG render
        print(f"  → Rendering PNG...")
        png_bytes = render_to_png(result, width=800, height=600)
        with open(png_output, 'wb') as f:
            f.write(png_bytes)
        print(f"  ✓ Generated: {png_output}")

        # Export to STL
        print(f"  → Exporting STL...")
        exporters.export(result, str(stl_output))
        print(f"  ✓ Generated: {stl_output}")

        return True

    except Exception as e:
        print(f"  ✗ Error processing {example_name}: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main entry point."""
    # Parse command line arguments
    if len(sys.argv) > 1:
        # Regenerate specific example
        example_name = sys.argv[1]
        if example_name not in EXAMPLES:
            print(f"Error: Unknown example '{example_name}'")
            print(f"Available examples: {', '.join(EXAMPLES)}")
            sys.exit(1)
        examples_to_process = [example_name]
    else:
        # Regenerate all examples
        examples_to_process = EXAMPLES

    print("\n" + "="*60)
    print("CadLad Example Regeneration")
    print("="*60)
    print(f"Processing {len(examples_to_process)} example(s)...")

    # Process each example
    success_count = 0
    failure_count = 0

    for example_name in examples_to_process:
        if regenerate_example(example_name):
            success_count += 1
        else:
            failure_count += 1

    # Print summary
    print("\n" + "="*60)
    print("Summary")
    print("="*60)
    print(f"  ✓ Successful: {success_count}")
    print(f"  ✗ Failed: {failure_count}")
    print("="*60)

    # Exit with appropriate code
    sys.exit(0 if failure_count == 0 else 1)


if __name__ == "__main__":
    main()
