#!/usr/bin/env bash
# Install git hooks for this repo.
# Run once after cloning: ./scripts/install-hooks.sh

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

# Use local hooks (override any global core.hooksPath)
git config --local core.hooksPath .git/hooks

# Pre-commit: always pass (never block commits)
cat > "$HOOKS_DIR/pre-commit" << 'HOOKEOF'
#!/usr/bin/env bash
exit 0
HOOKEOF
chmod +x "$HOOKS_DIR/pre-commit"
echo "Installed pre-commit hook (pass-through)."

# Post-commit: background CI checks + snapshot tests
cat > "$HOOKS_DIR/post-commit" << 'HOOKEOF'
#!/usr/bin/env bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/scripts/ci-check-bg.sh"
[ -x "$SCRIPT" ] && nohup "$SCRIPT" &>/dev/null &
exit 0
HOOKEOF
chmod +x "$HOOKS_DIR/post-commit"
echo "Installed post-commit hook (background CI + snapshots)."
