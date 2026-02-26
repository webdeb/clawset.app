#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="22.22.0"
NVM_VERSION="v0.39.7"
OPENCLAW_PKG="openclaw@latest"

ARCH="$(uname -m)"

if ! command -v apt-get >/dev/null 2>&1; then
  echo "ERROR: This script is Ubuntu/Debian-only (apt-get not found)."
  exit 1
fi

echo "Ubuntu build prerequisites (node-gyp) + nvm + node ${NODE_VERSION} + openclaw"
echo "Detected ARCH=${ARCH}"

# -------------------------
# Build prerequisites (node-gyp + common native modules)
# -------------------------
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -yq
sudo apt-get install -yq \
  ca-certificates \
  curl \
  git \
  python3 \
  make \
  g++ \
  build-essential \
  pkg-config

# -------------------------
# Install nvm
# -------------------------
if ! command -v nvm >/dev/null 2>&1; then
  echo "Installing nvm (${NVM_VERSION})..."
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
fi

# Load nvm into this shell session
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"

if ! command -v nvm >/dev/null 2>&1; then
  echo "ERROR: nvm not found after install. Open a new shell and re-run this script."
  exit 1
fi

# -------------------------
# Install Node
# -------------------------
nvm install "${NODE_VERSION}"
nvm use "${NODE_VERSION}"
nvm alias default "${NODE_VERSION}"

echo "Node: $(node -v)"
echo "npm : $(npm -v)"

# -------------------------
# Configure OpenClaw environment directories
# -------------------------
echo "Configuring OpenClaw Workspace Directories..."

WORKSPACE_DIR="/home/ubuntu/clawset"
CONFIG_DIR="$WORKSPACE_DIR/.openclaw"

# Set for current script
export OPENCLAW_WORKSPACE_DIR="$WORKSPACE_DIR"
export OPENCLAW_CONFIG_DIR="$CONFIG_DIR"

# Persist for ubuntu user profile
echo "export OPENCLAW_WORKSPACE_DIR=\"$WORKSPACE_DIR\"" >> ~/.bashrc
echo "export OPENCLAW_CONFIG_DIR=\"$CONFIG_DIR\"" >> ~/.bashrc

# Ensure the config dir exists if clawset is already mounted
if [ -d "$WORKSPACE_DIR" ]; then
  mkdir -p "$CONFIG_DIR"
fi

# -------------------------
# Install openclaw (arm64 fix)
# -------------------------
INSTALL_ENV=()
case "${ARCH}" in
  arm64|aarch64)
    echo "ARM64 detected -> applying opus build flags"
    INSTALL_ENV+=(CFLAGS="-DOPUS_ARM_MAY_HAVE_NEON_INTR")
    ;;
esac

env "${INSTALL_ENV[@]}" npm install -g "${OPENCLAW_PKG}"

echo "openclaw version:"
openclaw --version || true

echo "Done. Optional: openclaw onboard --install-daemon"