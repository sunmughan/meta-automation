#!/usr/bin/env bash
# launch-brave-cdp.sh
# Safely launches Brave Browser with Remote Debugging (CDP) on port 9222
# Preserves 100% of existing user data, logged-in Threads/Instagram cookies, and open tabs.

CDP_PORT=9222
USER_DATA_DIR="/home/sunmughan/.config/BraveSoftware/Brave-Browser"
BRAVE_BIN="/opt/brave.com/brave/brave"

if [ ! -x "$BRAVE_BIN" ]; then
    BRAVE_BIN=$(which brave-browser-stable || which brave)
fi

# 1. Check if port 9222 is already listening
if ss -tulpn | grep -q ":$CDP_PORT "; then
    echo "✅ Brave CDP is ALREADY active and listening on port $CDP_PORT!"
    exit 0
fi

# 2. Check if a Brave process is running without CDP
# Use pgrep specifically matching the binary path, excluding current shell PID ($$)
BRAVE_PIDS=$(pgrep -f "^$BRAVE_BIN" | grep -v "$$" || true)

if [ -n "$BRAVE_PIDS" ]; then
    echo "⚠️  Brave is currently running without CDP port $CDP_PORT."
    echo "🔄 Gracefully closing existing Brave to enable CDP without losing tabs..."
    for pid in $BRAVE_PIDS; do
        kill -TERM "$pid" 2>/dev/null || true
    done
    sleep 3
    # Wait until all brave processes terminate cleanly
    while pgrep -f "^$BRAVE_BIN" > /dev/null; do
        sleep 1
    done
fi

# 3. Clean stale SingletonLock if previous process died unexpectedly
LOCK_FILE="$USER_DATA_DIR/SingletonLock"
if [ -L "$LOCK_FILE" ]; then
    LOCK_TARGET=$(readlink "$LOCK_FILE" 2>/dev/null)
    LOCK_PID=$(echo "$LOCK_TARGET" | awk -F'-' '{print $NF}')
    if [ -n "$LOCK_PID" ] && ! kill -0 "$LOCK_PID" 2>/dev/null; then
        rm -f "$USER_DATA_DIR"/Singleton*
    fi
fi

# 4. Launch Brave detached from terminal using setsid & nohup
mkdir -p "$(dirname "$0")/../logs"
DISPLAY="${DISPLAY:-:1}" setsid nohup "$BRAVE_BIN" \
    --remote-debugging-port=$CDP_PORT \
    --user-data-dir="$USER_DATA_DIR" \
    --no-first-run \
    --no-default-browser-check \
    --restore-last-session \
    >> "$(dirname "$0")/../logs/brave.log" 2>&1 &

sleep 3

# 5. Verify CDP port
if ss -tulpn | grep -q ":$CDP_PORT "; then
    echo "✅ Brave launched successfully with CDP on http://127.0.0.1:$CDP_PORT!"
    exit 0
else
    sleep 2
    if ss -tulpn | grep -q ":$CDP_PORT "; then
        echo "✅ Brave launched successfully with CDP on http://127.0.0.1:$CDP_PORT!"
        exit 0
    else
        echo "❌ Could not verify port $CDP_PORT. Check logs/brave.log."
        exit 1
    fi
fi
