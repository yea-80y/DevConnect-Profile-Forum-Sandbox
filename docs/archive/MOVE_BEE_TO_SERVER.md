# Moving Bee Node + Gateway to Server Laptop

## Prerequisites
- You're on **dev laptop** (where Bee currently runs)
- Server laptop is on same WiFi
- Both have WSL/Ubuntu installed
- Docker Desktop installed on server laptop

---

## Part 1: Find IP Addresses

### On Dev Laptop (Windows):
1. Open **Command Prompt** (cmd)
2. Run: `ipconfig`
3. Look for **"Wireless LAN adapter Wi-Fi"** or **"Ethernet adapter"**
4. Find the line: **IPv4 Address**
5. Write it down: `192.168.0.XXX` (this is your dev laptop IP)

### On Server Laptop (Windows):
1. Open **Command Prompt** (cmd)
2. Run: `ipconfig`
3. Find **IPv4 Address**
4. Write it down: `192.168.0.YYY` (this is your server laptop IP)

**Example:**
- Dev laptop: `192.168.0.123`
- Server laptop: `192.168.0.118` (you mentioned this earlier)

---

## Part 2: Export Bee Node Data from Dev Laptop

The Bee node stores important data in a Docker volume:
- **Keys**: Your node identity (can't lose this!)
- **Postage batches**: Prepaid stamps for uploads
- **Local data**: Any content stored

### On Dev Laptop (PowerShell or CMD):

```powershell
# Navigate to bee-slam directory
cd C:\Users\nabil\bee_gateway\bee-slam

# Check Bee is running
docker ps
# You should see: bee-node and bee-proxy

# Stop containers (don't worry, data is safe)
docker-compose down

# Export the Bee data volume to a tar file
docker run --rm -v bee-slam_bee-data:/data -v C:\Users\nabil:/backup alpine tar czf /backup/bee-data-backup.tar.gz -C /data .

# This creates: C:\Users\nabil\bee-data-backup.tar.gz (about 100-500 MB)
```

**What this does:**
- Stops Bee safely
- Creates a backup file of all Bee data
- Saves it to `C:\Users\nabil\bee-data-backup.tar.gz`

---

## Part 3: Copy Files to Server Laptop

You need to transfer:
1. `bee-data-backup.tar.gz` (Bee node data)
2. `bee-slam` folder (Docker configs)

### Option A: USB Drive (Easiest)
1. Plug USB into dev laptop
2. Copy these to USB:
   - `C:\Users\nabil\bee-data-backup.tar.gz`
   - `C:\Users\nabil\bee_gateway\bee-slam` (whole folder)
3. Plug USB into server laptop
4. Copy to server: `C:\Users\server-user\` (or your username)

### Option B: Network Share
1. On dev laptop, right-click `C:\Users\nabil` → Properties → Sharing → Share
2. On server laptop, open File Explorer
3. Go to: `\\DEV-LAPTOP-IP\nabil` (replace DEV-LAPTOP-IP)
4. Copy the files

### Option C: Python HTTP Server (What you used before)

**Dev laptop (WSL):**
```bash
cd /mnt/c/Users/nabil
python3 -m http.server 9000
```

**Server laptop (WSL):**
```bash
cd ~
curl -O http://DEV-LAPTOP-IP:9000/bee-data-backup.tar.gz
# Replace DEV-LAPTOP-IP with your dev laptop's actual IP (e.g., 192.168.0.123)

# Also get the bee-slam folder (we'll need to compress it first on dev)
```

**If using Option C, compress bee-slam first on dev laptop:**
```bash
# Dev laptop (WSL)
cd /mnt/c/Users/nabil/bee_gateway
tar -czf bee-slam.tar.gz bee-slam/
# Now it's available at http://DEV-LAPTOP-IP:9000/bee-slam.tar.gz
```

---

## Part 4: Set Up on Server Laptop

### On Server Laptop (WSL/Ubuntu):

```bash
# Navigate to home directory
cd ~

# If you used USB, copy files from Windows to WSL
# If you used curl, files are already here

# Create bee_gateway directory
mkdir -p bee_gateway
cd bee_gateway

# Extract bee-slam folder (if you compressed it)
tar -xzf ~/bee-slam.tar.gz
# OR if you copied directly, move it:
# cp -r /mnt/c/Users/server-user/bee-slam ~/bee_gateway/

# Verify
ls bee-slam/
# Should see: docker-compose.yml, proxy/, Dockerfile, etc.
```

---

## Part 5: Import Bee Data on Server

```bash
cd ~/bee_gateway/bee-slam

# Check Docker is running
docker ps
# If error, start Docker Desktop on Windows first

# Create the Bee data volume
docker volume create bee-slam_bee-data

# Import the backup
docker run --rm -v bee-slam_bee-data:/data -v ~/:/backup alpine tar xzf /backup/bee-data-backup.tar.gz -C /data

# Verify import worked
docker run --rm -v bee-slam_bee-data:/data alpine ls -la /data
# Should see folders: keys/, localstore/, statestore/, etc.
```

**What this does:**
- Creates empty volume for Bee
- Restores your backup into it
- Preserves all keys and postage batches

---

## Part 6: Update Gateway Config for LAN Access

We need to change the proxy to accept connections from other devices.

### On Server Laptop:

```bash
cd ~/bee_gateway/bee-slam/proxy

# Check current index.ts
grep "app.listen" src/index.ts
```

The file should have something like:
```typescript
app.listen(port, () => {
  console.log(`Proxy listening on port ${port}`)
})
```

We need to make sure it listens on all interfaces (0.0.0.0), not just localhost.

**If it doesn't specify host, that's fine - it defaults to 0.0.0.0.**

If it says `app.listen(port, 'localhost', ...)`, we need to change it to:
```typescript
app.listen(port, '0.0.0.0', () => {
  console.log(`Proxy listening on port ${port}`)
})
```

---

## Part 7: Start Bee + Gateway on Server

```bash
cd ~/bee_gateway/bee-slam

# Create .env file for Docker (if needed)
# Usually not required, but some setups need it
cat > .env << 'EOF'
BEE_PASSWORD=your-password-here
EOF

# Start everything
docker-compose up -d

# Check containers are running
docker ps
# Should see: bee-node and bee-proxy

# Check logs
docker logs bee-node --tail 50
docker logs bee-proxy --tail 50

# Wait 30 seconds for Bee to initialize, then test
sleep 30

# Test locally on server
curl http://localhost:3323/health
# Should return: {"ok":true} or similar

# Test Bee node
curl http://localhost:1633/health
# Should return health status
```

---

## Part 8: Update Server API .env

Now update your Next.js API to use the local Bee gateway.

```bash
cd ~/your-backend-directoryYYYYMMDD-HHMMSS
nano .env.production.local
```

Update these lines:
```bash
# Server uses localhost (gateway is on same machine)
BEE_URLS=http://localhost:1633,http://localhost:3323
NEXT_PUBLIC_BEE_URL=http://localhost:3323

# For external access, clients will use your server's LAN IP
# We'll update this after testing
```

Save and exit (Ctrl+X, Y, Enter)

**Restart the Next.js server:**
```bash
# Stop current server (Ctrl+C if running)
# Or if using systemd:
sudo systemctl restart devconnect-api

# Or start manually:
npm start
```

---

## Part 9: Test From Server Laptop

```bash
# Test API
curl http://localhost:3000/api/profile

# Test gateway
curl http://localhost:3323/health
```

Both should return successful responses.

---

## Part 10: Test From Dev Laptop (LAN Access)

Now test from your **dev laptop** to make sure the server is accessible over WiFi.

### On Dev Laptop (WSL or CMD):

```bash
# Replace SERVER-IP with your server's IP (e.g., 192.168.0.118)

# Test gateway
curl http://SERVER-IP:3323/health

# Test API
curl http://SERVER-IP:3000/api/profile
```

If these work, you're ready for external access!

---

## Part 11: External Access (Internet)

If you want to access from outside your home network (e.g., from your phone on mobile data):

### Option A: Port Forwarding (Permanent)
1. Log into your router (usually http://192.168.0.1 or http://192.168.1.1)
2. Find "Port Forwarding" or "Virtual Server" settings
3. Add rules:
   - External Port: 3000 → Internal IP: SERVER-IP, Internal Port: 3000
   - External Port: 3323 → Internal IP: SERVER-IP, Internal Port: 3323
4. Find your public IP: https://whatismyipaddress.com/
5. Access via: `http://YOUR-PUBLIC-IP:3000`

**Security Note:** This exposes your server to the internet. Make sure:
- Strong SESSION_SECRET
- Firewall rules configured
- HTTPS (using Caddy - we can set up later)

### Option B: Cloudflare Tunnel (Easier, More Secure)
Free service that creates secure tunnel without port forwarding:
1. Sign up: https://dash.cloudflare.com/
2. Install cloudflared on server
3. Create tunnel
4. Get public URL like: `https://your-app.your-domain.workers.dev`

I can guide you through this if you want external access.

---

## Part 12: Update Client Build (Later)

When you're ready to build the client for Swarm:

**On Dev Laptop**, update `.env.production`:
```bash
# Point to your server's IP (or public URL if you set up external access)
NEXT_PUBLIC_API_URL=http://SERVER-IP:3000
NEXT_PUBLIC_BEE_URL=http://SERVER-IP:3323
```

Then build:
```bash
npm run build
# Upload out/ to Swarm
```

---

## Summary Checklist

- [ ] Find both laptops' IP addresses
- [ ] Export Bee data from dev laptop
- [ ] Copy files to server laptop (USB/network/HTTP)
- [ ] Import Bee data on server
- [ ] Start Bee + Gateway on server
- [ ] Update server API .env
- [ ] Test locally on server
- [ ] Test from dev laptop over LAN
- [ ] (Optional) Set up external access
- [ ] (Later) Build and upload client

---

## Troubleshooting

**"Cannot connect" errors:**
- Check firewall: `sudo ufw allow 3000` and `sudo ufw allow 3323`
- Check Docker: `docker ps` should show containers running

**"Permission denied" errors:**
- Add user to docker group: `sudo usermod -aG docker $USER`
- Log out and back in

**Bee node won't start:**
- Check logs: `docker logs bee-node`
- May need to wait 1-2 minutes for initialization

**Gateway returns 404:**
- Check whitelist.json exists
- Check proxy logs: `docker logs bee-proxy`

---

## Need Help?

If you get stuck at any step, tell me:
1. Which step number you're on
2. What command you ran
3. What error you got (copy/paste exact message)

I'll help you through it!
