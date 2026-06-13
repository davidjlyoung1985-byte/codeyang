#!/bin/bash
# CodeYang VS Code Extension - Quick Deploy Script

set -e

echo "════════════════════════════════════════════════════════════"
echo "  CodeYang VS Code Extension - DeepSeek Anthropic API"
echo "════════════════════════════════════════════════════════════"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Build main project
echo -e "${YELLOW}[1/4]${NC} Building CodeYang..."
npm run build
echo -e "${GREEN}✓${NC} Build completed"
echo ""

# Step 2: Copy tools to extension
echo -e "${YELLOW}[2/4]${NC} Copying tools to extension..."
cp -f dist/cjs/tools.cjs vscode-extension/tools.cjs
echo -e "${GREEN}✓${NC} Tools copied"
echo ""

# Step 3: Install extension dependencies
echo -e "${YELLOW}[3/4]${NC} Installing extension dependencies..."
cd vscode-extension
if [ ! -d "node_modules" ]; then
    npm install
else
    echo "Dependencies already installed"
fi
cd ..
echo -e "${GREEN}✓${NC} Dependencies ready"
echo ""

# Step 4: Install to VS Code
echo -e "${YELLOW}[4/4]${NC} Installing extension to VS Code..."

# Get extension directory
EXT_DIR=""
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    EXT_DIR="$USERPROFILE/.vscode/extensions/codeyang-vscode-0.3.1"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    EXT_DIR="$HOME/.vscode/extensions/codeyang-vscode-0.3.1"
else
    EXT_DIR="$HOME/.vscode/extensions/codeyang-vscode-0.3.1"
fi

# Remove old version
if [ -d "$EXT_DIR" ]; then
    echo "Removing old version..."
    rm -rf "$EXT_DIR"
fi

# Copy extension
echo "Copying extension to $EXT_DIR..."
mkdir -p "$EXT_DIR"
cp -r vscode-extension/* "$EXT_DIR/"

echo -e "${GREEN}✓${NC} Extension installed"
echo ""

echo "════════════════════════════════════════════════════════════"
echo -e "  ${GREEN}✓ Installation Complete!${NC}"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Reload VS Code window (Ctrl+Shift+P → Developer: Reload Window)"
echo "  2. Press Ctrl+Shift+Y to open CodeYang"
echo "  3. Enter your DeepSeek API key from https://platform.deepseek.com"
echo ""
echo "Configuration:"
echo "  • API Base URL: https://api.deepseek.com/anthropic"
echo "  • Model: deepseek-v4-pro"
echo ""
echo "For more info, see: vscode-extension/README.md"
echo ""
