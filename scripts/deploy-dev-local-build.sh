#!/usr/bin/env bash
# Run this FROM YOUR OWN MACHINE (not the server) after pushing.
# Builds the frontend locally (avoids the server's low-RAM `npm run build`
# OOM crash) and rsyncs the built `build/` folder straight into the target
# server's serve path.
#
# Usage: scripts/deploy-dev-local-build.sh <target>
#   target = a name matching scripts/deploy-targets/<target>.env
#   e.g.:   scripts/deploy-dev-local-build.sh demo
#           scripts/deploy-dev-local-build.sh production
#
# Run from the frontend repo root (where package.json / build/ live).

set -euo pipefail

TARGET="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_FILE="$SCRIPT_DIR/deploy-targets/$TARGET.env"

if [ -z "$TARGET" ] || [ ! -f "$TARGET_FILE" ]; then
  echo "Usage: $0 <target>"
  echo "Available targets:"
  for f in "$SCRIPT_DIR"/deploy-targets/*.env; do
    echo "  - $(basename "$f" .env)"
  done
  exit 1
fi

# shellcheck source=/dev/null
source "$TARGET_FILE"

if [ -z "${SSH_TARGET:-}" ] || [ -z "${REMOTE_DIR:-}" ] || [ -z "${REACT_ENV_FILE:-}" ]; then
  echo "ERROR: $TARGET_FILE is missing SSH_TARGET / REMOTE_DIR / REACT_ENV_FILE — fill it in first."
  exit 1
fi

if [ ! -f "$REACT_ENV_FILE" ]; then
  echo "ERROR: $REACT_ENV_FILE not found in $(pwd) — create it with this target's real REACT_APP_* values first."
  exit 1
fi

# CRA loads .env.production.local on top of .env.production for `npm run
# build` (highest-precedence file, always gitignored) — copying the
# target's env file there lets one build command serve every target
# without ever touching the repo's own .env.production.
echo "Using $REACT_ENV_FILE for this build (target: $TARGET)..."
cp "$REACT_ENV_FILE" .env.production.local

cleanup() { rm -f .env.production.local; }
trap cleanup EXIT

echo "Building locally..."
GENERATE_SOURCEMAP=false npm run build

echo "Syncing build/ to $SSH_TARGET:$REMOTE_DIR/build ..."
rsync -avz --delete build/ "$SSH_TARGET:$REMOTE_DIR/build/"

echo "Done ($TARGET). nginx serves the new build immediately, no restart needed."
