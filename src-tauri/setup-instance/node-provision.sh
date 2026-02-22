#!/usr/bin/env bash
set -euo pipefail

# Install Node.js LTS 22.x (>=22) on Ubuntu 24.04 using NodeSource
# Installs: node + npm
# Does NOT enable corepack (so no yarn/pnpm shims)

NODE_MAJOR="22"

echo "==> Update apt and install prerequisites..."
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg

echo "==> Add NodeSource repo for Node.js ${NODE_MAJOR}.x..."
curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -

echo "==> Install nodejs (includes npm)..."
sudo apt-get install -y nodejs

echo "==> Verify versions..."
node -v
npm -v

# Ensure major version >= 22
INSTALLED_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [[ "${INSTALLED_MAJOR}" -lt "${NODE_MAJOR}" ]]; then
  echo "ERROR: Installed Node major version is ${INSTALLED_MAJOR}, expected >= ${NODE_MAJOR}."
  exit 1
fi

# If you want to be extra strict about not having yarn/pnpm shims available:
# Do NOT enable corepack (we don't), and optionally remove corepack binary if present
# (Node ships it, but leaving it un-enabled keeps yarn/pnpm unavailable on PATH)
echo "==> Done. Node $(node -v) and npm $(npm -v) installed (no yarn/pnpm enabled)."