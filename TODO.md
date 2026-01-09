# CadLad Development TODOs

This file tracks workflow improvements identified while creating new example models.

---

## Workflow Friction Points Discovered

While creating the `soccer_ball` example, the following issues were encountered:

### 1. Dependencies Not Installed by Default ✅ COMPLETED
**Problem**: Running `regenerate_examples.py` immediately fails with `ModuleNotFoundError: No module named 'cadquery'` if dependencies aren't installed.
**Solution**: Added `check_dependencies()` function that detects missing dependencies and prints helpful installation instructions before attempting imports.
**Location**: `regenerate_examples.py:18-55`

### 2. No Auto-Discovery of Examples ✅ COMPLETED
**Problem**: New examples must be manually added to the `EXAMPLES` list in `regenerate_examples.py`.
**Solution**: Implemented `discover_examples()` function that auto-discovers examples by scanning for `examples/*/model.py` files. The hardcoded list has been removed.
**Location**: `regenerate_examples.py:65-86`
**Impact**: Discovered 7 examples including `opus_outdoor_counter_frame` which was missing from the original hardcoded list!

### 3. Redundant render.py Files
**Problem**: Each example has a `render.py` script, but `regenerate_examples.py` doesn't use them - it duplicates the rendering logic.
**TODO**: Either remove individual `render.py` files, or have `regenerate_examples.py` call them directly for consistency.

### 4. No Template or Scaffolding Command
**Problem**: Creating a new example requires manually creating the directory, copying boilerplate from another example, etc.
**TODO**: Add a `python create_example.py <name>` script that scaffolds a new example with template files.

### 5. No Pre-Run Validation
**Problem**: If your CadQuery code has syntax errors or doesn't assign to `result`, you only find out at runtime.
**TODO**: Add optional static analysis or at least a syntax check before execution.

### 6. Large STL File Sizes
**Problem**: Complex models with boolean operations (like the soccer ball at 77MB) produce very large STL files.
**TODO**: Consider adding mesh decimation as an optional post-processing step, or document expected file sizes.

### 7. No CI Check for New Contributors ✅ COMPLETED
**Problem**: The GitHub Action only triggers on existing example changes - a new example won't get validated until it's already merged.
**Solution**:
- CI now triggers on `examples/**/model.py` which catches new examples automatically
- `regenerate_examples.py` uses auto-discovery, so all examples are validated
- Added renderer path to CI triggers to catch dependency changes
- Updated workflow comments to clarify auto-discovery behavior
**Location**: `.github/workflows/regenerate-examples.yml:3-18`

---

## Quick Reference: Adding a New Example

With the improvements made, the workflow is now much simpler:

```bash
# 1. Install dependencies (if not done - you'll get a helpful error if missing)
pip install -e ".[rendering]"

# 2. Create example directory
mkdir -p examples/my_example

# 3. Create model.py (MUST assign result to `result` variable)
cat > examples/my_example/model.py << 'EOF'
"""My Example Model"""
import cadquery as cq

result = cq.Workplane("XY").box(10, 10, 10)
EOF

# 4. Generate outputs (auto-discovers your new example!)
python regenerate_examples.py my_example

# 5. Verify outputs exist
ls examples/my_example/  # Should show model.py, render.png, render.stl

# 6. Commit and push - CI will automatically validate your example
git add examples/my_example
git commit -m "Add my_example"
git push
```

**Key improvements:**
- ✅ No need to manually edit EXAMPLES list - auto-discovery finds your example
- ✅ Helpful error messages if dependencies are missing
- ✅ CI automatically validates all examples including new ones

---

## Priority Order

1. ~~**High**: Auto-discover examples (eliminates manual list maintenance)~~ ✅ COMPLETED
2. ~~**High**: Add dependency check with helpful error message~~ ✅ COMPLETED
3. **Medium**: Create scaffolding script for new examples
4. ~~**Medium**: Update CI for auto-discovery~~ ✅ COMPLETED
5. **Low**: Remove redundant render.py files
6. **Low**: Add mesh decimation options

## Summary of Completed Work

Three high-priority workflow improvements have been completed:

1. **Dependency Check**: The script now checks for missing dependencies before attempting to import them and provides clear installation instructions.

2. **Auto-Discovery**: Examples are automatically discovered by scanning the `examples/` directory for subdirectories containing `model.py` files. This eliminated the need to manually maintain the EXAMPLES list and immediately discovered a previously missing example (`opus_outdoor_counter_frame`).

3. **CI Auto-Discovery**: The GitHub Actions workflow now triggers on any new `model.py` file and uses the auto-discovery feature to validate all examples, including new ones.

These improvements significantly reduce friction when creating new examples and ensure that new examples are validated before merging.
