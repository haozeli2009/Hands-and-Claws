#!/usr/bin/env bash
set -euo pipefail

ROOT=/opt/agent_system
BACKEND=$ROOT/backend
FRONTEND=$ROOT/frontend

echo "==> Pulling latest code..."
cd $ROOT && git pull

echo "==> Installing backend dependencies..."
cd $BACKEND
.venv/bin/pip install -r requirements.txt -q

echo "==> Building frontend..."
cd $FRONTEND
npm ci --silent
npm run build

echo "==> Restarting service..."
systemctl restart agent-system

echo "==> Tailing logs (Ctrl-C to stop)..."
sleep 2
tail -f $BACKEND/logs/service.log
