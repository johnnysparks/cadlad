#!/usr/bin/env bash
# snapshot-review.sh — Review snapshot diffs using Claude's vision.
#
# For each diff, shows Claude both the reference and current image
# and asks it to judge: accept (intentional improvement) or reject
# (regression that breaks the conceptual intent of the example).
#
# If accepted, updates the reference image.
# If rejected, reports the regression.
#
# Usage: called by ci-check-bg.sh when snapshot diffs are detected.
#   Can also be run manually: ./scripts/snapshot-review.sh

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

REPORT="$REPO_ROOT/snapshots/report.json"
REF_DIR="$REPO_ROOT/snapshots/reference"
CUR_DIR="$REPO_ROOT/snapshots/current"
EXAMPLES_DIR="$REPO_ROOT/examples"

if [ ! -f "$REPORT" ]; then
  echo "No snapshot report found at $REPORT"
  exit 0
fi

# Extract diffs from report
DIFFS=$(node -e "
const r = JSON.parse(require('fs').readFileSync('$REPORT', 'utf-8'));
const diffs = r.filter(d => d.status === 'diff');
if (diffs.length === 0) { process.exit(0); }
for (const d of diffs) { console.log(d.name); }
" 2>/dev/null)

if [ -z "$DIFFS" ]; then
  echo "No snapshot diffs to review."
  exit 0
fi

ACCEPTED=""
REJECTED=""

for NAME in $DIFFS; do
  REF_IMG="$REF_DIR/${NAME}.png"
  CUR_IMG="$CUR_DIR/${NAME}.png"
  EXAMPLE_FILE="$EXAMPLES_DIR/${NAME}/${NAME}.forge.js"

  if [ ! -f "$REF_IMG" ] || [ ! -f "$CUR_IMG" ]; then
    echo "Skipping $NAME — missing image files"
    continue
  fi

  EXAMPLE_CODE=""
  if [ -f "$EXAMPLE_FILE" ]; then
    EXAMPLE_CODE=$(cat "$EXAMPLE_FILE")
  fi

  echo "Reviewing: $NAME"

  # Ask Claude to compare the two images
  VERDICT=$(claude -p \
    --allowedTools "Read" \
    "You are reviewing a visual snapshot test for a CAD model example called '${NAME}'.

The example code is:
\`\`\`javascript
${EXAMPLE_CODE}
\`\`\`

Please look at these two images:

1. REFERENCE (the previously approved rendering): ${REF_IMG}
2. CURRENT (the new rendering from this commit): ${CUR_IMG}

Read both image files and compare them visually.

Consider the CONCEPTUAL INTENT of the example — does the current image still represent the same kind of object described in the code and the example name? Minor rendering differences (lighting, anti-aliasing, camera angle shifts) are acceptable. What is NOT acceptable:
- Missing geometry (holes, arms, features disappeared)
- Wrong shape (cube instead of cylinder, missing boolean operations)
- Broken rendering (black screen, error messages, scrambled geometry)
- Fundamentally different object than what the code describes

Respond with EXACTLY one of these two lines (nothing else):
ACCEPT: <one sentence reason>
REJECT: <one sentence reason>" 2>/dev/null)

  echo "  Verdict: $VERDICT"

  if echo "$VERDICT" | grep -q "^ACCEPT"; then
    ACCEPTED="${ACCEPTED}${NAME} "
    # Update reference to the new version
    cp "$CUR_IMG" "$REF_IMG"
    echo "  Reference updated."
  else
    REJECTED="${REJECTED}${NAME} "
    echo "  REGRESSION detected."
  fi
done

# Summary
echo ""
echo "=== Snapshot Review Summary ==="
if [ -n "$ACCEPTED" ]; then
  echo "Accepted (references updated): $ACCEPTED"
fi
if [ -n "$REJECTED" ]; then
  echo "REJECTED (regressions): $REJECTED"
fi

# If we accepted changes, commit the updated references
if [ -n "$ACCEPTED" ] && [ -z "$REJECTED" ]; then
  git add snapshots/reference/
  git commit -m "$(cat <<EOF
chore: update snapshot references (auto-reviewed)

Accepted changes: ${ACCEPTED}

Visual review confirmed these rendering changes match
the conceptual intent of each example model.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)" 2>/dev/null || true
  echo "Committed updated references."
fi

# Exit 1 if any rejected
if [ -n "$REJECTED" ]; then
  exit 1
fi
