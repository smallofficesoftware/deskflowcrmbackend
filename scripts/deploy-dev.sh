#!/usr/bin/env bash
# Auto-deploy script triggered by the GitHub webhook on push to `dev`.
# Usage: deploy-dev.sh <backend|frontend>
#
# EDIT THESE to match the actual paths / pm2 process names on this server:
BACKEND_DIR="${BACKEND_DIR:-/var/www/demobackend.smalloffice.in}"
FRONTEND_DIR="${FRONTEND_DIR:-/var/www/demo.smalloffice.in}"
PM2_BACKEND_NAME="${PM2_BACKEND_NAME:-deskflowcrm-backend}"
PM2_FRONTEND_NAME="${PM2_FRONTEND_NAME:-deskflowcrm-frontend}"

LOG_DIR="$(dirname "$0")/../logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/deploy-dev.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

deploy_backend() {
  log "=== Backend deploy start ==="
  cd "$BACKEND_DIR" || { log "ERROR: cannot cd to $BACKEND_DIR"; return 1; }

  git fetch origin dev >> "$LOG_FILE" 2>&1
  git reset --hard origin/dev >> "$LOG_FILE" 2>&1

  npm install >> "$LOG_FILE" 2>&1

  NODE_ENV=development npm run migrate:all:up:dev >> "$LOG_FILE" 2>&1

  pm2 restart "$PM2_BACKEND_NAME" >> "$LOG_FILE" 2>&1
  log "=== Backend deploy done ==="
}

deploy_frontend() {
  log "=== Frontend deploy start ==="
  cd "$FRONTEND_DIR" || { log "ERROR: cannot cd to $FRONTEND_DIR"; return 1; }

  git fetch origin dev >> "$LOG_FILE" 2>&1
  git reset --hard origin/dev >> "$LOG_FILE" 2>&1

  npm install >> "$LOG_FILE" 2>&1

  pm2 restart "$PM2_FRONTEND_NAME" >> "$LOG_FILE" 2>&1
  log "=== Frontend deploy done ==="
}

case "$1" in
  backend)
    deploy_backend
    ;;
  frontend)
    deploy_frontend
    ;;
  *)
    log "ERROR: unknown target '$1' (expected backend|frontend)"
    exit 1
    ;;
esac
