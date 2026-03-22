#!/usr/bin/env bash
# Install git hooks for this repo.
# Run once after cloning: ./scripts/install-hooks.sh

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

cat > "$HOOKS_DIR/post-commit" << 'HOOKEOF'
#!/usr/bin/env bash
# post-commit hook — kicks off CI checks in background, never blocks.
REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/scripts/ci-check-bg.sh"
[ -x "$SCRIPT" ] && nohup "$SCRIPT" &>/dev/null &
exit 0
HOOKEOF

chmod +x "$HOOKS_DIR/post-commit"
echo "Installed post-commit hook."
