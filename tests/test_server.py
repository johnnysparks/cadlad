"""Tests for the MCP server tool definitions and project consistency."""

import ast
import pytest
from pathlib import Path


ROOT = Path(__file__).parent.parent


class TestServerSource:
    """Verify server.py source structure without importing heavy dependencies."""

    def _parse_server(self):
        return ast.parse((ROOT / "src" / "cadlad_mcp" / "server.py").read_text())

    def test_no_unused_imports(self):
        """server.py should not import modules it doesn't use."""
        source = (ROOT / "src" / "cadlad_mcp" / "server.py").read_text()
        # These were previously imported but unused
        assert "import io\n" not in source
        assert "import os\n" not in source
        assert "import sys\n" not in source
        assert "EmbeddedResource" not in source

    def test_defines_four_tool_names(self):
        """server.py should define exactly 4 MCP tool names."""
        source = (ROOT / "src" / "cadlad_mcp" / "server.py").read_text()
        expected_tools = ["create_3d_model", "list_models", "export_model", "get_model_code"]
        for tool in expected_tools:
            assert f'"{tool}"' in source or f"'{tool}'" in source, (
                f"Tool '{tool}' not found in server.py"
            )

    def test_no_variable_shadowing_in_list_models(self):
        """The list_models handler should not shadow the 'name' parameter."""
        source = (ROOT / "src" / "cadlad_mcp" / "server.py").read_text()
        assert "for name, data in models_db" not in source, (
            "Loop variable 'name' shadows the function parameter 'name'"
        )

    def test_exporters_imported_at_top_level(self):
        """cadquery.exporters should be imported once at the top, not inline."""
        source = (ROOT / "src" / "cadlad_mcp" / "server.py").read_text()
        lines = source.splitlines()
        # Should have a top-level import
        assert any(
            line.strip() == "from cadquery import exporters"
            for line in lines[:20]
        ), "exporters should be imported at module level"
        # Should NOT have inline re-imports
        inline_imports = [
            i for i, line in enumerate(lines[20:], start=21)
            if "from cadquery import exporters" in line
        ]
        assert inline_imports == [], (
            f"Found redundant inline 'from cadquery import exporters' at lines {inline_imports}"
        )


class TestRendererSource:
    """Verify renderer.py source structure."""

    def test_render_to_png_is_defined(self):
        source = (ROOT / "src" / "cadlad_mcp" / "renderer.py").read_text()
        assert "def render_to_png(" in source

    def test_has_fallback_rendering(self):
        """Renderer should have a fallback info image strategy."""
        source = (ROOT / "src" / "cadlad_mcp" / "renderer.py").read_text()
        assert "_render_info_image" in source


class TestExampleDiscovery:
    """Test that examples are properly structured."""

    def test_discover_finds_all_examples(self):
        """All example directories with model.py should be discovered."""
        examples_dir = ROOT / "examples"
        if not examples_dir.exists():
            pytest.skip("examples directory not found")

        discovered = []
        for item in examples_dir.iterdir():
            if item.is_dir() and (item / "model.py").exists():
                discovered.append(item.name)

        assert len(discovered) >= 10, (
            f"Expected at least 10 examples, found {len(discovered)}: {discovered}"
        )

    def test_all_examples_have_model_py(self):
        """Every example directory must have a model.py file."""
        examples_dir = ROOT / "examples"
        if not examples_dir.exists():
            pytest.skip("examples directory not found")

        for item in examples_dir.iterdir():
            if item.is_dir() and item.name != "__pycache__":
                assert (item / "model.py").exists(), (
                    f"Example {item.name}/ is missing model.py"
                )

    def test_no_orphan_render_py_files(self):
        """render.py files should not exist (they are dead code)."""
        examples_dir = ROOT / "examples"
        if not examples_dir.exists():
            pytest.skip("examples directory not found")

        orphans = []
        for item in examples_dir.iterdir():
            if item.is_dir():
                render_py = item / "render.py"
                if render_py.exists():
                    orphans.append(str(render_py))

        assert orphans == [], (
            f"Found orphan render.py files (should be deleted): {orphans}"
        )

    def test_examples_assign_result_variable(self):
        """Every model.py must contain a `result` assignment."""
        examples_dir = ROOT / "examples"
        if not examples_dir.exists():
            pytest.skip("examples directory not found")

        for item in examples_dir.iterdir():
            if item.is_dir() and (item / "model.py").exists():
                code = (item / "model.py").read_text()
                # Check for `result = ` assignment (not just `result` as a substring)
                assert "result = " in code or "result=" in code, (
                    f"Example {item.name}/model.py does not assign to 'result'"
                )

    def test_model_py_files_are_valid_python(self):
        """Every model.py should be valid Python syntax."""
        examples_dir = ROOT / "examples"
        if not examples_dir.exists():
            pytest.skip("examples directory not found")

        for item in examples_dir.iterdir():
            if item.is_dir() and (item / "model.py").exists():
                code = (item / "model.py").read_text()
                try:
                    ast.parse(code)
                except SyntaxError as e:
                    pytest.fail(f"Example {item.name}/model.py has syntax error: {e}")


class TestProjectConsistency:
    """Test that project files are internally consistent."""

    def test_version_matches_across_files(self):
        """Version in __init__.py should match pyproject.toml."""
        pyproject = (ROOT / "pyproject.toml").read_text()
        init_py = (ROOT / "src" / "cadlad_mcp" / "__init__.py").read_text()

        for line in pyproject.splitlines():
            if line.startswith("version"):
                pyproject_version = line.split('"')[1]
                break
        else:
            pytest.fail("No version found in pyproject.toml")

        assert pyproject_version in init_py, (
            f"Version mismatch: pyproject.toml has {pyproject_version} "
            f"but __init__.py does not contain it"
        )

    def test_no_dead_generate_stl_exports(self):
        """The superseded generate_stl_exports.py should not exist."""
        assert not (ROOT / "generate_stl_exports.py").exists(), (
            "generate_stl_exports.py still exists but is superseded by regenerate_examples.py"
        )

    def test_no_materials_py_in_examples(self):
        """materials.py should not exist (only used by deleted render.py files)."""
        assert not (ROOT / "examples" / "materials.py").exists(), (
            "examples/materials.py still exists but is dead code"
        )

    def test_no_duplicate_optional_deps(self):
        """Dependencies in core should not also appear in optional groups."""
        pyproject = (ROOT / "pyproject.toml").read_text()

        # Simple parse: find core deps and optional deps
        in_core = False
        in_rendering = False
        core_deps = set()
        rendering_deps = set()

        for line in pyproject.splitlines():
            stripped = line.strip()
            if stripped.startswith("dependencies"):
                in_core = True
                continue
            if stripped.startswith("rendering"):
                in_rendering = True
                continue
            if stripped == "]":
                in_core = False
                in_rendering = False
                continue
            if in_core and stripped.startswith('"'):
                pkg = stripped.strip('",').split(">=")[0].split(">=")[0].lower()
                core_deps.add(pkg)
            if in_rendering and stripped.startswith('"'):
                pkg = stripped.strip('",').split(">=")[0].split(">=")[0].lower()
                rendering_deps.add(pkg)

        overlap = core_deps & rendering_deps
        assert overlap == set(), (
            f"These packages are in both core and rendering deps: {overlap}"
        )

    def test_readme_does_not_reference_coming_soon(self):
        """README should not say tests are 'coming soon'."""
        readme = (ROOT / "README.md").read_text()
        assert "coming soon" not in readme.lower()

    def test_readme_mcp_config_has_no_hardcoded_cwd(self):
        """MCP config example should not have a machine-specific cwd."""
        readme = (ROOT / "README.md").read_text()
        assert "/home/user/cadlad/src" not in readme

    def test_install_md_references_valid_paths(self):
        """INSTALL.md should not reference non-existent files."""
        install = (ROOT / "INSTALL.md").read_text()
        # The old broken reference
        assert "examples/simple_box.py" not in install
