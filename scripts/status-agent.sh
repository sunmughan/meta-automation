#!/usr/bin/env bash
# status-agent.sh
# Checks daemon running status and displays system status report

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$AGENT_DIR/threads-agent.pid"

echo "=================================================="
echo "  CodeAir Agent Daemon Status"
echo "=================================================="

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "🟢 Daemon Status : RUNNING (PID: $PID)"
    else
        echo "🔴 Daemon Status : STOPPED (Stale PID file cleaned)"
        rm -f "$PID_FILE"
    fi
else
    PIDS=$(pgrep -f "node threads-agent\.js" | grep -v "$$")
    if [ -n "$PIDS" ]; then
        echo "🟢 Daemon Status : RUNNING (PIDs: $PIDS)"
    else
        echo "⚪ Daemon Status : NOT RUNNING"
    fi
fi

cd "$AGENT_DIR" || exit 1
node threads-agent.js status
