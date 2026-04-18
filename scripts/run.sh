#!/usr/bin/env bash
# Long-running pipeline runner for the Mac Mini.
# Starts a detached tmux session, keeps the Mac awake with caffeinate, and
# runs the full pipeline. Reattach any time: `tmux attach -t jvappeals`.
set -euo pipefail

SESSION="jvappeals"
LOGFILE="pipeline.log"

if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "tmux session '$SESSION' already exists — attaching."
    exec tmux attach -t "$SESSION"
fi

# caffeinate -i prevents idle sleep; -s prevents system sleep on AC power.
tmux new-session -d -s "$SESSION" \
    "caffeinate -is uv run python -m pipeline all 2>&1 | tee -a $LOGFILE"

echo "pipeline started in tmux session '$SESSION'."
echo "  attach:  tmux attach -t $SESSION"
echo "  tail:    tail -f $LOGFILE"
echo "  stop:    tmux kill-session -t $SESSION"
