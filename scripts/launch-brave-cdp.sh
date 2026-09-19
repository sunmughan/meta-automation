#!/usr/bin/env bash
# scripts/launch-brave-cdp.sh
# Cross-platform helper script to ensure Brave/Chrome/Chromium is active on CDP port 9222.
# Works across Linux, macOS, and Android Termux.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# If node is available, use the universal cross-platform launcher
if command -v node >/dev/null 2>&1; then
    node "$SCRIPT_DIR/launch-browser-cdp.js" "$@"
    exit $?
fi

# Fallback native shell discovery if node is not immediately present in PATH
CDP_PORT=9222
HOME_DIR="${HOME:-/home/$USER}"

if [ -n "$PREFIX" ] && [ -d "$PREFIX" ]; then
    # Android Termux
    BRAVE_BIN="$PREFIX/bin/chromium"
    USER_DATA_DIR="$HOME_DIR/.config/chromium"
elif [ "$(uname -s)" = "Darwin" ]; then
    # macOS
    BRAVE_BIN="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
    USER_DATA_DIR="$HOME_DIR/Library/Application Support/BraveSoftware/Brave-Browser"
else
    # Linux
    BRAVE_BIN="/opt/brave.com/brave/brave"
    [ ! -x "$BRAVE_BIN" ] && BRAVE_BIN=$(which brave-browser-stable || which brave || which google-chrome || which chromium)
    USER_DATA_DIR="$HOME_DIR/.config/BraveSoftware/Brave-Browser"
fi

echo "Checking CDP port $CDP_PORT for $BRAVE_BIN..."
mkdir -p "$SCRIPT_DIR/../logs"
mkdir -p "$USER_DATA_DIR"

nohup "$BRAVE_BIN" \
    --remote-debugging-port=$CDP_PORT \
    --user-data-dir="$USER_DATA_DIR" \
    --no-first-run \
    --no-default-browser-check \
    --restore-last-session \
    >> "$SCRIPT_DIR/../logs/brave.log" 2>&1 &

sleep 3
echo "✅ Browser launched on port $CDP_PORT."
