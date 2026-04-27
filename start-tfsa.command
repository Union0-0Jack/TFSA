#!/bin/zsh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"
LOG_FILE="$SCRIPT_DIR/tfsa-server.log"
PID_FILE="$SCRIPT_DIR/.tfsa-server.pid"

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if kill -0 "$EXISTING_PID" 2>/dev/null; then
    open "$URL"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

nohup node "$SCRIPT_DIR/server.js" > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

for _ in {1..30}; do
  if curl -s "$URL" >/dev/null 2>&1; then
    open "$URL"
    exit 0
  fi
  sleep 1
done

echo "TFSA server did not become ready. Check $LOG_FILE"
exit 1
