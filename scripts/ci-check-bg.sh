#!/usr/bin/env bash
# ci-check-bg.sh — Background CI check runner
#
# Runs lint, typecheck, and tests after a commit. If anything fails,
# spawns a claude agent to fix the issues, commits the fix, and
# notifies the user. Designed to never block the developer's flow.
#
# Usage: called by .git/hooks/post-commit (backgrounded)
#   You can also run it manually: ./scripts/ci-check-bg.sh

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Ensure node_modules/.bin is on PATH (so npm scripts find eslint, tsc, vitest)
export PATH="$REPO_ROOT/node_modules/.bin:$PATH"

LOGFILE="/tmp/cadlad-ci-check-$$.log"
BRANCH="$(git branch --show-current)"
COMMIT="$(git rev-parse --short HEAD)"

# Guard: skip if we're already running an auto-fix (prevent infinite loop)
LOCKFILE="/tmp/cadlad-ci-check.lock"
if [ -f "$LOCKFILE" ]; then
  echo "CI check already running (lockfile exists), skipping." >> "$LOGFILE"
  exit 0
fi
trap 'rm -f "$LOCKFILE"' EXIT
echo $$ > "$LOCKFILE"

notify() {
  local title="$1" msg="$2"
  # macOS notification
  if command -v osascript &>/dev/null; then
    osascript -e "display notification \"$msg\" with title \"$title\"" 2>/dev/null || true
  fi
  # Terminal bell as fallback
  printf '\a'
  echo "[$title] $msg"
}

echo "=== CI check started at $(date) ===" > "$LOGFILE"
echo "Branch: $BRANCH  Commit: $COMMIT" >> "$LOGFILE"
echo "" >> "$LOGFILE"

FAILED=""
FAIL_OUTPUT=""

# --- Lint ---
echo ">> Running lint..." >> "$LOGFILE"
if ! LINT_OUT=$(npm run lint 2>&1); then
  FAILED="${FAILED}lint "
  FAIL_OUTPUT="${FAIL_OUTPUT}
=== LINT FAILURES ===
${LINT_OUT}
"
  echo "FAIL" >> "$LOGFILE"
else
  echo "PASS" >> "$LOGFILE"
fi

# --- Typecheck ---
echo ">> Running typecheck..." >> "$LOGFILE"
if ! TC_OUT=$(npm run typecheck 2>&1); then
  FAILED="${FAILED}typecheck "
  FAIL_OUTPUT="${FAIL_OUTPUT}
=== TYPECHECK FAILURES ===
${TC_OUT}
"
  echo "FAIL" >> "$LOGFILE"
else
  echo "PASS" >> "$LOGFILE"
fi

# --- Tests ---
echo ">> Running tests..." >> "$LOGFILE"
if ! TEST_OUT=$(npm run test 2>&1); then
  FAILED="${FAILED}test "
  FAIL_OUTPUT="${FAIL_OUTPUT}
=== TEST FAILURES ===
${TEST_OUT}
"
  echo "FAIL" >> "$LOGFILE"
else
  echo "PASS" >> "$LOGFILE"
fi

# --- All passed ---
if [ -z "$FAILED" ]; then
  notify "CadLad CI" "All checks passed on $BRANCH ($COMMIT)"
  echo "All checks passed." >> "$LOGFILE"
  exit 0
fi

# --- Something failed — auto-fix ---
notify "CadLad CI" "Failed: ${FAILED}-- auto-fixing"

echo "" >> "$LOGFILE"
echo "FAILED CHECKS: $FAILED" >> "$LOGFILE"
echo "$FAIL_OUTPUT" >> "$LOGFILE"

# Write failure context to a temp file for claude
CONTEXT_FILE="/tmp/cadlad-ci-failures-$$.txt"
cat > "$CONTEXT_FILE" << CTXEOF
The following CI checks failed on branch "$BRANCH" at commit $COMMIT.
Fix ALL of the failures below. Only change what is necessary to make the checks pass.
Do NOT add comments, docstrings, or make unrelated changes.
After fixing, stage the changed files and create a commit with message:
  "fix: resolve ${FAILED}failures from $COMMIT"

$FAIL_OUTPUT
CTXEOF

echo "" >> "$LOGFILE"
echo "Spawning claude auto-fix agent..." >> "$LOGFILE"

# Run claude in non-interactive mode to fix the issues
claude -p \
  --allowedTools "Read Edit Grep Glob Bash(npm:*) Bash(npx:*) Bash(git:*)" \
  < "$CONTEXT_FILE" \
  >> "$LOGFILE" 2>&1

FIX_EXIT=$?

if [ $FIX_EXIT -eq 0 ]; then
  # Verify the fix actually works
  RECHECK_FAILED=""
  [[ "$FAILED" == *lint* ]] && ! npm run lint &>/dev/null && RECHECK_FAILED="${RECHECK_FAILED}lint "
  [[ "$FAILED" == *typecheck* ]] && ! npm run typecheck &>/dev/null && RECHECK_FAILED="${RECHECK_FAILED}typecheck "
  [[ "$FAILED" == *test* ]] && ! npm run test &>/dev/null && RECHECK_FAILED="${RECHECK_FAILED}test "

  if [ -z "$RECHECK_FAILED" ]; then
    notify "CadLad CI" "Auto-fix landed! git pull to get fixes on $BRANCH"
  else
    notify "CadLad CI" "Auto-fix tried but still failing: ${RECHECK_FAILED}— see $LOGFILE"
  fi
else
  notify "CadLad CI" "Auto-fix agent failed (exit $FIX_EXIT). See $LOGFILE"
fi

echo "" >> "$LOGFILE"
echo "=== CI check finished at $(date) ===" >> "$LOGFILE"

# Cleanup context file
rm -f "$CONTEXT_FILE"
