#!/usr/bin/env bash
# start-agent.sh
# Starts CodeAir Threads + Instagram Agent as a persistent background daemon

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$AGENT_DIR/threads-agent.pid"
LOG_FILE="$AGENT_DIR/logs/daemon.log"

mkdir -p "$AGENT_DIR/logs"

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "=================================================="
        echo "  Threads Agent is ALREADY running (PID: $PID)"
        echo "=================================================="
        echo "Live activity : tail -f $LOG_FILE"
        echo "Stop command  : ./scripts/stop-agent.sh"
        echo "Status command: ./scripts/status-agent.sh"
        exit 0
    fi
    rm -f "$PID_FILE"
fi

cd "$AGENT_DIR" || exit 1
nohup node threads-agent.js run >> "$LOG_FILE" 2>&1 &
AGENT_PID=$!
echo "$AGENT_PID" > "$PID_FILE"

sleep 1

if kill -0 "$AGENT_PID" 2>/dev/null; then
    echo "=================================================="
    echo "  🚀 CODEAIR THREADS + INSTAGRAM AGENT STARTED"
    echo "=================================================="
    echo "  Status        : RUNNING IN BACKGROUND"
    echo "  PID           : $AGENT_PID"
    echo "  Mode          : Safe Dry Run (APPROVAL_MODE=true)"
    echo "  Live Logs     : tail -f $LOG_FILE"
    echo "  Stop Script   : ./scripts/stop-agent.sh"
    echo "  Status Script : ./scripts/status-agent.sh"
    echo "=================================================="
else
    echo "❌ Failed to start agent. Check $LOG_FILE for details."
    rm -f "$PID_FILE"
    exit 1
fi
