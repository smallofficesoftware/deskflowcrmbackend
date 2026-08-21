#!/usr/bin/env bash
# Run this FROM YOUR OWN MACHINE (not the server) after pushing to `dev`.
# Builds the frontend locally (avoids the server's low-RAM `npm run build`
# OOM crash) and rsyncs the built `build/` folder straight into the path
# deploy-dev.sh's deploy_frontend() would otherwise have built in-place.
#
# Usage: scripts/deploy-dev-local-build.sh
# Run from the frontend repo root (where package.json / build/ live).
#
# EDIT THESE to match the real server login / path:
SSH_TARGET="${SSH_TARGET:-root@vmi3137091}"
FRONTEND_DIR="${FRONTEND_DIR:-/var/www/demo.smalloffice.in}"

set -euo pipefail

echo "Building locally..."
GENERATE_SOURCEMAP=false npm run build

echo "Syncing build/ to $SSH_TARGET:$FRONTEND_DIR/build ..."
rsync -avz --delete build/ "$SSH_TARGET:$FRONTEND_DIR/build/"

echo "Done. nginx serves the new build immediately, no restart needed."
