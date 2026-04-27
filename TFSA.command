#!/bin/zsh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"
LOG_FILE="$SCRIPT_DIR/tfsa-server.log"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM HUP

echo "正在启动 TFSA..."
node "$SCRIPT_DIR/server.js" > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

for _ in {1..30}; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "TFSA 启动失败。可能是 3000 端口已经被另一个旧服务占用。"
    echo "请查看日志：$LOG_FILE"
    exit 1
  fi

  if curl -s "$URL" >/dev/null 2>&1; then
    open "$URL"
    echo ""
    echo "TFSA 已打开：$URL"
    echo "保持这个终端窗口打开即可继续使用。"
    echo "要关闭 TFSA，直接关闭这个终端窗口，或在这里按 Ctrl+C。"
    echo ""
    wait "$SERVER_PID"
    exit 0
  fi
  sleep 1
done

echo "TFSA 启动失败。请查看日志：$LOG_FILE"
exit 1
