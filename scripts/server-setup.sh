#!/bin/bash
# =============================================================================
# MKT Agent — One-time VPS Bootstrap Script
# Run this once on a fresh Ubuntu 22.04 / 24.04 server as root or sudo user.
#
# What it does:
#   1. Updates system packages
#   2. Installs Node.js 22 LTS via nvm
#   3. Installs PM2 globally
#   4. Installs Nginx
#   5. Creates app directory
#   6. Clones repo from GitHub
#   7. Creates log directory for PM2
#   8. Sets up Nginx site (you must edit the domain name first)
#   9. Opens firewall ports
#
# After running this script:
#   → Create /opt/mkt-agent/.env  (see .env.production.example)
#   → Run scripts/deploy.sh to build and start the app
# =============================================================================

set -e

APP_DIR="/opt/mkt-agent"
REPO_URL="https://github.com/maxh2006/mkt-agent.git"
NODE_VERSION="22"

echo "==> [1/9] Updating system packages..."
apt-get update -y
apt-get upgrade -y
apt-get install -y git curl build-essential

echo "==> [2/9] Installing Node.js ${NODE_VERSION} via nvm..."
# Install nvm for current user
export NVM_DIR="$HOME/.nvm"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

# Load nvm in this script session
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install ${NODE_VERSION}
nvm use ${NODE_VERSION}
nvm alias default ${NODE_VERSION}

# Make node/npm available system-wide via symlinks
NODE_BIN=$(nvm which current)
NODE_PATH=$(dirname "$NODE_BIN")
ln -sf "$NODE_PATH/node" /usr/local/bin/node
ln -sf "$NODE_PATH/npm"  /usr/local/bin/npm
ln -sf "$NODE_PATH/npx"  /usr/local/bin/npx

echo "    Node: $(node -v)"
echo "    npm:  $(npm -v)"

echo "==> [3/9] Installing PM2..."
npm install -g pm2
ln -sf "$(which pm2)" /usr/local/bin/pm2 2>/dev/null || true

echo "==> [4/9] Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx

echo "==> [5/9] Creating app directory..."
mkdir -p "$APP_DIR"

echo "==> [6/9] Cloning repository..."
if [ -d "$APP_DIR/.git" ]; then
  echo "    Repo already cloned, skipping."
else
  git clone "$REPO_URL" "$APP_DIR"
fi

echo "==> [7/9] Creating PM2 log directory..."
mkdir -p /var/log/mkt-agent

echo "==> [8/9] Setting up Nginx site..."
cp "$APP_DIR/nginx/mkt-agent.conf" /etc/nginx/sites-available/mkt-agent

# Remove default site if it exists
rm -f /etc/nginx/sites-enabled/default

# Enable mkt-agent site
ln -sf /etc/nginx/sites-available/mkt-agent /etc/nginx/sites-enabled/mkt-agent

echo ""
echo "    ⚠️  EDIT /etc/nginx/sites-available/mkt-agent before continuing."
echo "    Replace 'dev.yourdomain.com' with your actual subdomain."
echo ""
read -p "    Press ENTER when you have updated the domain name..." _

nginx -t && systemctl reload nginx

echo "==> [9/9] Opening firewall ports (SSH, HTTP)..."
ufw allow 22
ufw allow 80
ufw --force enable

echo ""
echo "==========================================================================
  Bootstrap complete.

  NEXT STEPS:
  1. Create the environment file:
       cp $APP_DIR/.env.production.example $APP_DIR/.env
       nano $APP_DIR/.env
     Fill in DATABASE_URL and AUTH_SECRET (run: openssl rand -base64 32)

  2. Build and start the app:
       cd $APP_DIR && bash scripts/deploy.sh

  3. Set PM2 to start on reboot (run the command it prints):
       pm2 startup
       pm2 save
=========================================================================="
