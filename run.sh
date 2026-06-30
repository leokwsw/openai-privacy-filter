#!/usr/bin/env bash
#
# run.sh - Start the OpenAI Privacy Filter web interface and API service.
#
# By default the server runs in the background and writes its PID and logs
# to the .run/ directory. Pass --foreground (or -f) to run in the foreground.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VENV_DIR="${VENV_DIR:-.venv}"
RUN_DIR="${RUN_DIR:-.run}"
PID_FILE="$RUN_DIR/server.pid"
LOG_FILE="$RUN_DIR/server.log"

FOREGROUND=0
if [ "${1:-}" = "--foreground" ] || [ "${1:-}" = "-f" ]; then
  FOREGROUND=1
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8080}"

if [ -d "$VENV_DIR" ]; then
  # shellcheck disable=SC1090
  source "$VENV_DIR/bin/activate"
else
  echo "Virtual environment not found at $VENV_DIR. Run ./setup.sh first." >&2
  exit 1
fi

mkdir -p "$RUN_DIR"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Service already running (PID $(cat "$PID_FILE")). Use ./stop.sh first." >&2
  exit 1
fi

CMD=(uvicorn src.app:app --host "$HOST" --port "$PORT")

if [ "$FOREGROUND" -eq 1 ]; then
  echo "==> Starting server in foreground on http://$HOST:$PORT (Ctrl+C to stop)"
  exec "${CMD[@]}"
fi

echo "==> Starting server in background on http://$HOST:$PORT"
nohup "${CMD[@]}" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" >"$PID_FILE"

sleep 1
if kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "Service started (PID $SERVER_PID)."
  echo "  Web UI : http://$HOST:$PORT/"
  echo "  API doc: http://$HOST:$PORT/docs"
  echo "  Logs   : $LOG_FILE"
else
  echo "Service failed to start. Check logs at $LOG_FILE" >&2
  rm -f "$PID_FILE"
  exit 1
fi
