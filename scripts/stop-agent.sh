#!/usr/bin/env bash
# stop-agent.sh
# Gracefully terminates the running CodeAir Threads + Instagram background daemon

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$AGENT_DIR/threads-agent.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
        echo "Stopping Threads Agent (PID: $PID)..."
        kill -TERM "$PID"
        sleep 2
        if kill -0 "$PID" 2>/dev/null; then
            kill -9 "$PID" 2>/dev/null
        fi
        rm -f "$PID_FILE"
        echo "✅ Threads Agent stopped successfully."
        exit 0
    fi
    rm -f "$PID_FILE"
fi

# Fallback check via pgrep
PIDS=$(pgrep -f "node threads-agent\.js" | grep -v "$$")
if [ -n "$PIDS" ]; then
    echo "Found running instances: $PIDS. Stopping..."
    pkill -f "node threads-agent\.js"
    echo "✅ Stopped."
else
    echo "Threads Agent is not running."
fi
