#!/usr/bin/env bash
# ci-eval.sh — Run eval benchmarks and check for regressions
#
# Usage:
#   ./scripts/ci-eval.sh                    # local: uses ollama://llama3.2
#   ./scripts/ci-eval.sh --ci               # CI mode: uses anthropic://claude-haiku-4-5-20251001
#   ./scripts/ci-eval.sh --model <url>      # explicit model
#   ./scripts/ci-eval.sh --update-baseline  # capture current results as new baseline

set -u

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

export PATH="$REPO_ROOT/node_modules/.bin:$PATH"

LOGFILE="/tmp/cadlad-ci-eval-$$.log"
LOCKFILE="/tmp/cadlad-ci-eval.lock"
BASELINE_FILE="eval-logs/baseline.json"
MODEL="ollama://llama3.2"
CONCURRENCY=1
UPDATE_BASELINE=0

notify() {
  local title="$1" msg="$2"
  if command -v osascript &>/dev/null; then
    osascript -e "display notification \"$msg\" with title \"$title\"" 2>/dev/null || true
  fi
  printf '\a'
  echo "[$title] $msg"
}

if [ -f "$LOCKFILE" ]; then
  echo "Eval check already running (lockfile exists), skipping." | tee -a "$LOGFILE"
  exit 1
fi
trap 'rm -f "$LOCKFILE"' EXIT
printf '%s\n' "$$" > "$LOCKFILE"

while [ $# -gt 0 ]; do
  case "$1" in
    --ci)
      MODEL="anthropic://claude-haiku-4-5-20251001"
      CONCURRENCY=3
      ;;
    --model)
      MODEL="${2:-}"
      shift
      ;;
    --update-baseline)
      UPDATE_BASELINE=1
      ;;
    *)
      echo "Unknown argument: $1" | tee -a "$LOGFILE"
      exit 1
      ;;
  esac
  shift
done

echo "=== Eval check started at $(date) ===" | tee "$LOGFILE"
echo "model=$MODEL concurrency=$CONCURRENCY update_baseline=$UPDATE_BASELINE" | tee -a "$LOGFILE"

if [[ "$MODEL" == ollama://* ]]; then
  if ! curl -s localhost:11434/api/tags >/dev/null; then
    echo "ollama not running" | tee -a "$LOGFILE"
    exit 1
  fi
elif [[ "$MODEL" == anthropic://* ]]; then
  if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    echo "ANTHROPIC_API_KEY is not set" | tee -a "$LOGFILE"
    exit 1
  fi
elif [[ "$MODEL" == openai://* ]]; then
  if [ -z "${OPENAI_API_KEY:-}" ]; then
    echo "OPENAI_API_KEY is not set" | tee -a "$LOGFILE"
    exit 1
  fi
fi

node --import tsx src/cli/index.ts eval tasks/benchmark/ \
  --model "$MODEL" \
  --concurrency "$CONCURRENCY" \
  --no-judge \
  2>&1 | tee -a "$LOGFILE"
EVAL_EXIT=${PIPESTATUS[0]}

if [ "$EVAL_EXIT" -ne 0 ]; then
  notify "CadLad Eval" "Eval run failed (exit $EVAL_EXIT). See $LOGFILE"
  exit 1
fi

mkdir -p eval-logs
CURRENT_SUMMARY=$(node --import tsx -e "import {aggregateLogs} from './src/eval/report.js'; console.log(JSON.stringify(aggregateLogs('eval-logs')))")

if [ "$UPDATE_BASELINE" -eq 1 ]; then
  printf '%s\n' "$CURRENT_SUMMARY" > "$BASELINE_FILE"
  TASK_COUNT=$(node --import tsx -e "const report=JSON.parse(process.argv[1]); console.log(report.tasks.length);" "$CURRENT_SUMMARY")
  echo "Baseline updated with $TASK_COUNT tasks" | tee -a "$LOGFILE"
  notify "CadLad Eval" "Baseline updated with $TASK_COUNT tasks"
  exit 0
fi

if [ ! -f "$BASELINE_FILE" ]; then
  echo "No baseline found at $BASELINE_FILE; skipping regression check." | tee -a "$LOGFILE"
  exit 0
fi

if ! node --import tsx -e "
import { readFileSync } from 'node:fs';
const baseline = JSON.parse(readFileSync(process.argv[1], 'utf-8'));
const current = JSON.parse(process.argv[2]);
const currentMap = new Map((current.tasks || []).map((t) => [t.task_id, t.pass_rate]));
const regressions = [];
for (const task of (baseline.tasks || [])) {
  const now = currentMap.get(task.task_id);
  if (typeof now !== 'number') continue;
  if (now < task.pass_rate - 0.1) regressions.push({ task_id: task.task_id, baseline: task.pass_rate, current: now });
}
if (regressions.length > 0) {
  console.error('Regressions detected:');
  for (const r of regressions) console.error(`- ${r.task_id}: baseline=${(r.baseline*100).toFixed(1)}% current=${(r.current*100).toFixed(1)}%`);
  process.exit(1);
}
" "$BASELINE_FILE" "$CURRENT_SUMMARY"; then
  notify "CadLad Eval" "Regression detected. See $LOGFILE"
  exit 1
fi

echo "No regressions detected" | tee -a "$LOGFILE"
notify "CadLad Eval" "No regressions detected"
