# Move Bee + Gateway to Server Laptop - Simple Guide

## What We're Doing

Moving everything from your dev laptop to server laptop so:
- Bee node runs on server
- Gateway runs on server
- API runs on server
- Everything accessible from internet (no Cloudflare needed)

**Your IPs:**
- Dev laptop: `192.168.0.118`
- Server laptop: `SERVER-IP`

---

## Part 1: Backup and Disable Bee on Dev Laptop

### On Dev Laptop (PowerShell):

```powershell
# Navigate to bee-slam
cd C:\Users\nabil\bee_gateway\bee-slam

# Stop Bee containers
docker-compose down

# Check containers stopped
docker ps
# Should show nothing for bee-node or bee-proxy

# PREVENT AUTO-RESTART: Remove containers entirely
docker rm bee-node bee-proxy
# This ensures they won't auto-start when Docker starts

# Verify containers are gone
docker ps -a | findstr bee
# Should show nothing (containers deleted)

# Export Bee node data volume (keys, postage batches, stored content)
docker run --rm -v bee-slam_bee-data:/data -v C:\Users\nabil:/backup alpine tar czf /backup/bee-data-backup.tar.gz -C /data .

# Export Proxy data volume (whitelist.json)
docker run --rm -v bee-slam_proxy-data:/data -v C:\Users\nabil:/backup alpine tar czf /backup/proxy-data-backup.tar.gz -C /data .

# Check files were created
dir C:\Users\nabil\*backup.tar.gz
# Should see: bee-data-backup.tar.gz and proxy-data-backup.tar.gz
```

**Additional Safety: Rename docker-compose.yml**
```powershell
# Rename docker-compose.yml so it can't be accidentally started
cd C:\Users\nabil\bee_gateway\bee-slam
ren docker-compose.yml docker-compose.yml.DISABLED

# Now if you accidentally run "docker-compose up" it will fail
```

**What this does:**
- Safely stops Bee and Proxy
- Creates backup of Bee node data (per Bee documentation):
  - `keys/` - Node identity & blockchain wallet (swarm.key = your xBZZ address)
  - `statestore/` - Node operational state
  - `stamperstore/` - Postage stamp batch metadata
  - `localstore/` - Locally pinned chunks
  - `password` - Encrypts the keys (uses BEE_PASSWORD from .env)
- Creates backup of Proxy data:
  - `whitelist.json` - Approved content hashes
- Saves to: `C:\Users\nabil\bee-data-backup.tar.gz` and `proxy-data-backup.tar.gz`

**IMPORTANT:** After moving, do NOT restart the same Bee node on dev laptop. Running the same node on two machines causes network conflicts!

**Files to copy to server:**
1. `C:\Users\nabil\bee-data-backup.tar.gz` (Bee node data)
2. `C:\Users\nabil\proxy-data-backup.tar.gz` (Proxy whitelist)
3. `C:\Users\nabil\bee_gateway\bee-slam` (whole folder - includes .env, docker-compose.yml with ALL Bee config)

### ⚠️ CRITICAL SAFETY RULES

**After this backup:**
1. ✅ Copy files to server laptop
2. ✅ Start Bee on server laptop
3. ❌ **DO NOT run `docker-compose up` on dev laptop again** (with this data)
4. ✅ Keep the backup files safe (in case server fails)

**Why?** Your Bee node has a unique identity derived from `keys/swarm.key`. If the same node runs on two machines:
- Network will see duplicate overlay addresses (confuses P2P network)
- Postage stamps could be double-spent
- Data corruption risk

**What about postage stamps?**
- Your stamps are tied to your blockchain wallet (in swarm.key)
- The `stamperstore/` folder has metadata about your batches
- When you move the node, stamps move with it
- You can check stamps on server with: `curl http://localhost:1633/stamps`

**What if I need to go back to dev laptop?**
- You can restore from backup
- But stop server first, then restore on dev
- Never run both simultaneously

---

## Part 2: Transfer to Server Laptop

### Option A: USB Drive (Easiest)

1. Plug USB into dev laptop
2. Copy these to USB:
   - `bee-backup.tar.gz`
   - `bee-slam` folder (entire folder)
3. Plug USB into server laptop
4. Copy to: `C:\Users\server-user\` (or your username on server)

### Option B: Network Share

**On dev laptop:**
1. Right-click `C:\Users\nabil` folder
2. Properties → Sharing → Share
3. Note the network path (like `\\LAPTOP-NAME\nabil`)

**On server laptop:**
1. Open File Explorer
2. Type in address bar: `\\192.168.0.118\nabil`
3. Enter credentials if asked
4. Copy `bee-backup.tar.gz` and `bee-slam` folder

### Option C: Python HTTP (What You've Used Before)

**Dev laptop (WSL):**
```bash
cd /mnt/c/Users/nabil
tar -czf bee-slam.tar.gz bee_gateway/bee-slam/
python3 -m http.server 9000
```

**Server laptop (WSL):**
```bash
cd ~
curl -O http://192.168.0.118:9000/bee-backup.tar.gz
curl -O http://192.168.0.118:9000/bee-slam.tar.gz
```

---

## Part 3: Set Up on Server Laptop

### On Server Laptop (WSL):

```bash
# Create directory structure
mkdir -p ~/bee_gateway
cd ~/bee_gateway

# If using USB or network share, copy from Windows
# Files should be at: /mnt/c/Users/server-user/bee-backup.tar.gz
# and: /mnt/c/Users/server-user/bee-slam/

# Copy from Windows to WSL
cp /mnt/c/Users/server-user/bee-backup.tar.gz ~/
cp -r /mnt/c/Users/server-user/bee-slam ~/bee_gateway/

# OR if you used curl, extract bee-slam
cd ~/bee_gateway
tar -xzf ~/bee-slam.tar.gz

# Check bee-slam is there
ls -la ~/bee_gateway/bee-slam/
# Should see: docker-compose.yml, .env, proxy/, etc.
```

---

## Part 4: Import Bee Data on Server

```bash
cd ~/bee_gateway/bee-slam

# Check Docker is running
docker ps
# If error, start Docker Desktop on Windows first

# Create Bee node data volume
docker volume create bee-slam_bee-data

# Import Bee node backup
docker run --rm -v bee-slam_bee-data:/data -v ~/:/backup alpine tar xzf /backup/bee-data-backup.tar.gz -C /data

# Verify Bee data imported
docker run --rm -v bee-slam_bee-data:/data alpine ls -la /data
# Should see: keys/, localstore/, statestore/, etc.

# Create Proxy data volume
docker volume create bee-slam_proxy-data

# Import Proxy backup (whitelist)
docker run --rm -v bee-slam_proxy-data:/data -v ~/:/backup alpine tar xzf /backup/proxy-data-backup.tar.gz -C /data

# Verify Proxy data imported
docker run --rm -v bee-slam_proxy-data:/data alpine ls -la /data
# Should see: whitelist.json
```

**What this does:**
- Creates Docker volumes for Bee node and Proxy
- Restores both backups
- Your keys, postage batches, and whitelist are now on server
- All Bee configuration (swap-enable=true, etc.) is in docker-compose.yml which you copied

---

## Part 5: Configure for Public Access

The `.env` file already has your Bee password. We need to make sure the gateway accepts external connections.

### Check Proxy Config:

```bash
cd ~/bee_gateway/bee-slam/proxy
cat src/index.ts | grep "app.listen"
```

Look for the listen line. It should be:
```typescript
app.listen(port, '0.0.0.0', () => {
```

The `'0.0.0.0'` means "accept connections from anywhere".

**If it says `'localhost'` or `'127.0.0.1'`, we need to change it.**

Let me check what's currently there:

```bash
# Show the actual line
grep -A 2 "app.listen" src/index.ts
```

Tell me what this shows and I'll help you fix it if needed.

---

## Part 6: Start Bee + Gateway on Server

```bash
cd ~/bee_gateway/bee-slam

# Start everything
docker-compose up -d

# Check containers running
docker ps
# Should see: bee-node and bee-proxy

# Check logs
docker logs bee-node --tail 50
docker logs bee-proxy --tail 50

# Wait 30 seconds for Bee to initialize
sleep 30

# Test locally
curl http://localhost:3323/health
curl http://localhost:1633/health
```

Both should return successful responses.

---

## Part 7: Test from WiFi Network

### On Server Laptop:

```bash
# Test with server's own IP
curl http://SERVER-IP:3323/health
curl http://SERVER-IP:1633/health
```

### On Dev Laptop:

```bash
# Test from dev laptop
curl http://SERVER-IP:3323/health
```

If this works, your server is accessible on your WiFi network! ✅

---

## Part 8: Configure Server API

Update your Next.js API to use the local Bee gateway.

```bash
cd ~/your-backend-directory*

# Edit .env
nano .env.production.local
```

Update:
```bash
# Server uses localhost (Bee is on same machine)
BEE_URLS=http://localhost:1633,http://localhost:3323

# For now, keep localhost for testing
NEXT_PUBLIC_BEE_URL=http://localhost:3323
```

**Restart API:**
```bash
npm start
```

**Test:**
```bash
curl http://localhost:3000/api/profile
```

---

## Part 9: Find Your Public IP

Your router has a **public IP** that anyone on the internet can reach.

### Find Your Public IP:

**Option A: Website**
1. On either laptop, visit: https://whatismyip.com/
2. Note the IP (e.g., `86.123.45.67`)

**Option B: Command**
```bash
curl ifconfig.me
```

**This is your public IP.** Write it down!

---

## Part 10: Configure Router Port Forwarding

This tells your router: "When someone connects to public IP on port 3323, forward to server laptop."

### Steps (Generic - Your Router May Vary):

1. **Find router admin page:**
   - Open browser: `http://192.168.0.1` (or `http://192.168.1.1`)
   - Login (usually on sticker on router, or ask ISP)

2. **Find Port Forwarding settings:**
   - Look for: "Port Forwarding", "Virtual Server", "NAT", or "Applications"
   - Different routers call it different things

3. **Add rules:**

   **Rule 1: Bee Gateway**
   - Service Name: `Bee Gateway`
   - External Port: `3323`
   - Internal IP: `SERVER-IP`
   - Internal Port: `3323`
   - Protocol: `TCP`
   - Enable: ✅

   **Rule 2: API**
   - Service Name: `DevConnect API`
   - External Port: `3000`
   - Internal IP: `SERVER-IP`
   - Internal Port: `3000`
   - Protocol: `TCP`
   - Enable: ✅

4. **Save settings**

5. **Test from outside:**
   - Use your phone on mobile data (not WiFi)
   - Visit: `http://YOUR-PUBLIC-IP:3323/health`
   - Should return: `{"ok":true}` or similar

**Common Router Brands:**
- **Virgin Media Hub**: Advanced Settings → Firewall → Port Forwarding
- **BT Hub**: Advanced Settings → Port Forwarding
- **Sky Router**: Advanced → Port Forwarding

---

## Part 11: Configure Firewall on Server

Make sure Windows Firewall allows incoming connections.

### On Server Laptop (PowerShell as Admin):

```powershell
# Allow port 3323 (Bee Gateway)
New-NetFirewallRule -DisplayName "Bee Gateway" -Direction Inbound -LocalPort 3323 -Protocol TCP -Action Allow

# Allow port 3000 (API)
New-NetFirewallRule -DisplayName "DevConnect API" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow

# Check rules created
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*Bee*" -or $_.DisplayName -like "*DevConnect*"}
```

---

## Part 12: Update Environment Variables for Public Access

Now update configs to use your public IP.

### On Server Laptop:

```bash
cd ~/your-backend-directory*
nano .env.production.local
```

Update:
```bash
# Public access - clients will use your public IP
NEXT_PUBLIC_BEE_URL=http://YOUR-PUBLIC-IP:3323
NEXT_PUBLIC_API_URL=http://YOUR-PUBLIC-IP:3000
```

Replace `YOUR-PUBLIC-IP` with your actual public IP from Part 9.

**Restart API:**
```bash
npm start
```

---

## Part 13: Test Public Access

### From Your Phone (Mobile Data - NOT WiFi):

1. Open browser
2. Visit: `http://YOUR-PUBLIC-IP:3323/health`
3. Should return: `{"ok":true}`

### From Any Computer Anywhere:

```bash
curl http://YOUR-PUBLIC-IP:3323/health
curl http://YOUR-PUBLIC-IP:3000/api/profile
```

If these work, you're **publicly accessible!** ✅

---

## Part 14: (Optional) Set Up Domain Name

Instead of `http://86.123.45.67:3323`, you can have:
- `https://gateway.yourproject.com`
- `https://api.yourproject.com`

### Steps:

1. **Buy domain:** (e.g., Namecheap, $10/year)
   - Example: `yourproject.com`

2. **Configure DNS:**
   - Create A record: `gateway.yourproject.com` → `YOUR-PUBLIC-IP`
   - Create A record: `api.yourproject.com` → `YOUR-PUBLIC-IP`

3. **Install Caddy on server for HTTPS:**

   ```bash
   # Install Caddy
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update
   sudo apt install caddy
   ```

4. **Configure Caddyfile:**

   ```bash
   sudo nano /etc/caddy/Caddyfile
   ```

   Add:
   ```
   gateway.yourproject.com {
       reverse_proxy localhost:3323
   }

   api.yourproject.com {
       reverse_proxy localhost:3000
   }
   ```

5. **Restart Caddy:**
   ```bash
   sudo systemctl restart caddy
   ```

6. **Update port forwarding:**
   - Add rule: External `443` (HTTPS) → Internal `SERVER-IP:443`

7. **Update .env:**
   ```bash
   NEXT_PUBLIC_BEE_URL=https://gateway.yourproject.com
   NEXT_PUBLIC_API_URL=https://api.yourproject.com
   ```

Now you have **professional HTTPS URLs!**

---

## Part 15: Build Client for Swarm

Once your public gateway/API are working, build the client.

### On Dev Laptop:

```bash
cd C:\Users\nabil\devconnect-profile-sandbox

# Create/update .env.production
# Use your public URLs
echo "NEXT_PUBLIC_BEE_URL=http://YOUR-PUBLIC-IP:3323" > .env.production
echo "NEXT_PUBLIC_API_URL=http://YOUR-PUBLIC-IP:3000" >> .env.production
echo "NEXT_PUBLIC_POSTAGE_BATCH_ID=YOUR_BATCH_ID" >> .env.production

# Build
npm run build

# Upload to Swarm (from WSL)
cd /mnt/c/Users/nabil/devconnect-profile-sandbox
npx @ethersphere/bee-js-cli upload --dir out --stamp YOUR_BATCH_ID --index-document index.html --bee-url http://SERVER-IP:3323

# This returns a Swarm hash, like:
# Swarm hash: 363ea01b3145745632edc4b2ff74210adf2fde6fb36794f26e5c08f21831bae2
```

---

## Part 16: Update ENS

1. Go to: https://app.ens.domains/
2. Connect wallet (must own woco.eth)
3. Select `woco.eth`
4. Click "Records" tab
5. Edit "Content" field
6. Set to: `bzz://YOUR-SWARM-HASH`
   - Example: `bzz://363ea01b3145745632edc4b2ff74210adf2fde6fb36794f26e5c08f21831bae2`
7. Save transaction
8. Wait 15-30 minutes

### Test:

```bash
# Visit in browser
https://woco.eth.limo
```

You should see your app! 🎉

---

## Summary Checklist

- [ ] Backup Bee data from dev laptop
- [ ] Copy files to server laptop
- [ ] Import Bee data on server
- [ ] Start Bee + Gateway on server
- [ ] Test on WiFi (SERVER-IP)
- [ ] Find public IP
- [ ] Configure router port forwarding
- [ ] Configure Windows firewall
- [ ] Test public access (from mobile data)
- [ ] (Optional) Set up domain + HTTPS
- [ ] Build client with public URLs
- [ ] Upload to Swarm
- [ ] Update ENS content hash
- [ ] Test woco.eth.limo

---

## Troubleshooting

### Can't access from internet

**Check:**
1. Port forwarding rules correct? (External 3323 → SERVER-IP:3323)
2. Server laptop IP hasn't changed? (Check `ipconfig` on server)
3. Windows firewall allows ports? (Run PowerShell commands from Part 11)
4. Docker containers running? (`docker ps` on server)

### Router config is confusing

Tell me your router model/ISP and I'll find specific instructions.

### Need to use Cloudflare instead

If router config is too hard, I can give you Cloudflare Tunnel commands (5 minutes to set up).

---

## Where Are You Now?

Let me know which part you're on and I'll walk you through step-by-step!

Start with **Part 1** (backup Bee data) when you're ready.
