#!/usr/bin/env bash
#
# setup.sh - Prepare the local environment for the OpenAI Privacy Filter
#            web interface and API service.
#
# Creates a virtual environment, installs PyTorch (CPU build by default),
# the OpenAI Privacy Filter package, and the API dependencies.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VENV_DIR="${VENV_DIR:-.venv}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
TORCH_INDEX_URL="${TORCH_INDEX_URL:-https://download.pytorch.org/whl/cpu}"
PRIVACY_FILTER_DIR="${PRIVACY_FILTER_DIR:-privacy-filter}"
PRIVACY_FILTER_REPO="${PRIVACY_FILTER_REPO:-https://github.com/openai/privacy-filter.git}"

echo "==> Using Python: $($PYTHON_BIN --version 2>&1)"

if [ ! -d "$VENV_DIR" ]; then
  echo "==> Creating virtual environment in $VENV_DIR"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
else
  echo "==> Reusing existing virtual environment in $VENV_DIR"
fi

# shellcheck disable=SC1090
source "$VENV_DIR/bin/activate"

echo "==> Upgrading pip"
pip install --upgrade pip

echo "==> Installing PyTorch (index: $TORCH_INDEX_URL)"
pip install --index-url "$TORCH_INDEX_URL" --extra-index-url https://pypi.org/simple torch

echo "==> Installing OpenAI Privacy Filter runtime dependencies"
pip install huggingface_hub numpy packaging safetensors tiktoken

if [ ! -e "$PRIVACY_FILTER_DIR/pyproject.toml" ] && [ ! -e "$PRIVACY_FILTER_DIR/setup.py" ]; then
  echo "==> privacy-filter sources missing; fetching into $PRIVACY_FILTER_DIR"
  if [ -f .gitmodules ] && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git submodule update --init --recursive || true
  fi
  if [ ! -e "$PRIVACY_FILTER_DIR/pyproject.toml" ] && [ ! -e "$PRIVACY_FILTER_DIR/setup.py" ]; then
    rm -rf "$PRIVACY_FILTER_DIR"
    git clone --depth 1 "$PRIVACY_FILTER_REPO" "$PRIVACY_FILTER_DIR"
  fi
fi

echo "==> Installing OpenAI Privacy Filter package"
pip install --no-deps "./$PRIVACY_FILTER_DIR"

echo "==> Installing API dependencies"
pip install -r requirements.txt

if [ ! -f .env ]; then
  echo "==> Creating .env from .env.sample"
  cp .env.sample .env
fi

# pm2 is used by run.sh / stop.sh to manage the service. Install it globally if
# it (and a usable npx fallback) is missing. Set SKIP_PM2=1 to skip this step.
if [ "${SKIP_PM2:-0}" != "1" ]; then
  if command -v pm2 >/dev/null 2>&1; then
    echo "==> pm2 already installed ($(pm2 --version))"
  elif command -v npm >/dev/null 2>&1; then
    echo "==> Installing pm2 globally via npm"
    if npm install -g pm2; then
      echo "==> pm2 installed"
    else
      echo "WARNING: global pm2 install failed; run.sh will fall back to 'npx pm2'." >&2
    fi
  else
    echo "WARNING: npm not found; install Node.js + pm2 to use run.sh/stop.sh." >&2
  fi
fi

echo ""
echo "Setup complete. Start the service with: ./run.sh"
