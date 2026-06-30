#!/usr/bin/env bash
#
# stop.sh - Stop the OpenAI Privacy Filter service managed by pm2.
#
# By default the pm2 process is stopped and removed from the pm2 list. Pass
# --keep to only stop it (leaving it in the list so `pm2 restart` works later).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PM2_APP_NAME="${PM2_APP_NAME:-openai-privacy-filter}"

KEEP=0
if [ "${1:-}" = "--keep" ] || [ "${1:-}" = "-k" ]; then
  KEEP=1
fi

if command -v pm2 >/dev/null 2>&1; then
  PM2=(pm2)
elif command -v npx >/dev/null 2>&1; then
  PM2=(npx --yes pm2)
else
  echo "pm2 is not installed and npx is unavailable; nothing to stop." >&2
  exit 0
fi

if ! "${PM2[@]}" describe "$PM2_APP_NAME" >/dev/null 2>&1; then
  echo "Service '$PM2_APP_NAME' is not registered with pm2; nothing to stop."
  exit 0
fi

if [ "$KEEP" -eq 1 ]; then
  echo "==> Stopping '$PM2_APP_NAME' (keeping it in the pm2 list)"
  "${PM2[@]}" stop "$PM2_APP_NAME"
else
  echo "==> Stopping and removing '$PM2_APP_NAME' from pm2"
  "${PM2[@]}" delete "$PM2_APP_NAME"
fi

"${PM2[@]}" save >/dev/null 2>&1 || true
echo "Service stopped."
