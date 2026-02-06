# CadLad Development TODOs

## Open Items

### 1. No Template or Scaffolding Command
**Problem**: Creating a new example requires manually creating the directory and copying boilerplate.
**Proposed**: Add a `python create_example.py <name>` script that scaffolds a new example with template files.

### 2. No Pre-Run Validation
**Problem**: If your CadQuery code has syntax errors or doesn't assign to `result`, you only find out at runtime.
**Proposed**: Add optional static analysis or at least a syntax check before execution.

### 3. Large STL File Sizes
**Problem**: Complex models with boolean operations (like the soccer ball at 77MB) produce very large STL files.
**Proposed**: Consider adding mesh decimation as an optional post-processing step, or document expected file sizes.

---

## Quick Reference: Adding a New Example

```bash
# 1. Install dependencies (you'll get a helpful error if missing)
pip install -e ".[rendering]"

# 2. Create example directory and model
mkdir -p examples/my_example
# Create examples/my_example/model.py (must assign to `result`)

# 3. Generate outputs (auto-discovers your new example)
python regenerate_examples.py my_example

# 4. Verify outputs exist
ls examples/my_example/  # Should show model.py, render.png, render.stl

# 5. Commit and push - CI will automatically validate
git add examples/my_example
git commit -m "Add my_example"
```
