#!/usr/bin/env bash
# scripts/package-release.sh
# Automated release builder for Meta Automation distribution packages.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
RELEASE_DIR="$ROOT_DIR/release"

echo "==> Building Meta Automation release packages in $RELEASE_DIR..."
mkdir -p "$RELEASE_DIR"

cd "$ROOT_DIR"

VERSION="$(node -p 'require("./package.json").version')"
echo "==> Packaging version v${VERSION}..."

# 1. Clean temporary, old release and runtime files
rm -f threads-agent.pid ./*.log
rm -f "$RELEASE_DIR"/meta-automation-*.tgz "$RELEASE_DIR"/meta-automation-*.tar.gz "$RELEASE_DIR"/meta-automation-*.zip

# 2. Build npm package
echo "==> Generating npm tarball..."
npm pack
mv meta-automation-*.tgz "$RELEASE_DIR/meta-automation-${VERSION}.tgz"

# 3. Build tar.gz bundles
echo "==> Packaging tar.gz distributions..."
TEMP_TAR="/tmp/meta-automation-bundle.tar.gz"
tar --exclude='./.git' \
    --exclude='./node_modules' \
    --exclude='./logs' \
    --exclude='./release' \
    --exclude='./backups' \
    --exclude='./.env' \
    --exclude='./threads-agent.pid' \
    --exclude='./threads-engagement-state.json.bak*' \
    -czf "$TEMP_TAR" .

cp "$TEMP_TAR" "$RELEASE_DIR/meta-automation-linux-x64.tar.gz"
cp "$TEMP_TAR" "$RELEASE_DIR/meta-automation-macos-universal.tar.gz"
cp "$TEMP_TAR" "$RELEASE_DIR/meta-automation-android-termux.tar.gz"
rm -f "$TEMP_TAR"

# 4. Build zip bundles
echo "==> Packaging zip distributions..."
TEMP_ZIP="/tmp/meta-automation-bundle.zip"
rm -f "$TEMP_ZIP"
zip -r "$TEMP_ZIP" . \
    -x ".git/*" \
    -x "node_modules/*" \
    -x "logs/*" \
    -x "release/*" \
    -x "backups/*" \
    -x ".env" \
    -x "threads-agent.pid" \
    -x "*.bak*" > /dev/null

cp "$TEMP_ZIP" "$RELEASE_DIR/meta-automation-windows-x64.zip"
cp "$TEMP_ZIP" "$RELEASE_DIR/meta-automation-universal-v${VERSION}.zip"
rm -f "$TEMP_ZIP"

# 5. Generate fresh SHA256 checksums
echo "==> Generating SHA256SUMS.txt..."
cd "$RELEASE_DIR"
sha256sum meta-automation-*.tgz meta-automation-*.tar.gz meta-automation-*.zip > SHA256SUMS.txt

echo "==> Release packaging complete:"
cat SHA256SUMS.txt
