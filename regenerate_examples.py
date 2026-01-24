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
from typing import Any


def check_dependencies():
    """Check if required dependencies are installed.

    Exits with error message if dependencies are missing.
    """
    missing_deps = []

    try:
        import cadquery
    except ImportError:
        missing_deps.append("cadquery")

    try:
        from cadquery import exporters
    except ImportError:
        missing_deps.append("cadquery.exporters")

    # Add src to path for renderer check
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

    try:
        from cadlad_mcp.renderer import render_to_png
    except ImportError:
        missing_deps.append("cadlad_mcp.renderer")

    if missing_deps:
        print("\n" + "="*60)
        print("ERROR: Missing Required Dependencies")
        print("="*60)
        print("\nThe following dependencies are not installed:")
        for dep in missing_deps:
            print(f"  • {dep}")
        print("\nTo install dependencies, run:")
        print("  pip install -e \".[rendering]\"")
        print("\nOr for development with all extras:")
        print("  pip install -e \".[dev]\"")
        print("="*60 + "\n")
        sys.exit(1)


# Check dependencies before importing them
check_dependencies()

from cadquery import exporters
from cadlad_mcp.renderer import render_to_png


def discover_examples():
    """Auto-discover examples by scanning for examples/*/model.py files.

    Returns:
        list: Sorted list of example directory names
    """
    examples_dir = Path(__file__).parent / "examples"

    if not examples_dir.exists():
        return []

    examples = []
    for item in examples_dir.iterdir():
        if item.is_dir() and (item / "model.py").exists():
            examples.append(item.name)

    return sorted(examples)


# Auto-discover examples
EXAMPLES_DIR = Path(__file__).parent / "examples"
EXAMPLES = discover_examples()


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
        namespace: dict[str, Any] = {}
        with open(model_file, 'r') as f:
            code = f.read()
        exec(code, namespace)

        # Get the result object
        result = namespace.get('result')
        if result is None:
            print(f"  ✗ No 'result' variable found in {example_name}")
            return False

        # Check if the model provides colored components
        components = namespace.get('components')

        # Generate PNG render
        print(f"  → Rendering PNG...")
        if components:
            png_bytes = render_to_png(result, width=800, height=600, components=components)
        else:
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
    # Check if any examples were discovered
    if not EXAMPLES:
        print("\n" + "="*60)
        print("No examples found!")
        print("="*60)
        print("\nNo example directories with model.py files were found.")
        print(f"Looking in: {EXAMPLES_DIR}")
        print("\nTo create a new example, create a directory in examples/")
        print("with a model.py file that assigns a CadQuery result to 'result'.")
        print("="*60 + "\n")
        sys.exit(1)

    # Parse command line arguments
    if len(sys.argv) > 1:
        # Regenerate specific example
        example_name = sys.argv[1]
        if example_name not in EXAMPLES:
            print(f"\nError: Unknown example '{example_name}'")
            print(f"\nAvailable examples: {', '.join(EXAMPLES)}")
            sys.exit(1)
        examples_to_process = [example_name]
    else:
        # Regenerate all examples
        examples_to_process = EXAMPLES

    print("\n" + "="*60)
    print("CadLad Example Regeneration")
    print("="*60)
    print(f"Found {len(EXAMPLES)} example(s): {', '.join(EXAMPLES)}")
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
