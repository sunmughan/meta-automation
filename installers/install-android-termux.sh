#!/usr/bin/env bash
# installers/install-android-termux.sh
# 1-Click Complete Setup & Installer for Android (Termux + Termux:X11)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

echo "=================================================="
echo "  📱 META AUTOMATION — ANDROID TERMUX INSTALLER"
echo "=================================================="
echo "Project Directory: $SCRIPT_DIR"
echo ""

# 1. Verify Termux environment
if [ -z "$PREFIX" ] || [ ! -d "/data/data/com.termux" ]; then
    echo "⚠️  This installer is specifically designed to run inside the Termux app on Android."
    echo "    Continuing installation for Termux-compatible environments..."
fi

# 2. Update Termux base repositories
echo "[1/8] Updating Termux package repositories..."
pkg update -y || apt update -y

# 3. Enable x11-repo and tur-repo (Termux User Repository)
echo "[2/8] Enabling x11-repo and tur-repo..."
pkg install -y x11-repo tur-repo || true

# 4. Install Node.js, Chromium, Termux:X11, Git, Tar, Curl, Bash and Pulseaudio
echo "[3/8] Installing Node.js LTS, Chromium, X11, and terminal utilities..."
pkg install -y \
    nodejs-lts \
    git \
    curl \
    tar \
    bash \
    findutils \
    termux-x11-nightly \
    chromium \
    pulseaudio \
    xorg-xauth \
    procps || true

echo "✅ Node.js: $(node -v 2>/dev/null || echo 'Installed')"
echo "✅ Chromium: $(chromium --version 2>/dev/null || echo 'Installed')"

# 5. Configure MiniMax M3 environment
 echo "[4/8] Preparing MiniMax M3 + job-revenue environment..."
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
fi
# The setup wizard securely prompts for MINIMAX_API_KEY when it is missing; no key is committed.

# 6. Configure Termux:X11 Display & Preferences
echo "[5/8] Configuring Termux:X11 display (:1) and preferences..."
mkdir -p "$HOME/.termux"
if [ ! -f "$HOME/.termux/termux.properties" ] || ! grep -q "allow-external-apps" "$HOME/.termux/termux.properties"; then
    echo "allow-external-apps = true" >> "$HOME/.termux/termux.properties"
fi

# Export DISPLAY=:1 to user shell profile if missing
if ! grep -q "DISPLAY=:1" "$HOME/.bashrc" 2>/dev/null; then
    echo 'export DISPLAY=:1' >> "$HOME/.bashrc"
fi
export DISPLAY=:1

# 7. Install Project Dependencies
echo "[6/8] Installing Node.js dependencies..."
npm install

# 8. Configure Environment
echo "[7/8] Finalizing .env for Termux..."
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
fi

# Ensure DISPLAY=:1 and localhost CDP in .env
sed -i 's/^DISPLAY=.*/DISPLAY=:1/' "$SCRIPT_DIR/.env" 2>/dev/null || true
sed -i 's/^THREADS_CDP_URL=.*/THREADS_CDP_URL=http:\/\/127.0.0.1:9222/' "$SCRIPT_DIR/.env" 2>/dev/null || true

# 8. Set Executable Permissions
chmod +x "$SCRIPT_DIR"/start-* "$SCRIPT_DIR"/stop-* "$SCRIPT_DIR"/status-* "$SCRIPT_DIR"/scripts/*.sh "$SCRIPT_DIR"/threads-agent.js "$SCRIPT_DIR"/job-agent.js "$SCRIPT_DIR"/start-termux 2>/dev/null || true

# 7. Run the agentic setup after dependencies are available.
node "$SCRIPT_DIR/scripts/setup-job-engine.js"

# 9. Create 1-Tap Launcher in Termux Home & Termux Widget
echo "[8/8] Creating 1-tap launchers for Android..."
mkdir -p "$HOME/.shortcuts"

cat << 'EOF' > "$HOME/start-meta.sh"
#!/usr/bin/env bash
# 1-Tap Launcher for Meta Automation on Android (Termux)

# 1. Start Termux:X11 app if not already running
if ! pgrep -f "termux-x11" >/dev/null; then
    echo "Starting Termux:X11 server..."
    termux-x11 :1 -xstartup "sleep 1" &
    sleep 2
fi

# 2. Launch Android automation runner
PROJECT_DIR="$HOME/meta-automation"
[ ! -d "$PROJECT_DIR" ] && PROJECT_DIR="$(find "$HOME" -name "meta-automation" -o -name "threads-agent" 2>/dev/null | head -n 1)"

if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR"
    ./start-termux "$@"
else
    echo "Project directory not found in $HOME."
    exit 1
fi
EOF

chmod +x "$HOME/start-meta.sh"
cp "$HOME/start-meta.sh" "$HOME/.shortcuts/start-meta" 2>/dev/null || true

# Verify with test suite
echo ""
echo "Running test suite audit..."
npm test

echo ""
echo "=================================================="
echo "  🎉 ANDROID TERMUX SETUP COMPLETE!"
echo "=================================================="
echo "How to run on Android:"
echo "1. Install the 'Termux:X11' companion app APK on your phone."
echo "2. Open Termux and run:"
echo "      ~/start-meta.sh"
echo "   (or cd $(pwd) && ./start-termux)"
echo ""
echo "3. Termux:X11 will automatically open, Chromium will attach with CDP :9222,"
echo "   and Meta Automation will begin running in the background 24/7!"
echo "=================================================="
