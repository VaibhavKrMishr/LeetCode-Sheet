#!/usr/bin/env bash

# ==============================================================================
# LeetCode Company-Wise DSA Sheet — Local Web Launcher
# Starts the Python static + SQLite (progress.db) server (scripts/serve.py)
# and opens the website in your default browser.
# ==============================================================================

DEFAULT_PROJECT_DIR="/home/vaibhav/Desktop/leetcode-company-wise-problems-main"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

if [ -f "$SCRIPT_DIR/index.html" ]; then
  PROJECT_DIR="$SCRIPT_DIR"
else
  PROJECT_DIR="$DEFAULT_PROJECT_DIR"
fi

PORT=3008
URL="http://localhost:${PORT}"
ICON_PATH="$PROJECT_DIR/assets/app-icon.svg"

is_server_ready() {
  if command -v curl >/dev/null 2>&1; then
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 1 "$URL/api/health" 2>/dev/null)
    [ "$status" = "200" ]
    return $?
  fi
  pgrep -f "serve.py --port $PORT" >/dev/null 2>&1
  return $?
}

if ! is_server_ready; then
  cd "$PROJECT_DIR" || exit 1
  if [ -f "$PROJECT_DIR/scripts/serve.py" ]; then
    # Upgrade any legacy python http.server on the same port to serve.py
    pkill -f "[h]ttp.server $PORT" >/dev/null 2>&1 || true
    sleep 0.2
    nohup python3 "$PROJECT_DIR/scripts/serve.py" --port "$PORT" </dev/null > "$PROJECT_DIR/server.log" 2>&1 &
  else
    nohup python3 -m http.server "$PORT" --directory "$PROJECT_DIR" </dev/null > "$PROJECT_DIR/server.log" 2>&1 &
  fi

  MAX_RETRIES=24
  RETRIES=0
  while [ $RETRIES -lt $MAX_RETRIES ]; do
    sleep 0.2
    if is_server_ready; then
      break
    fi
    RETRIES=$((RETRIES + 1))
  done
fi

if command -v notify-send >/dev/null 2>&1; then
  if [ -f "$ICON_PATH" ]; then
    notify-send "LeetCode Sheet" "Opening LeetCode Company-Wise Website at $URL" -i "$ICON_PATH" >/dev/null 2>&1 || true
  else
    notify-send "LeetCode Sheet" "Opening LeetCode Company-Wise Website at $URL" >/dev/null 2>&1 || true
  fi
fi

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v google-chrome >/dev/null 2>&1; then
  google-chrome "$URL" >/dev/null 2>&1 &
elif command -v firefox >/dev/null 2>&1; then
  firefox "$URL" >/dev/null 2>&1 &
fi

exit 0
