#!/usr/bin/env bash
# =============================================================================
# HOMLine DIGI Seva — Production Deployment Script
# Executed on the EC2 server by the GitHub Actions CD workflow.
#
# Prerequisites on EC2:
#   - /home/ubuntu/homline-django-webapp  (git repo, origin = GitHub main)
#   - /home/ubuntu/homline-django-webapp/venv  (Python virtualenv)
#   - /etc/homline/homline.env  (environment variables, chmod 600)
#   - node/npm installed (for frontend build)
#   - systemd service: homline.service (or gunicorn.service)
#   - sudo permissions for ubuntu to restart/reload homline.service
#
# Usage (from CD workflow):
#   bash /tmp/deploy.sh
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
APP_DIR="/home/ubuntu/homline-django-webapp"
VENV_DIR="$APP_DIR/venv"
PYTHON="$VENV_DIR/bin/python"
PIP="$VENV_DIR/bin/pip"
GUNICORN="$VENV_DIR/bin/gunicorn"
ENV_FILE="/etc/homline/homline.env"
SERVICE_NAME="homline"           # systemd unit name (homline.service)
FALLBACK_SERVICE="gunicorn"      # older unit name used before this setup
FRONTEND_DIR="$APP_DIR/frontend"
LOG_TAG="[homline-deploy]"

log() { echo "$LOG_TAG $*"; }
fail() { echo "$LOG_TAG ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 0. Safety checks
# ---------------------------------------------------------------------------
log "=== HOMLine DIGI Seva — Deployment starting ==="
log "Timestamp: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

[[ -d "$APP_DIR" ]]   || fail "App directory $APP_DIR not found."
[[ -d "$VENV_DIR" ]]  || fail "Virtualenv $VENV_DIR not found."
[[ -f "$ENV_FILE" ]]  || fail "Environment file $ENV_FILE not found. Create it from deploy/aws/homline.env.example."

# Detect which systemd unit to use
if systemctl is-active --quiet "$SERVICE_NAME"; then
    ACTIVE_SERVICE="$SERVICE_NAME"
elif systemctl is-active --quiet "$FALLBACK_SERVICE"; then
    ACTIVE_SERVICE="$FALLBACK_SERVICE"
    log "WARNING: Running under legacy service '$FALLBACK_SERVICE'. Consider migrating to '$SERVICE_NAME'."
else
    # Neither is active — try to identify which unit file exists
    if systemctl list-unit-files --quiet "$SERVICE_NAME.service" 2>/dev/null | grep -q "$SERVICE_NAME"; then
        ACTIVE_SERVICE="$SERVICE_NAME"
    else
        ACTIVE_SERVICE="$FALLBACK_SERVICE"
    fi
    log "WARNING: No running service found; will attempt to start '$ACTIVE_SERVICE' after deploy."
fi

log "Active service unit: $ACTIVE_SERVICE"

# ---------------------------------------------------------------------------
# 1. Record current commit for potential rollback
# ---------------------------------------------------------------------------
cd "$APP_DIR"
PREV_COMMIT=$(git rev-parse HEAD)
log "Previous commit: $PREV_COMMIT"

# ---------------------------------------------------------------------------
# 2. Git pull (main branch, fast-forward only)
# ---------------------------------------------------------------------------
log "Fetching latest code from origin/main..."
git fetch origin main

NEW_COMMIT=$(git rev-parse origin/main)
if [[ "$PREV_COMMIT" == "$NEW_COMMIT" ]]; then
    log "Already at latest commit $NEW_COMMIT. Checking if service needs restart..."
    SKIP_PULL=true
else
    SKIP_PULL=false
fi

if [[ "$SKIP_PULL" == "false" ]]; then
    # Ensure no local untracked files would cause conflicts
    git merge --ff-only origin/main
    log "Updated to commit: $(git rev-parse HEAD)"
fi

# ---------------------------------------------------------------------------
# 3. Build the frontend (React + Vite → static/app/)
# ---------------------------------------------------------------------------
if [[ -d "$FRONTEND_DIR" ]] && [[ -f "$FRONTEND_DIR/package-lock.json" ]]; then
    log "Building frontend..."
    cd "$FRONTEND_DIR"
    # Use ci for reproducible installs
    npm ci --prefer-offline 2>&1 | tail -5
    npm run build 2>&1 | tail -10
    cd "$APP_DIR"
    log "Frontend build complete."
else
    log "WARNING: frontend/ directory or package-lock.json not found — skipping frontend build."
fi

# ---------------------------------------------------------------------------
# 4. Install / update Python dependencies
# ---------------------------------------------------------------------------
log "Installing Python dependencies..."
"$PIP" install --quiet --no-deps -r "$APP_DIR/requirements.txt"
"$PIP" install --quiet -r "$APP_DIR/requirements.txt"
log "Python dependencies installed."

# ---------------------------------------------------------------------------
# 5. Load environment and run Django pre-flight checks
# ---------------------------------------------------------------------------
log "Running Django system check..."
# Load environment file so manage.py can access DATABASE_URL etc.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

"$PYTHON" "$APP_DIR/manage.py" check --deploy --fail-level WARNING \
    2>&1 | grep -v "^System check" | grep -v "^$" || true

# Abort if check returns non-zero
"$PYTHON" "$APP_DIR/manage.py" check --deploy 2>&1
log "Django check passed."

# ---------------------------------------------------------------------------
# 6. Collect static files
# ---------------------------------------------------------------------------
log "Collecting static files..."
"$PYTHON" "$APP_DIR/manage.py" collectstatic --no-input --clear 2>&1 | tail -5
log "Static files collected."

# ---------------------------------------------------------------------------
# 7. Database migrations (forward-only, safe)
# ---------------------------------------------------------------------------
log "Checking for pending migrations..."
PENDING=$(
    "$PYTHON" "$APP_DIR/manage.py" showmigrations --plan 2>/dev/null \
    | grep -c '^\[ \]' || true
)

if [[ "$PENDING" -gt 0 ]]; then
    log "Applying $PENDING pending migration(s)..."
    "$PYTHON" "$APP_DIR/manage.py" migrate --no-input 2>&1
    log "Migrations applied."
else
    log "No pending migrations."
fi

# ---------------------------------------------------------------------------
# 8. Update service file if template differs from installed file
# ---------------------------------------------------------------------------
INSTALLED_SERVICE="/etc/systemd/system/$ACTIVE_SERVICE.service"
TEMPLATE_SERVICE="$APP_DIR/deploy/aws/homline.service"
RELOAD_DAEMON=false

if [[ -f "$TEMPLATE_SERVICE" ]] && [[ -f "$INSTALLED_SERVICE" ]]; then
    if ! diff -q "$TEMPLATE_SERVICE" "$INSTALLED_SERVICE" > /dev/null 2>&1; then
        log "Service file template differs from installed unit. Updating..."
        sudo cp "$TEMPLATE_SERVICE" "$INSTALLED_SERVICE"
        sudo systemctl daemon-reload
        RELOAD_DAEMON=true
        log "Service file updated and daemon reloaded."
    fi
fi

# ---------------------------------------------------------------------------
# 9. Restart / reload Gunicorn
# ---------------------------------------------------------------------------
# Use reload (SIGHUP) if the service is already running — it's graceful.
# Use restart if daemon was reloaded (unit config changed) or service is down.
if [[ "$RELOAD_DAEMON" == "true" ]]; then
    log "Restarting $ACTIVE_SERVICE (unit config changed)..."
    sudo systemctl restart "$ACTIVE_SERVICE"
else
    log "Reloading $ACTIVE_SERVICE (graceful worker restart)..."
    # reload = send SIGHUP; graceful in-place restart keeping connections alive
    sudo systemctl reload-or-restart "$ACTIVE_SERVICE"
fi

# Wait briefly for the service to stabilise
sleep 3

# ---------------------------------------------------------------------------
# 10. Verify service is healthy
# ---------------------------------------------------------------------------
log "Verifying service health..."

if ! systemctl is-active --quiet "$ACTIVE_SERVICE"; then
    log "ERROR: $ACTIVE_SERVICE is NOT running after deployment."
    log "Recent journal output:"
    sudo journalctl -u "$ACTIVE_SERVICE" -n 30 --no-pager
    log "Rolling back to commit $PREV_COMMIT..."
    git reset --hard "$PREV_COMMIT"
    sudo systemctl restart "$ACTIVE_SERVICE"
    fail "Deployment failed. Service did not start. Rolled back to $PREV_COMMIT."
fi

# Health check via the application's healthz endpoint
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8000/healthz/ || echo "000")
if [[ "$HTTP_CODE" != "200" ]]; then
    log "ERROR: Health check returned HTTP $HTTP_CODE (expected 200)."
    log "Recent journal output:"
    sudo journalctl -u "$ACTIVE_SERVICE" -n 30 --no-pager
    log "Rolling back to commit $PREV_COMMIT..."
    git reset --hard "$PREV_COMMIT"
    "$PYTHON" "$APP_DIR/manage.py" collectstatic --no-input --clear 2>&1 | tail -3
    sudo systemctl restart "$ACTIVE_SERVICE"
    fail "Deployment failed. Health check failed (HTTP $HTTP_CODE). Rolled back."
fi

# ---------------------------------------------------------------------------
# 11. Summary
# ---------------------------------------------------------------------------
DEPLOYED_COMMIT=$(git rev-parse HEAD)
log "=== Deployment successful ==="
log "Deployed commit : $DEPLOYED_COMMIT"
log "Previous commit : $PREV_COMMIT"
log "Service status  : $(systemctl is-active $ACTIVE_SERVICE)"
log "Health check    : HTTP $HTTP_CODE ✓"
log "Timestamp       : $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
