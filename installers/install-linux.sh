#!/usr/bin/env bash
# installers/install-linux.sh
# 1-Click Setup & Installer for Linux (Debian, Ubuntu, Zorin OS, Fedora, Arch)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

echo "=================================================="
echo "  🚀 META AUTOMATION — LINUX 1-CLICK INSTALLER"
echo "=================================================="
echo "Project Directory: $SCRIPT_DIR"
echo ""

# 1. Check Node.js
echo "[1/6] Checking Node.js runtime..."
if ! command -v node >/dev/null 2>&1; then
    echo "⚠️  Node.js is not installed."
    echo "📦 Installing Node.js (LTS)..."
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y nodejs npm
    elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -Sy --noconfirm nodejs npm
    else
        echo "❌ Unsupported package manager. Please install Node.js >= 18 manually from https://nodejs.org"
        exit 1
    fi
fi

NODE_VERSION=$(node -v | cut -d 'v' -f 2)
echo "✅ Node.js detected: v$NODE_VERSION"

# 2. Check Browser (Brave or Chrome)
echo "[2/6] Checking Browser availability (Brave / Chrome)..."
if command -v brave-browser >/dev/null 2>&1 || command -v brave >/dev/null 2>&1 || [ -x "/opt/brave.com/brave/brave" ]; then
    echo "✅ Brave Browser detected."
elif command -v google-chrome >/dev/null 2>&1 || command -v chromium >/dev/null 2>&1; then
    echo "✅ Chromium/Chrome detected."
else
    echo "⚠️  Neither Brave nor Chrome found."
    echo "💡 Recommended: Install Brave Browser (https://brave.com/linux)"
    echo "   Ubuntu/Debian: sudo curl -fsSLo /usr/share/keyrings/brave-browser-archive-keyring.gpg https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg"
    echo "   echo \"deb [signed-by=/usr/share/keyrings/brave-browser-archive-keyring.gpg] https://brave-browser-apt-release.s3.brave.com/ stable main\" | sudo tee /etc/apt/sources.list.d/brave-browser-release.list"
    echo "   sudo apt update && sudo apt install -y brave-browser"
fi

# 3. Install Dependencies
echo "[3/6] Installing Node.js dependencies..."
npm install

# Job Revenue Engine setup: creates private profile directories and securely prompts for MiniMax API key.
node scripts/setup-job-engine.js

# 4. Configure Environment
echo "[4/6] Setting up environment configuration..."
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    echo "✅ Created .env from .env.example"
else
    echo "ℹ️  Existing .env preserved."
fi

# 5. Make scripts executable
echo "[5/6] Making execution scripts executable..."
chmod +x "$SCRIPT_DIR"/start-* "$SCRIPT_DIR"/stop-* "$SCRIPT_DIR"/status-* "$SCRIPT_DIR"/scripts/*.sh "$SCRIPT_DIR"/threads-agent.js "$SCRIPT_DIR"/job-agent.js

# 6. Run Test Suite
echo "[6/6] Verifying engine with test suite..."
npm test

echo ""
echo "=================================================="
echo "  🎉 LINUX INSTALLATION COMPLETE!"
echo "=================================================="
echo "To start the background automation daemon:"
echo "   ./start-automation"
echo ""
echo "To check system health and live stats:"
echo "   ./status-automation"
echo ""
echo "To stop the automation daemon:"
echo "   ./stop-automation"
echo "=================================================="
