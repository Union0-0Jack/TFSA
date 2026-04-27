#!/bin/zsh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$SCRIPT_DIR/.tfsa-server.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No TFSA server pid file found."
  exit 0
fi

PID="$(cat "$PID_FILE")"

if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  echo "Stopped TFSA server ($PID)."
else
  echo "TFSA server process is not running."
fi

rm -f "$PID_FILE"
