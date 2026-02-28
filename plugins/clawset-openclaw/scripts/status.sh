#!/usr/bin/env bash
source ~/.bashrc 2>/dev/null || true

# Collect all app-level status as JSON
# This is the agent app's responsibility — not the instance provider's

NODE_VERSION=""
OPENCLAW_INSTALLED="false"
OPENCLAW_STATUS="{}"
IS_PROVISIONING="false"

# Node.js
if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v 2>/dev/null || echo "")
fi

# OpenClaw
if command -v openclaw &>/dev/null; then
    OPENCLAW_INSTALLED="true"
    OPENCLAW_STATUS=$(openclaw status --all --json 2>/dev/null || echo '{}')
fi

# Provisioning
if [ -f /tmp/provisioning ]; then
    IS_PROVISIONING="true"
fi

# Output structured JSON
cat <<EOF
{
  "node_installed": "$NODE_VERSION",
  "openclaw_installed": $OPENCLAW_INSTALLED,
  "is_provisioning": $IS_PROVISIONING,
  "openclaw_status": $OPENCLAW_STATUS
}
EOF
