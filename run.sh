#!/usr/bin/env bash
#
# run.sh - Start the OpenAI Privacy Filter web interface and API service
#          using pm2 as the process manager.
#
# pm2 keeps the service alive (auto-restart), centralizes logs, and lets you
# inspect/manage it with the pm2 CLI. Pass --foreground (or -f) to bypass pm2
# and run uvicorn directly in the foreground (useful for debugging).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VENV_DIR="${VENV_DIR:-.venv}"
RUN_DIR="${RUN_DIR:-.run}"
ECOSYSTEM_FILE="${ECOSYSTEM_FILE:-ecosystem.config.js}"
PM2_APP_NAME="${PM2_APP_NAME:-openai-privacy-filter}"

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

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8080}"
export VENV_DIR PM2_APP_NAME

if [ ! -d "$VENV_DIR" ]; then
  echo "Virtual environment not found at $VENV_DIR. Run ./setup.sh first." >&2
  exit 1
fi

mkdir -p "$RUN_DIR"

# Foreground mode: run uvicorn directly without pm2.
if [ "$FOREGROUND" -eq 1 ]; then
  # shellcheck disable=SC1090
  source "$VENV_DIR/bin/activate"
  echo "==> Starting server in foreground on http://$HOST:$PORT (Ctrl+C to stop)"
  exec uvicorn src.app:app --host "$HOST" --port "$PORT"
fi

# Resolve a pm2 binary (global install or npx fallback).
if command -v pm2 >/dev/null 2>&1; then
  PM2=(pm2)
elif command -v npx >/dev/null 2>&1; then
  echo "==> pm2 not found on PATH; using 'npx pm2'"
  PM2=(npx --yes pm2)
else
  echo "pm2 is not installed and npx is unavailable. Run ./setup.sh first." >&2
  exit 1
fi

echo "==> Starting '$PM2_APP_NAME' with pm2 on http://$HOST:$PORT"
# `pm2 startOrReload` starts the app, or reloads it if it is already running.
"${PM2[@]}" startOrReload "$ECOSYSTEM_FILE" --update-env
"${PM2[@]}" save >/dev/null 2>&1 || true

echo ""
"${PM2[@]}" status "$PM2_APP_NAME" || true
echo ""
echo "Service managed by pm2:"
echo "  Web UI : http://$HOST:$PORT/"
echo "  API doc: http://$HOST:$PORT/docs"
echo "  Logs   : ${PM2[*]} logs $PM2_APP_NAME"
echo "  Stop   : ./stop.sh"
