#!/usr/bin/env bash
# Run this FROM YOUR OWN MACHINE, on the branch you're about to deploy
# (dev -> demo server, main -> production server).
#
# Builds the frontend locally (avoids the server's low-RAM `npm run build`
# OOM crash), commits the built build/ folder, and pushes — the server's
# deploy-dev.sh webhook then just `git reset --hard`s it in, same as any
# other source change. No SSH/rsync needed.
#
# Usage: scripts/deploy-dev-local-build.sh <target>
#   target = a name matching scripts/deploy-targets/<target>.env
#            (picks which CRA env file to build with — nothing else)
#   e.g.:   scripts/deploy-dev-local-build.sh demo
#           scripts/deploy-dev-local-build.sh production
#
# Run from the frontend repo root (where package.json / build/ live), with
# a clean working tree on the branch you intend to push.

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

if [ -z "${REACT_ENV_FILE:-}" ]; then
  echo "ERROR: $TARGET_FILE is missing REACT_ENV_FILE — fill it in first."
  exit 1
fi
if [ ! -f "$REACT_ENV_FILE" ]; then
  echo "ERROR: $REACT_ENV_FILE not found in $(pwd) — create it with this target's real REACT_APP_* values first."
  exit 1
fi

if [ -n "$(git status --porcelain -- . ':!build')" ]; then
  echo "ERROR: working tree has uncommitted changes outside build/ — commit or stash those first."
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# CRA loads .env.production.local on top of .env.production for `npm run
# build` (highest-precedence file, always gitignored) — copying the
# target's env file there lets one build command serve every target
# without ever touching the repo's own .env.production.
echo "Using $REACT_ENV_FILE for this build (target: $TARGET, branch: $BRANCH)..."
cp "$REACT_ENV_FILE" .env.production.local

cleanup() { rm -f .env.production.local; }
trap cleanup EXIT

echo "Building locally..."
GENERATE_SOURCEMAP=false npm run build

echo "Committing build/ ..."
git add build
if git diff --cached --quiet; then
  echo "build/ unchanged, nothing to commit."
else
  git commit -m "Deploy: rebuild frontend ($TARGET)"
fi

echo "Pushing $BRANCH ..."
git push origin "$BRANCH"

echo "Done ($TARGET). The server's dev-push webhook will git reset --hard this in."
