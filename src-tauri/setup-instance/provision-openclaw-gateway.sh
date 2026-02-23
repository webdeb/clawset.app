#!/usr/bin/env bash
set -euo pipefail

# OpenClaw bootstrap (gateway-only)
# - Idempotent
# - Creates config/state/workspace paths
# - Ensures user-level npm global install path
# - Starts/restarts gateway

BASE_DIR="${OPENCLAW_BASE_DIR:-$HOME/clawset}"
CONFIG_DIR="$BASE_DIR/openclaw/config"
CONFIG_PATH="$CONFIG_DIR/openclaw.json"
PORT="${OPENCLAW_PORT:-18789}"
BIND_MODE="${OPENCLAW_BIND_MODE:-lan}"                     # loopback|lan|tailnet
DISABLE_DEVICE_AUTH="${OPENCLAW_DISABLE_DEVICE_AUTH:-true}" # true/false

NPM_GLOBAL_DIR="$HOME/.npm-global"
NPM_GLOBAL_BIN="$NPM_GLOBAL_DIR/bin"

log() { echo "==> $*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

append_if_missing() {
  local file="$1" line="$2"
  grep -Fqx "$line" "$file" 2>/dev/null || echo "$line" >> "$file"
}

log "Preflight checks"
require_cmd bash
require_cmd uname
require_cmd openssl
require_cmd sed
require_cmd grep
require_cmd mkdir
require_cmd node
require_cmd npm

mkdir -p "$BASE_DIR" "$CONFIG_DIR"

log "Ensuring user-level npm global prefix"
npm config set prefix "$NPM_GLOBAL_DIR" >/dev/null
mkdir -p "$NPM_GLOBAL_BIN"

# Ensure PATH in current shell + future shells
export PATH="$NPM_GLOBAL_BIN:$PATH"
touch "$HOME/.bashrc"
append_if_missing "$HOME/.bashrc" ""
append_if_missing "$HOME/.bashrc" "# npm global user bin"
append_if_missing "$HOME/.bashrc" "export PATH=\"$HOME/.npm-global/bin:\$PATH\""

log "Persisting OpenClaw env vars in ~/.bashrc"
append_if_missing "$HOME/.bashrc" ""
append_if_missing "$HOME/.bashrc" "# OpenClaw custom paths"
append_if_missing "$HOME/.bashrc" "export OPENCLAW_CONFIG_PATH=\"$HOME/clawset/openclaw/config/openclaw.json\""
append_if_missing "$HOME/.bashrc" "export OPENCLAW_STATE_DIR=\"$HOME/clawset/openclaw/config\""
append_if_missing "$HOME/.bashrc" "export OPENCLAW_WORKSPACE=\"$HOME/clawset\""

# For this run
export OPENCLAW_CONFIG_PATH="$CONFIG_PATH"
export OPENCLAW_STATE_DIR="$CONFIG_DIR"
export OPENCLAW_WORKSPACE="$BASE_DIR"

log "Installing/Updating OpenClaw"
ARCH="$(uname -m)"
if [[ "$ARCH" == "aarch64" || "$ARCH" == "arm64" ]]; then
  CFLAGS='-DOPUS_ARM_MAY_HAVE_NEON_INTR' npm i -g openclaw@latest --verbose
else
  npm i -g openclaw@latest --verbose
fi

require_cmd openclaw

if [[ ! -f "$CONFIG_PATH" ]]; then
  TOKEN="$(openssl rand -hex 24)"
  log "Creating fresh config at $CONFIG_PATH"
  cat > "$CONFIG_PATH" <<JSON
{
  "agents": {
    "defaults": {
      "workspace": "$BASE_DIR"
    }
  },
  "gateway": {
    "port": $PORT,
    "bind": "$BIND_MODE",
    "auth": {
      "mode": "token",
      "token": "$TOKEN"
    },
    "controlUi": {
      "dangerouslyDisableDeviceAuth": $DISABLE_DEVICE_AUTH
    }
  }
}
JSON
  log "Generated token: $TOKEN"
else
  log "Config exists ($CONFIG_PATH), keeping existing values"
fi

log "Starting gateway"
openclaw gateway restart || openclaw gateway start

log "Status snapshot"
openclaw status | sed -n '1,30p'

cat <<EOF

Done.
- Config: $CONFIG_PATH
- State : $CONFIG_DIR
- Workspace: $BASE_DIR
- Dashboard port: $PORT

Tip:
  source ~/.bashrc
  openclaw dashboard
EOF
