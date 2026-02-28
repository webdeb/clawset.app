#!/usr/bin/env bash
set -euo pipefail
source ~/.bashrc

case "${1:-}" in
  start)
    openclaw gateway start
    echo "OpenClaw gateway started"
    ;;
  stop)
    openclaw gateway stop
    echo "OpenClaw gateway stopped"
    ;;
  *)
    echo "Usage: control.sh {start|stop}"
    exit 1
    ;;
esac
