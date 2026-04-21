#!/bin/bash
# =============================================================================
# MKT Agent — Deploy / Update Script
# Run this on the server every time you push new code.
#
# Usage (canonical):
#   sudo bash /opt/mkt-agent/scripts/deploy.sh
#
# Ownership model (see docs/08-deployment.md — Deploy ownership model):
#   - /opt/mkt-agent is root-owned
#   - PM2 god daemon runs as root
#   - Deploy must therefore run as root so git/npm/prisma/next all act on
#     a directory they own. Running as a non-root user trips git's
#     dubious-ownership guard and leaves PM2 in an inconsistent state.
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

# ─── Root guard ──────────────────────────────────────────────────────────────
# Fail fast with a clear message if not run as root, so operators don't
# rediscover the dubious-ownership trap the hard way.
if [[ "$EUID" -ne 0 ]]; then
  echo "ERROR: deploy.sh must be run as root (sudo bash scripts/deploy.sh)"
  echo "See docs/08-deployment.md — Deploy ownership model"
  exit 1
fi

APP_DIR="/opt/mkt-agent"
cd "$APP_DIR"

# ─── Ownership self-heal ─────────────────────────────────────────────────────
# Idempotent: if the tree drifted back to a non-root owner (e.g. someone
# ran `git clone` as a different user), normalise it before git touches it.
if [[ "$(stat -c '%U' "$APP_DIR")" != "root" ]]; then
  echo "    Normalising $APP_DIR ownership to root:root…"
  chown -R root:root "$APP_DIR"
fi

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
# Kill any stale processes on port 3000 (e.g. leftover nohup or old PM2).
# We're already root (enforced by the guard above), so no sudo needed.
fuser -k 3000/tcp 2>/dev/null || true
sleep 1

# Stop existing PM2 process if running, then start fresh
pm2 delete mkt-agent 2>/dev/null || true
PORT=3000 NODE_ENV=production pm2 start "npx next start -p 3000" --name mkt-agent
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
