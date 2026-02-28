#!/usr/bin/env bash
source ~/.bashrc 2>/dev/null || true

# Output JSON status to stdout
openclaw status --all --json 2>/dev/null || echo '{"running": false}'
