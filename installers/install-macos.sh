#!/usr/bin/env bash
# installers/install-macos.sh
# 1-Click Setup & Installer for macOS (Intel & Apple Silicon M1/M2/M3/M4)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

echo "=================================================="
echo "  🚀 META AUTOMATION — MACOS 1-CLICK INSTALLER"
echo "=================================================="
echo "Project Directory: $SCRIPT_DIR"
echo "Architecture: $(uname -m)"
echo ""

# 1. Check Node.js
echo "[1/6] Checking Node.js runtime..."
if ! command -v node >/dev/null 2>&1; then
    echo "⚠️  Node.js is not installed."
    if command -v brew >/dev/null 2>&1; then
        echo "📦 Installing Node.js via Homebrew..."
        brew install node@20
        brew link node@20 --force --overwrite
    else
        echo "❌ Homebrew is not installed. Please install Node.js >= 18 from https://nodejs.org or install Homebrew first:"
        echo '   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        exit 1
    fi
fi

NODE_VERSION=$(node -v | cut -d 'v' -f 2)
echo "✅ Node.js detected: v$NODE_VERSION"

# 2. Check Browser (Brave or Chrome)
echo "[2/6] Checking Browser availability..."
if [ -d "/Applications/Brave Browser.app" ] || [ -d "$HOME/Applications/Brave Browser.app" ]; then
    echo "✅ Brave Browser detected in Applications."
elif [ -d "/Applications/Google Chrome.app" ] || [ -d "$HOME/Applications/Google Chrome.app" ]; then
    echo "✅ Google Chrome detected in Applications."
else
    echo "⚠️  Neither Brave Browser nor Google Chrome detected in /Applications."
    echo "💡 Install Brave with Homebrew: brew install --cask brave-browser"
fi

# 3. Install Dependencies
echo "[3/6] Installing Node.js dependencies..."
npm install

# 4. Configure Environment
echo "[4/6] Setting up environment configuration..."
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    echo "✅ Created .env from .env.example"
else
    echo "ℹ️  Existing .env preserved."
fi

# 5. Make execution scripts executable
echo "[5/6] Setting executable permissions..."
chmod +x "$SCRIPT_DIR"/start-* "$SCRIPT_DIR"/stop-* "$SCRIPT_DIR"/status-* "$SCRIPT_DIR"/scripts/*.sh "$SCRIPT_DIR"/threads-agent.js

# 6. Run Test Suite
echo "[6/6] Verifying engine with test suite..."
npm test

echo ""
echo "=================================================="
echo "  🎉 MACOS INSTALLATION COMPLETE!"
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
