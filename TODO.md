# CadLad Development TODOs

This file tracks workflow improvements identified while creating new example models.

---

## Workflow Friction Points Discovered

While creating the `soccer_ball` example, the following issues were encountered:

### 1. Dependencies Not Installed by Default
**Problem**: Running `regenerate_examples.py` immediately fails with `ModuleNotFoundError: No module named 'cadquery'` if dependencies aren't installed.
**Current workaround**: Must manually run `pip install -e ".[rendering]"` first.
**TODO**: Add a check at the top of `regenerate_examples.py` that detects missing deps and prints a helpful message.

### 2. No Auto-Discovery of Examples
**Problem**: New examples must be manually added to the `EXAMPLES` list in `regenerate_examples.py`.
**TODO**: Auto-discover examples by scanning `examples/*/model.py` instead of maintaining a hardcoded list.

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

### 7. No CI Check for New Contributors
**Problem**: The GitHub Action only triggers on existing example changes - a new example won't get validated until it's already merged.
**TODO**: Update CI to auto-discover and validate all examples, not just track changes to known ones.

---

## Quick Reference: Adding a New Example

Until the above TODOs are addressed, here's the manual workflow:

```bash
# 1. Install dependencies (if not done)
pip install -e ".[rendering]"

# 2. Create example directory
mkdir -p examples/my_example

# 3. Create model.py (MUST assign result to `result` variable)
cat > examples/my_example/model.py << 'EOF'
"""My Example Model"""
import cadquery as cq

result = cq.Workplane("XY").box(10, 10, 10)
EOF

# 4. Create render.py (copy from another example and update name)
# (See examples/simple_box/render.py for template)

# 5. Add to EXAMPLES list in regenerate_examples.py
# Edit the EXAMPLES list to include "my_example"

# 6. Generate outputs
python regenerate_examples.py my_example

# 7. Verify outputs exist
ls examples/my_example/  # Should show model.py, render.py, render.png, render.stl
```

---

## Priority Order

1. **High**: Auto-discover examples (eliminates manual list maintenance)
2. **High**: Add dependency check with helpful error message
3. **Medium**: Create scaffolding script for new examples
4. **Medium**: Update CI for auto-discovery
5. **Low**: Remove redundant render.py files
6. **Low**: Add mesh decimation options
