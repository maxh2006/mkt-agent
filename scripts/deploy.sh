#!/bin/bash
# =============================================================================
# MKT Agent — Deploy / Update Script
# Run this on the server every time you push new code.
#
# Usage:
#   cd /opt/mkt-agent && bash scripts/deploy.sh
#
# What it does:
#   1. Pulls latest code from GitHub
#   2. Installs/updates dependencies
#   3. Regenerates Prisma client (output is gitignored — must run every time)
#   4. Runs any pending DB migrations
#   5. Rebuilds Next.js
#   6. Restarts PM2 process
# =============================================================================

set -e

APP_DIR="/opt/mkt-agent"
cd "$APP_DIR"

echo ""
echo "==========================================================================
  MKT Agent deploy — $(date '+%Y-%m-%d %H:%M:%S')
=========================================================================="

echo ""
echo "==> [1/6] Pulling latest code from GitHub..."
git pull origin master

echo ""
echo "==> [2/6] Installing dependencies..."
npm install

echo ""
echo "==> [3/6] Generating Prisma client..."
# src/generated/prisma is gitignored — must regenerate every deploy
npx prisma generate

echo ""
echo "==> [4/6] Running database migrations..."
# Safe to run repeatedly — only applies pending migrations
npx prisma migrate deploy

echo ""
echo "==> [5/6] Building Next.js app..."
npm run build

echo ""
echo "==> [6/6] Restarting app via PM2..."
# Start if not running, reload if already running
if pm2 list | grep -q "mkt-agent"; then
  pm2 reload mkt-agent
else
  pm2 start "$APP_DIR/ecosystem.config.js"
fi

pm2 save

echo ""
echo "==========================================================================
  Deploy complete.

  Check status:   pm2 status
  Live logs:      pm2 logs mkt-agent
  Nginx status:   sudo systemctl status nginx
  Restart app:    pm2 restart mkt-agent
  Full restart:   pm2 delete mkt-agent && pm2 start ecosystem.config.js
=========================================================================="
