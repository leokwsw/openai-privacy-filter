#!/usr/bin/env bash
#
# stop.sh - Stop the background OpenAI Privacy Filter service started by run.sh.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RUN_DIR="${RUN_DIR:-.run}"
PID_FILE="$RUN_DIR/server.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "No PID file found at $PID_FILE; service does not appear to be running."
  exit 0
fi

PID="$(cat "$PID_FILE")"

if ! kill -0 "$PID" 2>/dev/null; then
  echo "Process $PID is not running. Cleaning up stale PID file."
  rm -f "$PID_FILE"
  exit 0
fi

echo "==> Stopping service (PID $PID)"
kill "$PID"

for _ in $(seq 1 10); do
  if ! kill -0 "$PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

if kill -0 "$PID" 2>/dev/null; then
  echo "Service did not stop gracefully; sending SIGKILL"
  kill -9 "$PID" 2>/dev/null || true
fi

rm -f "$PID_FILE"
echo "Service stopped."
