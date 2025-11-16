# Server Deployment Guide

## Overview
This guide explains how to deploy the DevConnect Profile & Forum system with:
- **Server (Windows 10 laptop)**: Bee Gateway + Platform Signer + Admin/Mod APIs
- **Client (Swarm via woco.eth.limo)**: Static Next.js build hosted on Swarm

---

## Part 1: Server Environment Setup (Windows 10 Laptop)

### 1.1 Install Prerequisites

```bash
# In WSL/Ubuntu terminal:

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js LTS (v20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Docker (if not already installed)
sudo apt install -y docker.io
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER  # Logout/login after this

# Install Git
sudo apt install -y git

# Install Caddy (for HTTPS reverse proxy)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### 1.2 Clone and Set Up Bee Gateway

```bash
# Clone the bee gateway (if not already)
cd ~
git clone https://github.com/ethersphere/bee-slam.git
cd bee-slam

# Copy your updated proxy code
# (Manually copy from C:\Users\nabil\bee_gateway\bee-slam\proxy to ~/bee-slam/proxy)

# Start Bee Gateway
cd proxy
npm install
npm run build

cd ..
docker-compose up -d

# Verify it's running
docker ps
docker logs bee-proxy
```

### 1.3 Set Up Server Environment Variables

Create `.env.production.local` on the server (NOT in git):

```bash
# In your project root on the server
cd ~/devconnect-profile-sandbox

cat > .env.production.local << 'EOF'
# ==========================================
# SERVER-ONLY SECRETS (NEVER EXPOSE TO CLIENT)
# ==========================================

# Platform Signer Private Key (40-byte hex, with or without 0x)
FEED_PRIVATE_KEY=709e900683b5da55f1b0b57d93cd90634b4bb2cf16c31334b9eff171a7b30fbe

# Session Secret for Admin Cookie Signing (min 32 chars)
SESSION_SECRET=your-super-secret-random-string-min-32-chars-here-change-this

# Admin/Moderator Addresses (comma-separated, with 0x)
ADMIN_ADDRESSES=0xB49c8DDB7cC8168350E15CB90c899E63d2744d60,0x87b87644CC640C48C63E90eaFcbe235226Edd10B

# Bee Node URLs for Server-Side Operations (try in order)
BEE_URLS=http://localhost:1633,http://bee-node:1633

# Postage Batch ID for Server Writes
POSTAGE_BATCH_ID=58a35141d74fedb10a6d4ebb9064b3f473ecd98df49be771cc6abed98a0ee756

# ==========================================
# CLIENT-SAFE VARIABLES (exposed to browser)
# ==========================================

# Public Bee Gateway URL (accessible from internet)
NEXT_PUBLIC_BEE_URL=https://your-domain.com/bee

# Public Postage Batch (if clients need it for direct uploads)
NEXT_PUBLIC_POSTAGE_BATCH_ID=58a35141d74fedb10a6d4ebb9064b3f473ecd98df49be771cc6abed98a0ee756
EOF

# IMPORTANT: Generate a strong SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy the output and replace SESSION_SECRET above
```

---

## Part 2: Deploy Server Application

### 2.1 Build Next.js for Production

```bash
cd ~/devconnect-profile-sandbox

# Install dependencies
npm install

# Build for production (includes API routes)
npm run build

# Test locally
npm start
# Visit http://localhost:3000 to verify
```

### 2.2 Set Up Caddy Reverse Proxy

Create `/etc/caddy/Caddyfile`:

```bash
sudo nano /etc/caddy/Caddyfile
```

Add this configuration (replace `your-domain.com` with your actual domain or use IP):

```caddy
your-domain.com {
    # Main Next.js app
    reverse_proxy localhost:3000

    # Bee Gateway proxy
    handle /bee/* {
        uri strip_prefix /bee
        reverse_proxy localhost:3323
    }

    # Enable HTTPS automatically via Let's Encrypt
    tls {
        # For Let's Encrypt, ensure ports 80/443 are open
        # For self-signed in LAN: tls internal
    }

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

Start Caddy:

```bash
sudo systemctl restart caddy
sudo systemctl enable caddy
sudo systemctl status caddy
```

### 2.3 Set Up as SystemD Service (Optional but Recommended)

Create `/etc/systemd/system/devconnect-forum.service`:

```bash
sudo nano /etc/systemd/system/devconnect-forum.service
```

Add:

```ini
[Unit]
Description=DevConnect Profile & Forum Server
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/devconnect-profile-sandbox
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable devconnect-forum
sudo systemctl start devconnect-forum
sudo systemctl status devconnect-forum
```

---

## Part 3: Firewall Configuration

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow Bee Gateway (if accessed externally)
sudo ufw allow 3323/tcp

# Enable firewall
sudo ufw enable
sudo ufw status
```

---

## Part 4: Client Deployment to Swarm

### 4.1 Build Static Export

Modify `next.config.js` to enable static export:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',  // Enable static HTML export
  images: {
    unoptimized: true,  // Required for static export
  },
  // Point API calls to your server
  env: {
    NEXT_PUBLIC_API_URL: 'https://your-domain.com',
    NEXT_PUBLIC_BEE_URL: 'https://your-domain.com/bee',
  }
}

module.exports = nextConfig
```

Build and export:

```bash
npm run build
# This creates an 'out/' directory with static files
```

### 4.2 Upload to Swarm

```bash
# Install Swarm CLI or use your Bee node
# Upload the 'out' directory
bee-js upload --dir out --stamp YOUR_POSTAGE_BATCH

# Or use bee-tools
swarm-cli upload --dir out

# Note the hash (e.g., 0xabc123...)
```

### 4.3 Set Up ENS (woco.eth.limo)

1. Go to ENS App (app.ens.domains)
2. Set Content Hash for `woco.eth` to the Swarm hash from above
3. Wait for propagation
4. Access via: `https://woco.eth.limo`

---

## Part 5: Testing & Verification

### 5.1 Test API Endpoints

```bash
# From your moderator device:

# Test health
curl https://your-domain.com/api/health

# Test admin elevation (with your wallet signature)
curl -X POST https://your-domain.com/api/auth/admin/elevate \
  -H "Content-Type: application/json" \
  -d '{"address":"0xYourAddress","signature":"0x...","message":"..."}'

# Test moderator access
curl https://your-domain.com/api/auth/me \
  -H "Cookie: admin-session=..."
```

### 5.2 Test from Client

1. Visit `https://woco.eth.limo`
2. Connect wallet and login
3. Click "Moderator Sign-In" (if you're in ADMIN_ADDRESSES)
4. Try muting a post
5. Verify mute persists across devices

---

## Part 6: Security Checklist

- [ ] `.env.production.local` has strong SESSION_SECRET (32+ random chars)
- [ ] `.env.production.local` is NOT in git (.gitignore includes it)
- [ ] FEED_PRIVATE_KEY is never exposed to client
- [ ] HTTPS is enabled via Caddy
- [ ] Admin cookies are httpOnly, Secure, SameSite=Lax
- [ ] Firewall allows only necessary ports
- [ ] Bee Gateway proxy is running and accessible
- [ ] ADMIN_ADDRESSES contains only trusted moderators
- [ ] Server has automatic updates enabled
- [ ] Backups configured for whitelist.json and any persistent data

---

## Part 7: Maintenance

### View Logs

```bash
# Next.js app logs
sudo journalctl -u devconnect-forum -f

# Caddy logs
sudo journalctl -u caddy -f

# Bee Gateway logs
docker logs -f bee-proxy

# Bee Node logs
docker logs -f bee-node
```

### Update Deployment

```bash
cd ~/devconnect-profile-sandbox
git pull
npm install
npm run build
sudo systemctl restart devconnect-forum
```

### Backup Critical Data

```bash
# Backup whitelist
docker cp bee-proxy:/data/whitelist.json ~/backups/whitelist-$(date +%Y%m%d).json

# Backup .env
cp .env.production.local ~/backups/.env.production.local-$(date +%Y%m%d)
```

---

## Troubleshooting

### Can't access admin endpoints
- Check ADMIN_ADDRESSES includes your wallet (with 0x prefix)
- Verify SESSION_SECRET is set and hasn't changed
- Check cookies are being set (devtools > Application > Cookies)

### Bee Gateway not working
- Check Docker: `docker ps` shows bee-node and bee-proxy running
- Check logs: `docker logs bee-proxy`
- Verify whitelist: `curl http://localhost:3323/admin/whitelist`

### HTTPS not working
- Check Caddy: `sudo systemctl status caddy`
- Verify DNS points to your server IP
- Check firewall: `sudo ufw status`
- For Let's Encrypt, ports 80/443 must be publicly accessible

---

## File Structure Summary

```
SERVER (~/devconnect-profile-sandbox/):
├── .env.production.local         # SERVER SECRETS (not in git)
├── src/app/api/                  # All API routes (server-only)
├── src/lib/moderation/           # Server-only moderation helpers
├── next.config.js                # Server configuration
└── package.json

GATEWAY (~/bee-slam/):
├── docker-compose.yml
├── proxy/
│   ├── src/index.ts
│   └── dist/
└── data/
    └── whitelist.json

CLIENT (uploaded to Swarm):
├── out/                          # Static build (from 'npm run build')
    ├── _next/
    ├── index.html
    └── ...
```

---

**Next Steps:**
1. Follow Part 1 to set up the server environment
2. Deploy Bee Gateway (Part 1.2)
3. Configure secrets (Part 1.3)
4. Deploy server app (Part 2)
5. Test everything works from your laptop
6. Build and upload client to Swarm (Part 4)
7. Update woco.eth ENS to point to Swarm hash
