#!/usr/bin/env bash
# Auto-deploy script triggered by the GitHub webhook on push to `dev`.
# Usage: deploy-dev.sh <backend|frontend|adminpanel>
#
# EDIT THESE to match the actual paths / pm2 process names on this server:
BACKEND_DIR="${BACKEND_DIR:-/var/www/demobackend.smalloffice.in}"
FRONTEND_DIR="${FRONTEND_DIR:-/var/www/demo.smalloffice.in}"
ADMINPANEL_DIR="${ADMINPANEL_DIR:-/var/www/demosys.smalloffice.in}"
PM2_BACKEND_NAME="${PM2_BACKEND_NAME:-deskflowcrm-backend}"
PM2_ADMINPANEL_BACKEND_NAME="${PM2_ADMINPANEL_BACKEND_NAME:-deskflowadminpanel-backend}"
BACKEND_NODE_ENV="${BACKEND_NODE_ENV:-DEMO}"

LOG_DIR="$(dirname "$0")/../logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/deploy-dev.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Usage: lockfile_changed <old_commit> <path/to/package-lock.json>
# True (0) if the lockfile differs between old_commit and the current HEAD.
lockfile_changed() {
  ! git diff --quiet "$1" HEAD -- "$2"
}

deploy_backend() {
  log "=== Backend deploy start ==="
  cd "$BACKEND_DIR" || { log "ERROR: cannot cd to $BACKEND_DIR"; return 1; }

  git fetch origin dev >> "$LOG_FILE" 2>&1
  git reset --hard origin/dev >> "$LOG_FILE" 2>&1

  # package-lock.json is gitignored in this repo, so lockfile_changed's
  # `git diff` against it is always empty and npm install was silently
  # skipped on EVERY deploy — including ones that added new dependencies
  # (e.g. @pdfme/*), which then made migrations that import them fail with
  # "Cannot find module" and no visible error (see below). Always install.
  npm install >> "$LOG_FILE" 2>&1
  if [ $? -ne 0 ]; then
    log "!!! MIGRATION-BLOCKING FAILURE: npm install failed, see above in this log !!!"
  fi

  NODE_ENV="$BACKEND_NODE_ENV" node src/scripts/runMigrations.js master migration up >> "$LOG_FILE" 2>&1
  if [ $? -ne 0 ]; then
    log "!!! MASTER MIGRATION FAILED — deploy continued anyway, DB may be out of sync, see above in this log !!!"
  fi
  NODE_ENV="$BACKEND_NODE_ENV" node src/scripts/runMigrations.js tenant migration up >> "$LOG_FILE" 2>&1
  if [ $? -ne 0 ]; then
    log "!!! TENANT MIGRATION FAILED — deploy continued anyway, DB may be out of sync, see above in this log !!!"
  fi

  pm2 restart "$PM2_BACKEND_NAME" >> "$LOG_FILE" 2>&1
  log "=== Backend deploy done ==="
}

deploy_frontend() {
  # `npm run build` used to run right here on this server and OOM'd
  # (webpack + @pdfme/* is too heavy for this box's RAM). The build now
  # happens on a developer machine via scripts/deploy-dev-local-build.sh,
  # which rsyncs the built build/ folder straight into $FRONTEND_DIR/build.
  # This webhook path only keeps the git checkout in sync for reference —
  # it deliberately does NOT install or build anymore.
  log "=== Frontend deploy start (source sync only, build is done locally) ==="
  cd "$FRONTEND_DIR" || { log "ERROR: cannot cd to $FRONTEND_DIR"; return 1; }

  git fetch origin dev >> "$LOG_FILE" 2>&1
  git reset --hard origin/dev >> "$LOG_FILE" 2>&1

  log "=== Frontend deploy done (run scripts/deploy-dev-local-build.sh locally to actually update build/) ==="
}

deploy_adminpanel() {
  log "=== Adminpanel deploy start ==="
  cd "$ADMINPANEL_DIR" || { log "ERROR: cannot cd to $ADMINPANEL_DIR"; return 1; }

  local old_commit
  old_commit="$(git rev-parse HEAD)"
  git fetch origin dev >> "$LOG_FILE" 2>&1
  git reset --hard origin/dev >> "$LOG_FILE" 2>&1

  cd "$ADMINPANEL_DIR/backend" || { log "ERROR: cannot cd to $ADMINPANEL_DIR/backend"; return 1; }
  if lockfile_changed "$old_commit" backend/package-lock.json; then
    npm ci >> "$LOG_FILE" 2>&1
  else
    log "backend/package-lock.json unchanged, skipping npm ci"
  fi
  npm run build >> "$LOG_FILE" 2>&1
  npm run db:migrate >> "$LOG_FILE" 2>&1
  pm2 restart "$PM2_ADMINPANEL_BACKEND_NAME" >> "$LOG_FILE" 2>&1 || pm2 start dist/server.js --name "$PM2_ADMINPANEL_BACKEND_NAME" >> "$LOG_FILE" 2>&1
  pm2 save >> "$LOG_FILE" 2>&1

  cd "$ADMINPANEL_DIR/frontend" || { log "ERROR: cannot cd to $ADMINPANEL_DIR/frontend"; return 1; }
  if lockfile_changed "$old_commit" frontend/package-lock.json; then
    npm ci --legacy-peer-deps >> "$LOG_FILE" 2>&1
  else
    log "frontend/package-lock.json unchanged, skipping npm ci"
  fi
  npm run build >> "$LOG_FILE" 2>&1

  log "=== Adminpanel deploy done ==="
}

case "$1" in
  backend)
    deploy_backend
    ;;
  frontend)
    deploy_frontend
    ;;
  adminpanel)
    deploy_adminpanel
    ;;
  *)
    log "ERROR: unknown target '$1' (expected backend|frontend|adminpanel)"
    exit 1
    ;;
esac
