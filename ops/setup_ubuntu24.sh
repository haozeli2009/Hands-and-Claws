#!/usr/bin/env bash
# =============================================================================
# First-time setup for Ubuntu 24.04
# Run as a non-root user with sudo access:
#   bash ops/setup_ubuntu24.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

echo ""
echo "==> [1/7] Installing system packages"
sudo apt-get update -qq
sudo apt-get install -y -qq \
    python3.12 python3.12-venv python3-pip \
    nodejs npm \
    nginx \
    git curl

echo ""
echo "==> [2/7] Setting up Python virtual environment"
cd "$BACKEND"
python3.12 -m venv .venv
.venv/bin/pip install --upgrade pip --quiet
.venv/bin/pip install -r requirements.txt --quiet
echo "    Backend deps installed"

echo ""
echo "==> [3/7] Installing frontend dependencies and building"
cd "$FRONTEND"
npm ci --silent
npm run build
echo "    Frontend built → frontend/dist/"

echo ""
echo "==> [4/7] Creating runtime directories"
mkdir -p "$BACKEND/data" "$BACKEND/logs"

echo ""
echo "==> [5/7] Setting up environment file"
if [ ! -f "$BACKEND/.env" ]; then
    cp "$BACKEND/.env.example" "$BACKEND/.env"
    echo ""
    echo "    *** ACTION REQUIRED ***"
    echo "    Edit $BACKEND/.env and set:"
    echo "      ANTHROPIC_API_KEY=sk-ant-..."
    echo "      JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
    echo "      DASHBOARD_PASS=<something secure>"
    echo ""
    read -p "    Press Enter after editing .env to continue..."
else
    echo "    .env already exists — skipping"
fi

echo ""
echo "==> [6/7] Installing systemd service"
# Patch the service file with the actual path
sed "s|/opt/agent_system|$ROOT|g" "$ROOT/ops/agent-system.service" \
    | sudo tee /etc/systemd/system/agent-system.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable agent-system
sudo systemctl start agent-system
sleep 2
sudo systemctl status agent-system --no-pager | head -8

echo ""
echo "==> [7/7] Installing Nginx config"
sed "s|/opt/agent_system|$ROOT|g" "$ROOT/ops/nginx.conf" \
    | sudo tee /etc/nginx/sites-available/agent-system > /dev/null
sudo ln -sf /etc/nginx/sites-available/agent-system \
             /etc/nginx/sites-enabled/agent-system
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "============================================"
echo " Setup complete!"
echo "============================================"
echo " Frontend:   http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_IP')/"
echo " Dashboard:  http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_IP')/dashboard"
echo " Health:     http://localhost:8000/health"
echo ""
echo " Logs:       tail -f $BACKEND/logs/service.log"
echo " Restart:    sudo systemctl restart agent-system"
echo "============================================"
