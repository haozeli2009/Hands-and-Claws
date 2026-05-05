#!/usr/bin/env bash
# ============================================================
# First-time setup for Ubuntu 24.04 LTS
# Run as root (or with sudo) on a fresh VPS.
#
# Usage:
#   sudo bash ops/setup_ubuntu.sh
# ============================================================
set -euo pipefail

APP_USER=appuser
APP_DIR=/opt/agent_system
REPO_URL=""          # set this to your git remote, or leave blank to copy files manually

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}==>${NC} $*"; }
warn()  { echo -e "${YELLOW}==>${NC} $*"; }
error() { echo -e "${RED}ERROR:${NC} $*"; exit 1; }

[[ $EUID -ne 0 ]] && error "Run this script with sudo."

# ── 1. System packages ────────────────────────────────────────────────────────
info "Updating package lists..."
apt-get update -qq

info "Installing system dependencies..."
apt-get install -y -qq \
    python3 python3-pip python3-venv python3-dev \
    nodejs npm \
    nginx \
    curl git \
    build-essential libffi-dev libssl-dev \
    ufw

# ── 2. Firewall ───────────────────────────────────────────────────────────────
info "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
info "Firewall active. Allowed: SSH, 80, 443."

# ── 3. App user ───────────────────────────────────────────────────────────────
if ! id "$APP_USER" &>/dev/null; then
    info "Creating user $APP_USER..."
    adduser --disabled-password --gecos "" "$APP_USER"
fi

# ── 4. App directory ──────────────────────────────────────────────────────────
info "Creating app directory at $APP_DIR..."
mkdir -p "$APP_DIR"

if [[ -n "$REPO_URL" ]]; then
    info "Cloning repository..."
    git clone "$REPO_URL" "$APP_DIR"
else
    warn "REPO_URL not set — copy your backend/ frontend/ ops/ directories to $APP_DIR manually."
    warn "Then re-run: bash ops/setup_ubuntu.sh  (it is safe to run multiple times)"
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── 5. Backend Python venv ────────────────────────────────────────────────────
if [[ -d "$APP_DIR/backend" ]]; then
    info "Creating Python virtual environment..."
    cd "$APP_DIR/backend"
    sudo -u "$APP_USER" python3 -m venv .venv
    sudo -u "$APP_USER" .venv/bin/pip install -q --upgrade pip
    sudo -u "$APP_USER" .venv/bin/pip install -q -r requirements.txt
    info "Backend deps installed."

    # Create .env if missing
    if [[ ! -f "$APP_DIR/backend/.env" ]]; then
        cp "$APP_DIR/backend/.env.example" "$APP_DIR/backend/.env"
        chown "$APP_USER:$APP_USER" "$APP_DIR/backend/.env"
        warn ".env created from .env.example — EDIT IT NOW:"
        warn "  sudo nano $APP_DIR/backend/.env"
        warn "  Set: ANTHROPIC_API_KEY, JWT_SECRET, DASHBOARD_PASS"
    fi

    # Create runtime dirs
    sudo -u "$APP_USER" mkdir -p "$APP_DIR/backend/data" "$APP_DIR/backend/logs"
else
    warn "backend/ not found in $APP_DIR — skipping Python setup."
fi

# ── 6. Frontend build ─────────────────────────────────────────────────────────
if [[ -d "$APP_DIR/frontend" ]]; then
    info "Building frontend..."
    cd "$APP_DIR/frontend"
    sudo -u "$APP_USER" npm ci --silent
    sudo -u "$APP_USER" npm run build
    info "Frontend built → $APP_DIR/frontend/dist"
else
    warn "frontend/ not found in $APP_DIR — skipping frontend build."
fi

# ── 7. Nginx ──────────────────────────────────────────────────────────────────
if [[ -f "$APP_DIR/ops/nginx.conf" ]]; then
    info "Configuring Nginx..."
    # Patch the root path in nginx.conf to point to our dist/
    sed "s|/opt/agent_system/frontend/dist|$APP_DIR/frontend/dist|g" \
        "$APP_DIR/ops/nginx.conf" > /etc/nginx/sites-available/agent-system

    ln -sf /etc/nginx/sites-available/agent-system \
           /etc/nginx/sites-enabled/agent-system
    rm -f /etc/nginx/sites-enabled/default

    nginx -t && systemctl reload nginx
    info "Nginx configured and reloaded."
else
    warn "ops/nginx.conf not found — skipping Nginx setup."
fi

# ── 8. systemd service ────────────────────────────────────────────────────────
if [[ -f "$APP_DIR/ops/agent-system.service" ]]; then
    info "Installing systemd service..."
    sed "s|/opt/agent_system|$APP_DIR|g" \
        "$APP_DIR/ops/agent-system.service" > /etc/systemd/system/agent-system.service

    systemctl daemon-reload
    systemctl enable agent-system
    systemctl start agent-system
    sleep 2
    systemctl status agent-system --no-pager -l || true
    info "Service started."
else
    warn "ops/agent-system.service not found — skipping systemd setup."
fi

# ── 9. Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            Setup complete!                   ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo "  Next steps:"
echo "  1. Edit secrets:  sudo nano $APP_DIR/backend/.env"
echo "  2. Restart:       sudo systemctl restart agent-system"
echo "  3. Check logs:    sudo tail -f $APP_DIR/backend/logs/service.log"
echo "  4. Open browser:  http://$(curl -s ifconfig.me 2>/dev/null || echo YOUR_SERVER_IP)"
echo "  5. Admin panel:   http://$(curl -s ifconfig.me 2>/dev/null || echo YOUR_SERVER_IP)/dashboard"
echo ""
echo "  Optional TLS:"
echo "    sudo apt install certbot python3-certbot-nginx"
echo "    sudo certbot --nginx -d yourdomain.com"
echo ""
