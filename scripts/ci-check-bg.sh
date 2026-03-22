#!/usr/bin/env bash
# ci-check-bg.sh — Background CI check runner
#
# Runs lint, typecheck, tests, and snapshot tests after a commit.
# If anything fails, spawns a claude agent to auto-fix code issues.
# Snapshot diffs get visual review via claude vision before accepting/rejecting.
#
# Usage: called by .git/hooks/post-commit (backgrounded)
#   You can also run it manually: ./scripts/ci-check-bg.sh

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Ensure node_modules/.bin is on PATH
export PATH="$REPO_ROOT/node_modules/.bin:$PATH"

LOGFILE="/tmp/cadlad-ci-check-$$.log"
BRANCH="$(git branch --show-current)"
COMMIT="$(git rev-parse --short HEAD)"

# Guard: skip if already running (prevent infinite loop from auto-fix commits)
LOCKFILE="/tmp/cadlad-ci-check.lock"
if [ -f "$LOCKFILE" ]; then
  echo "CI check already running (lockfile exists), skipping." >> "$LOGFILE"
  exit 0
fi
trap 'rm -f "$LOCKFILE" ; kill $DEV_PID 2>/dev/null' EXIT
echo $$ > "$LOCKFILE"

notify() {
  local title="$1" msg="$2"
  if command -v osascript &>/dev/null; then
    osascript -e "display notification \"$msg\" with title \"$title\"" 2>/dev/null || true
  fi
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

# --- Snapshot Tests ---
echo ">> Running snapshot tests..." >> "$LOGFILE"
DEV_PID=""
if [ -f "$REPO_ROOT/scripts/snapshot-test.mjs" ]; then
  # Start dev server if not already running
  if ! curl -s -o /dev/null http://localhost:5173 2>/dev/null; then
    npx vite --port 5173 &>/dev/null &
    DEV_PID=$!
    sleep 3
  fi

  if SNAP_OUT=$(node "$REPO_ROOT/scripts/snapshot-test.mjs" 2>&1); then
    echo "PASS" >> "$LOGFILE"
  else
    echo "DIFF or ERROR" >> "$LOGFILE"
    echo "$SNAP_OUT" >> "$LOGFILE"

    # Check if there are diffs (not errors) — those get visual review
    if echo "$SNAP_OUT" | grep -q "DIFF DETECTED"; then
      echo ">> Running visual snapshot review..." >> "$LOGFILE"
      if REVIEW_OUT=$("$REPO_ROOT/scripts/snapshot-review.sh" 2>&1); then
        echo "Snapshot review: all accepted" >> "$LOGFILE"
        echo "$REVIEW_OUT" >> "$LOGFILE"
      else
        FAILED="${FAILED}snapshots "
        FAIL_OUTPUT="${FAIL_OUTPUT}
=== SNAPSHOT REGRESSIONS ===
${REVIEW_OUT}
"
        echo "Snapshot review: regressions found" >> "$LOGFILE"
      fi
    else
      FAILED="${FAILED}snapshots "
      FAIL_OUTPUT="${FAIL_OUTPUT}
=== SNAPSHOT FAILURES ===
${SNAP_OUT}
"
    fi
  fi
else
  echo "SKIP (no snapshot-test.mjs)" >> "$LOGFILE"
fi

# Kill dev server if we started it
if [ -n "$DEV_PID" ]; then
  kill $DEV_PID 2>/dev/null || true
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

# Only auto-fix code issues (lint/typecheck/test), not snapshot regressions
CODE_FAILURES=$(echo "$FAILED" | sed 's/snapshots //')
if [ -n "$CODE_FAILURES" ] && [ "$CODE_FAILURES" != " " ]; then
  CONTEXT_FILE="/tmp/cadlad-ci-failures-$$.txt"
  cat > "$CONTEXT_FILE" << CTXEOF
The following CI checks failed on branch "$BRANCH" at commit $COMMIT.
Fix ALL of the failures below. Only change what is necessary to make the checks pass.
Do NOT add comments, docstrings, or make unrelated changes.
After fixing, stage the changed files and create a commit with message:
  "fix: resolve ${CODE_FAILURES}failures from $COMMIT"

$FAIL_OUTPUT
CTXEOF

  echo "Spawning claude auto-fix agent..." >> "$LOGFILE"

  claude -p \
    --allowedTools "Read Edit Grep Glob Bash(npm:*) Bash(npx:*) Bash(git:*)" \
    < "$CONTEXT_FILE" \
    >> "$LOGFILE" 2>&1

  FIX_EXIT=$?

  if [ $FIX_EXIT -eq 0 ]; then
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

  rm -f "$CONTEXT_FILE"
fi

echo "" >> "$LOGFILE"
echo "=== CI check finished at $(date) ===" >> "$LOGFILE"
