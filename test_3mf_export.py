#!/usr/bin/env python3
"""Test script to verify 3MF export functionality."""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

import cadquery as cq
from cadlad_mcp.exporter_3mf import export_to_3mf, export_multi_color_3mf

def test_basic_export():
    """Test basic 3MF export with a simple box."""
    print("Testing basic 3MF export...")

    # Create a simple test model
    result = cq.Workplane("XY").box(20, 20, 10)

    # Export to test directory
    test_dir = Path.home() / ".cadlad" / "test_exports"
    test_dir.mkdir(parents=True, exist_ok=True)

    output_path = test_dir / "test_box.3mf"
    export_to_3mf(result, str(output_path))

    if output_path.exists():
        size = output_path.stat().st_size
        print(f"✓ Basic export successful: {output_path}")
        print(f"  File size: {size:,} bytes")
        return True
    else:
        print(f"✗ Export failed: file not created")
        return False


def test_colored_export():
    """Test 3MF export with custom color."""
    print("\nTesting colored 3MF export...")

    # Create a test model
    result = cq.Workplane("XY").box(30, 30, 5)

    test_dir = Path.home() / ".cadlad" / "test_exports"
    output_path = test_dir / "test_colored_box.3mf"

    # Export with orange color
    export_to_3mf(result, str(output_path), color=(255, 165, 0))

    if output_path.exists():
        size = output_path.stat().st_size
        print(f"✓ Colored export successful: {output_path}")
        print(f"  File size: {size:,} bytes")
        return True
    else:
        print(f"✗ Colored export failed")
        return False


def test_multi_color_export():
    """Test multi-color 3MF export."""
    print("\nTesting multi-color 3MF export...")

    # Create a two-part assembly
    base = cq.Workplane("XY").box(40, 40, 3)
    pillar = cq.Workplane("XY").box(8, 8, 20).translate((0, 0, 11.5))

    test_dir = Path.home() / ".cadlad" / "test_exports"
    output_path = test_dir / "test_multi_color.3mf"

    # Export with different colors
    components = [
        (base, (139, 90, 43)),    # Wood brown
        (pillar, (192, 192, 192))  # Silver
    ]

    export_multi_color_3mf(components, str(output_path))

    if output_path.exists():
        size = output_path.stat().st_size
        print(f"✓ Multi-color export successful: {output_path}")
        print(f"  File size: {size:,} bytes")
        return True
    else:
        print(f"✗ Multi-color export failed")
        return False


def test_example_model():
    """Test with an actual example from the repository."""
    print("\nTesting with simple_box example...")

    # Load and execute the simple box example
    example_file = Path(__file__).parent / "examples" / "simple_box" / "model.py"

    if not example_file.exists():
        print(f"✗ Example file not found: {example_file}")
        return False

    # Execute the example code
    namespace = {"cq": cq}
    with open(example_file) as f:
        code = f.read()
    exec(code, namespace)

    if "result" not in namespace:
        print("✗ Example didn't create 'result' variable")
        return False

    result = namespace["result"]

    # Export to test directory
    test_dir = Path.home() / ".cadlad" / "test_exports"
    output_path = test_dir / "simple_box_example.3mf"

    export_to_3mf(result, str(output_path))

    if output_path.exists():
        size = output_path.stat().st_size
        print(f"✓ Example model export successful: {output_path}")
        print(f"  File size: {size:,} bytes")
        return True
    else:
        print(f"✗ Example model export failed")
        return False


def main():
    """Run all tests."""
    print("=" * 60)
    print("3MF Export Test Suite")
    print("=" * 60)

    results = []

    try:
        results.append(("Basic Export", test_basic_export()))
        results.append(("Colored Export", test_colored_export()))
        results.append(("Multi-color Export", test_multi_color_export()))
        results.append(("Example Model", test_example_model()))
    except Exception as e:
        print(f"\n✗ Test suite failed with error: {e}")
        import traceback
        traceback.print_exc()
        return 1

    # Print summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for test_name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {test_name}")

    print(f"\nPassed: {passed}/{total}")

    if passed == total:
        print("\n✓ All tests passed!")
        print(f"\nTest exports saved to: {Path.home() / '.cadlad' / 'test_exports'}")
        return 0
    else:
        print(f"\n✗ {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
