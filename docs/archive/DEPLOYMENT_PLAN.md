#!/bin/bash
# prepare-server-package.sh
# Run this on dev laptop to create server deployment package

set -e

echo "📦 Creating server deployment package..."

# Create temporary directory
SERVER_PKG="devconnect-server-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SERVER_PKG"

echo "📁 Copying essential files..."

# Copy package files
cp package.json "$SERVER_PKG/"
cp package-lock.json "$SERVER_PKG/" 2>/dev/null || cp yarn.lock "$SERVER_PKG/" 2>/dev/null || true
cp tsconfig.json "$SERVER_PKG/"
cp next.config.js "$SERVER_PKG/" 2>/dev/null || cp next.config.mjs "$SERVER_PKG/" 2>/dev/null || true

# Copy source directories
mkdir -p "$SERVER_PKG/src"
cp -r src/app "$SERVER_PKG/src/"           # All pages and API routes
cp -r src/lib "$SERVER_PKG/src/"           # All helper modules
cp -r src/config "$SERVER_PKG/src/"        # Configuration
cp -r src/components "$SERVER_PKG/src/"    # UI components (for API routes that might use them)
cp -r src/styles "$SERVER_PKG/src/" 2>/dev/null || true

# Copy public assets if they exist
if [ -d "public" ]; then
    cp -r public "$SERVER_PKG/"
fi

# Create .env template (user will fill in secrets)
cat > "$SERVER_PKG/.env.production.local.TEMPLATE" << 'EOF'
# ==========================================
# SERVER SECRETS - Fill these in on the server
# ==========================================

# Platform Signer Private Key (64-char hex, with or without 0x)
FEED_PRIVATE_KEY=YOUR_64_CHAR_HEX_KEY_HERE

# Session Secret for Admin Cookies (min 32 chars, generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SESSION_SECRET=YOUR_RANDOM_SECRET_HERE

# Admin/Moderator Wallet Addresses (comma-separated, with 0x)
ADMIN_ADDRESSES=0xYourAddress1,0xYourAddress2

# Bee Node URLs for Server Operations
BEE_URLS=http://localhost:1633,http://bee-node:1633

# Postage Batch ID for Server Writes
POSTAGE_BATCH_ID=YOUR_BATCH_ID_HERE

# ==========================================
# PUBLIC VARIABLES (safe to expose to browser)
# ==========================================

# Public Bee Gateway URL (will be your server domain)
NEXT_PUBLIC_BEE_URL=https://YOUR_DOMAIN_HERE/bee

# Public Postage Batch (if clients do direct uploads)
NEXT_PUBLIC_POSTAGE_BATCH_ID=YOUR_BATCH_ID_HERE
EOF

# Create deployment instructions
cat > "$SERVER_PKG/DEPLOY_ON_SERVER.md" << 'EOF'
# Server Deployment Instructions

## 1. Prerequisites on Server (WSL/Ubuntu)

```bash
# Install Node.js LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Docker
sudo apt install -y docker.io
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER

# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

## 2. Deploy This Package

```bash
# Extract package
cd ~
tar -xzf devconnect-server-*.tar.gz
cd devconnect-server-*

# Fill in secrets
cp .env.production.local.TEMPLATE .env.production.local
nano .env.production.local
# Fill in: FEED_PRIVATE_KEY, SESSION_SECRET, ADMIN_ADDRESSES, POSTAGE_BATCH_ID

# Install dependencies
npm install

# Build
npm run build

# Test locally
npm start
# Visit http://localhost:3000 to verify

# Set up systemd service (see main guide)
```

## 3. Deploy Bee Gateway

Follow the Bee Gateway setup instructions from the main deployment guide.

## 4. Configure Caddy

See Caddyfile example in main deployment guide.

## 5. Test

```bash
# Test API
curl http://localhost:3000/api/profile

# Test Bee Gateway
curl http://localhost:3323/health
```
EOF

# Create README
cat > "$SERVER_PKG/README.md" << 'EOF'
# DevConnect Server Package

This package contains ONLY the server-side code and dependencies.

## What's included:
- All API routes (/api/*)
- Server-only helpers (publisher.ts, store-swarm.ts, etc.)
- Configuration files
- Environment template

## What's NOT included:
- No heavy dev dependencies
- No client build tools (only what Next.js needs for API routes)

## Deployment:
See DEPLOY_ON_SERVER.md for instructions.

## Important Files:
- `.env.production.local.TEMPLATE` - Copy and fill with secrets
- `src/app/api/` - API endpoints
- `src/lib/forum/publisher.ts` - Feed publishing (uses FEED_PRIVATE_KEY)
- `src/lib/moderation/store-swarm.ts` - Moderation writes
- `src/config/swarm.ts` - Server configuration

## Security:
- NEVER expose FEED_PRIVATE_KEY to clients
- NEVER commit .env.production.local to git
- Keep SESSION_SECRET strong and random (32+ chars)
EOF

echo "📦 Creating tarball..."
tar -czf "${SERVER_PKG}.tar.gz" "$SERVER_PKG"

echo "✅ Server package created: ${SERVER_PKG}.tar.gz"
echo ""
echo "📤 Transfer this file to your server laptop using:"
echo "   - USB drive"
echo "   - SCP: scp ${SERVER_PKG}.tar.gz user@server-ip:~/"
echo "   - Or any file transfer method"
echo ""
echo "🔧 On the server, follow instructions in DEPLOY_ON_SERVER.md"

# Clean up
rm -rf "$SERVER_PKG"
