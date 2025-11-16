# Two-Laptop Deployment Architecture

This guide explains how to deploy your DevConnect system across two laptops:
- **Dev Laptop** (current): Development, building, and uploading to Swarm
- **Server Laptop** (old Windows 10): Bee Gateway + Server APIs + Platform Signer

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│  DEV LAPTOP (This laptop)               │
│  - Keep full codebase                   │
│  - Continue development                 │
│  - Build static client                  │
│  - Upload to Swarm                      │
└─────────────────────────────────────────┘
                  │
                  │ Transfer minimal package
                  ▼
┌─────────────────────────────────────────┐
│  SERVER LAPTOP (Old Windows 10)         │
│  WSL/Ubuntu:                            │
│  - Bee Node (Docker)                    │
│  - Bee Gateway Proxy (port 3323)        │
│  - Next.js API routes (port 3000)       │
│  - Platform Signer (FEED_PRIVATE_KEY)   │
│  - Caddy reverse proxy (HTTPS)          │
└─────────────────────────────────────────┘
                  │
                  │ API calls
                  ▼
┌─────────────────────────────────────────┐
│  SWARM (woco.eth.limo)                  │
│  - Static Next.js build                 │
│  - All client-side code                 │
│  - Images, CSS, JS                      │
└─────────────────────────────────────────┘
```

---

## Phase 1: Prepare Server Package (On Dev Laptop)

### Step 1.1: Run the Package Script

**Option A: Using Windows Batch File**
```cmd
cd C:\Users\nabil\devconnect-profile-sandbox
prepare-server-package.bat
```

**Option B: Using WSL/Git Bash**
```bash
cd /mnt/c/Users/nabil/devconnect-profile-sandbox
chmod +x prepare-server-package.sh
./prepare-server-package.sh
```

This creates a folder/tarball with:
- `src/app/api/` - All API routes
- `src/lib/` - Helper modules (including publisher.ts)
- `src/config/` - Configuration (swarm.ts with FEED_PRIVATE_KEY import)
- `src/components/` - UI components (needed by some API routes)
- `package.json`, `tsconfig.json`, `next.config.js`
- `.env.production.local.TEMPLATE` - Empty template for secrets
- `DEPLOY_ON_SERVER.md` - Deployment instructions
- `README.md` - Package documentation

### Step 1.2: Transfer to Server Laptop

**Option A: USB Drive**
1. Copy `devconnect-server-YYYYMMDD-HHMMSS/` folder to USB
2. Plug USB into server laptop
3. Copy to a location accessible from WSL (e.g., `C:\Users\YourName\`)

**Option B: Network Share**
1. Enable file sharing on dev laptop
2. From server laptop, access `\\DEV-LAPTOP-IP\SharedFolder`
3. Copy the folder

**Option C: Direct Transfer (if both on same network)**
```bash
# From dev laptop (WSL/Git Bash)
scp -r devconnect-server-* user@server-laptop-ip:~/
```

---

## Phase 2: Set Up Server Laptop

### Step 2.1: Verify WSL/Ubuntu Setup

On your server laptop, open WSL/Ubuntu:

```bash
# Check WSL is working
wsl --status

# Check Ubuntu version
lsb_release -a

# Update system
sudo apt update && sudo apt upgrade -y
```

### Step 2.2: Install Prerequisites

```bash
# Install Node.js LTS (v20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version
npm --version

# Install Docker (if not already)
sudo apt install -y docker.io
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER

# IMPORTANT: Logout and login to WSL for docker group to take effect
exit
# Then reopen WSL

# Verify Docker works without sudo
docker ps

# Install Git
sudo apt install -y git

# Install Caddy (for HTTPS)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### Step 2.3: Deploy Bee Gateway

```bash
# Clone bee-slam repository
cd ~
git clone https://github.com/ethersphere/bee-slam.git
cd bee-slam

# Copy your updated proxy code from dev laptop
# You'll need to transfer C:\Users\nabil\bee_gateway\bee-slam\proxy to ~/bee-slam/proxy
# Use USB, SCP, or network share

# Build the proxy
cd proxy
npm install
npm run build

# Verify dist/ folder has the new code
ls -la dist/

# Start Bee Gateway
cd ~/bee-slam
docker-compose up -d

# Check containers are running
docker ps
# Should see: bee-node and bee-proxy

# Check logs
docker logs bee-proxy
docker logs bee-node

# Test health endpoint
curl http://localhost:3323/health
```

### Step 2.4: Deploy Next.js Server Package

```bash
# Navigate to the transferred package
# If you copied to C:\Users\YourName\devconnect-server-..., access via:
cd /mnt/c/Users/YourName/devconnect-server-*

# Or if you extracted to WSL home:
cd ~/devconnect-server-*

# Copy the .env template
cp .env.production.local.TEMPLATE .env.production.local

# Edit with your secrets
nano .env.production.local
```

Fill in:
```bash
# Copy these from your dev laptop's .env.local
FEED_PRIVATE_KEY=709e900683b5da55f1b0b57d93cd90634b4bb2cf16c31334b9eff171a7b30fbe
POSTAGE_BATCH_ID=58a35141d74fedb10a6d4ebb9064b3f473ecd98df49be771cc6abed98a0ee756
ADMIN_ADDRESSES=0xB49c8DDB7cC8168350E15CB90c899E63d2744d60,0x87b87644CC640C48C63E90eaFcbe235226Edd10B

# Generate a NEW session secret (don't use dev one)
# Run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=<output from above command>

# Server URLs (local to WSL)
BEE_URLS=http://localhost:1633,http://bee-node:1633
NEXT_PUBLIC_BEE_URL=http://localhost:3323

# For production with domain:
# NEXT_PUBLIC_BEE_URL=https://your-domain.com/bee
```

Continue:
```bash
# Install dependencies
npm install

# Build Next.js
npm run build

# Test locally
npm start
# Should see: "Ready on http://localhost:3000"

# In another terminal, test API
curl http://localhost:3000/api/profile
```

### Step 2.5: Set Up SystemD Service (Keep Running)

```bash
# Create service file
sudo nano /etc/systemd/system/devconnect-forum.service
```

Add:
```ini
[Unit]
Description=DevConnect Profile & Forum Server
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=YOUR_WSL_USERNAME
WorkingDirectory=/home/YOUR_WSL_USERNAME/devconnect-server-YYYYMMDD-HHMMSS
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Replace `YOUR_WSL_USERNAME` with your actual username, and update the `WorkingDirectory` path.

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable devconnect-forum
sudo systemctl start devconnect-forum
sudo systemctl status devconnect-forum

# View logs
sudo journalctl -u devconnect-forum -f
```

### Step 2.6: Configure Caddy (Optional - for HTTPS)

If you want to access the server from other devices with HTTPS:

```bash
sudo nano /etc/caddy/Caddyfile
```

Add:
```caddy
# For local network with self-signed cert
:443 {
    reverse_proxy localhost:3000

    handle /bee/* {
        uri strip_prefix /bee
        reverse_proxy localhost:3323
    }

    tls internal
}

# Or for public domain with Let's Encrypt
your-domain.com {
    reverse_proxy localhost:3000

    handle /bee/* {
        uri strip_prefix /bee
        reverse_proxy localhost:3323
    }
}
```

Restart Caddy:
```bash
sudo systemctl restart caddy
sudo systemctl enable caddy
sudo systemctl status caddy
```

---

## Phase 3: Test Server from Dev Laptop

### Step 3.1: Find Server Laptop's IP

On server laptop (WSL):
```bash
# Get Windows host IP (if accessing from same machine)
hostname -I

# Or from Windows (cmd/PowerShell)
ipconfig
# Look for IPv4 Address
```

### Step 3.2: Test from Dev Laptop

```bash
# Test API health (replace SERVER_IP)
curl http://SERVER_IP:3000/api/profile

# Test Bee Gateway
curl http://SERVER_IP:3323/health

# Test a full profile update (from browser on dev laptop)
# 1. Open http://SERVER_IP:3000 in browser
# 2. Connect wallet
# 3. Try updating profile
```

### Step 3.3: Verify Logs on Server

On server laptop:
```bash
# Next.js logs
sudo journalctl -u devconnect-forum -f

# Bee Gateway logs
docker logs -f bee-proxy

# Bee Node logs
docker logs -f bee-node
```

---

## Phase 4: Build Client for Swarm (From Dev Laptop)

### Step 4.1: Update Next.js Config for Static Export

Edit `next.config.js`:
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',  // Enable static HTML export
  images: {
    unoptimized: true,  // Required for static export
  },
  // Point API calls to your server
  env: {
    NEXT_PUBLIC_API_URL: 'http://SERVER_IP:3000', // Or https://your-domain.com
    NEXT_PUBLIC_BEE_URL: 'http://SERVER_IP:3323', // Or https://your-domain.com/bee
  },
  trailingSlash: true,  // Better for Swarm hosting
}

module.exports = nextConfig
```

### Step 4.2: Create Production .env for Client

Create `.env.production`:
```bash
# Point to your server laptop
NEXT_PUBLIC_API_URL=http://SERVER_IP:3000
NEXT_PUBLIC_BEE_URL=http://SERVER_IP:3323
NEXT_PUBLIC_POSTAGE_BATCH_ID=58a35141d74fedb10a6d4ebb9064b3f473ecd98df49be771cc6abed98a0ee756
```

### Step 4.3: Build Static Export

```bash
cd C:\Users\nabil\devconnect-profile-sandbox

# Build static export
npm run build

# This creates an 'out/' directory with:
# - HTML files for all pages
# - JavaScript bundles
# - CSS files
# - Images and assets
```

### Step 4.4: Upload to Swarm

**Option A: Using Bee Gateway**
```bash
# Compress the 'out' directory
tar -czf client-build.tar.gz out/

# Upload to Swarm via your gateway
curl -X POST \
  -H "swarm-postage-batch-id: YOUR_BATCH_ID" \
  -H "Content-Type: application/x-tar" \
  --data-binary @client-build.tar.gz \
  http://SERVER_IP:3323/bzz

# Note the returned reference hash
```

**Option B: Using bee-js CLI (if installed)**
```bash
npm install -g @ethersphere/bee-js

# Upload directory
bee-js upload --dir out --stamp YOUR_BATCH_ID --bee-url http://SERVER_IP:3323
```

**Option C: Using Swarm CLI**
```bash
# If you have swarm-cli installed
swarm-cli upload --dir out
```

### Step 4.5: Update ENS Content Hash

1. Go to [ENS App](https://app.ens.domains)
2. Connect wallet (must be owner of woco.eth)
3. Select `woco.eth`
4. Go to "Records" tab
5. Edit "Content" record
6. Set to: `bzz://<HASH_FROM_UPLOAD>`
7. Save transaction
8. Wait for confirmation (~15 mins for propagation)

### Step 4.6: Test Client on Swarm

```bash
# Test via eth.limo gateway
curl https://woco.eth.limo

# Or visit in browser:
# https://woco.eth.limo
```

---

## Phase 5: Security & Maintenance

### Security Checklist

- [ ] `.env.production.local` on server has strong SESSION_SECRET (not the dev one)
- [ ] FEED_PRIVATE_KEY is only on server, never in client build
- [ ] `.env.production.local` is not in git (.gitignore includes it)
- [ ] Firewall configured (if exposing to internet)
- [ ] HTTPS enabled via Caddy (if exposing to internet)
- [ ] Admin cookies are httpOnly, Secure, SameSite=Lax
- [ ] ADMIN_ADDRESSES contains only trusted moderators
- [ ] Backup of whitelist.json configured

### Maintenance Commands

**On Server Laptop:**

```bash
# Update Next.js application
cd ~/devconnect-server-*
git pull  # If you set up git remote
npm install
npm run build
sudo systemctl restart devconnect-forum

# View logs
sudo journalctl -u devconnect-forum -f
docker logs -f bee-proxy
docker logs -f bee-node

# Backup whitelist
docker cp bee-proxy:/data/whitelist.json ~/backups/whitelist-$(date +%Y%m%d).json

# Restart services
sudo systemctl restart devconnect-forum
docker-compose restart
sudo systemctl restart caddy
```

**On Dev Laptop:**

```bash
# Rebuild and upload client
npm run build
# Then upload 'out/' to Swarm and update ENS
```

---

## Troubleshooting

### Can't connect to server from dev laptop

1. Check server laptop firewall:
```bash
# On server
sudo ufw status
sudo ufw allow 3000/tcp
sudo ufw allow 3323/tcp
```

2. Check Windows Firewall on server laptop
3. Verify services are running:
```bash
sudo systemctl status devconnect-forum
docker ps
```

### API calls fail from Swarm client

1. Check NEXT_PUBLIC_API_URL in client build
2. Verify CORS is enabled on server
3. Check server logs for incoming requests

### Profile updates don't work

1. Check FEED_PRIVATE_KEY is set correctly on server
2. Verify Bee Gateway has the updated `/soc` endpoint
3. Check Docker logs for errors:
```bash
docker logs bee-proxy | grep SOC
```

### Client doesn't load from woco.eth.limo

1. Verify ENS content hash is correct
2. Wait longer (can take 15-30 mins for propagation)
3. Try direct hash: `https://gateway.ethswarm.org/bzz/<HASH>/`
4. Check upload was successful: `curl https://gateway.ethswarm.org/bzz/<HASH>/`

---

## Summary of Two-Laptop Flow

### Development (Dev Laptop):
1. Make code changes
2. Test locally with `npm run dev`
3. Commit to git

### Deployment (Server Laptop):
1. Run `prepare-server-package.bat` on dev laptop
2. Transfer package to server laptop
3. Deploy on server (one-time setup)
4. For updates: Copy new package and restart service

### Client Updates (Dev Laptop):
1. Build static export: `npm run build`
2. Upload `out/` to Swarm
3. Update ENS content hash
4. Wait for propagation

### Result:
- Server runs APIs with secrets safely
- Client runs on Swarm (decentralized, censorship-resistant)
- Updates require no downtime
- Dev laptop continues as development environment
