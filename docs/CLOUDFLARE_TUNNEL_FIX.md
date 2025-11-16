# Cloudflare Tunnel Fix - Migration from Docker to Host

## Problem
Intermittent 502 Bad Gateway errors and timeouts when accessing the forum through `https://gateway.woco-net.com`. Issues included:
- Profile pictures not loading (timing out)
- Feed requests failing with 502 errors and CORS failures
- Streaming content hanging without completion
- Requests timing out after ~30 seconds

## Root Cause
Running Cloudflare Tunnel (`cloudflared`) inside a Docker container added an extra network layer that caused reliability issues:

```
Before (Problematic):
Internet → Cloudflare → cloudflared container → Docker bridge network → bee-proxy container
```

The Docker networking layer was causing:
- Connection tracking issues for long-lived streams
- Additional latency and timeouts
- Buffer size limitations for large transfers

## Solution
Migrated `cloudflared` from running in Docker to running directly on the host as a systemd service.

```
After (Fixed):
Internet → Cloudflare → cloudflared (host) → localhost:3323 → bee-proxy container
```

This eliminated one network hop and improved reliability significantly.

## Implementation Steps

### 1. Install cloudflared on Host
```bash
cd ~
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
cloudflared --version
```

### 2. Extract Tunnel Token from Docker Container
```bash
docker inspect cloudflare-tunnel --format '{{.Config.Cmd}}'
```

This revealed the tunnel token needed for the host configuration.

### 3. Stop the Docker Container
```bash
docker stop cloudflare-tunnel
docker rm cloudflare-tunnel
```

### 4. Update Cloudflare Dashboard Configuration
1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Networks → Tunnels**
3. Find your tunnel
4. Click **Configure** → **Public Hostname** tab
5. Edit your hostname
6. Changed service URL from Docker internal IP to `http://localhost:3323`
7. Saved configuration

**Why localhost:3323?**
The bee-proxy container exposes port 3000 internally, which is mapped to port 3323 on the host via:
```yaml
ports:
  - "3323:3000"
```

### 5. Create Systemd Service
Created `/etc/systemd/system/cloudflared.service`:
```ini
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
User=server-user
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --protocol http2 run --token YOUR_CLOUDFLARE_TUNNEL_TOKEN
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 6. Enable and Start the Service
```bash
sudo cp ~/cloudflared.service /etc/systemd/system/cloudflared.service
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
sudo systemctl status cloudflared
```

### 7. Clean Up
Removed unused ngrok container:
```bash
docker stop ngrok-tunnel
docker rm ngrok-tunnel
```

## Results
Performance improvements were immediate and dramatic:

**Before (Docker):**
- Profile pictures: Timeout (>30s, failed)
- Status: 502 Bad Gateway
- Success rate: ~30-40%

**After (Host):**
- Profile pictures: 0.2-0.3 seconds
- Status: 200 OK
- Success rate: 100%
- Data transferred: 48KB successfully

## Managing Cloudflare Tunnel

### Check Service Status
```bash
sudo systemctl status cloudflared
```

Expected output:
```
● cloudflared.service - Cloudflare Tunnel
     Loaded: loaded (/etc/systemd/system/cloudflared.service; enabled; preset: enabled)
     Active: active (running) since ...
```

### View Real-time Logs
```bash
sudo journalctl -u cloudflared -f
```

### View Recent Logs (last 50 lines)
```bash
sudo journalctl -u cloudflared -n 50
```

### Restart Service
```bash
sudo systemctl restart cloudflared
```

### Stop Service
```bash
sudo systemctl stop cloudflared
```

### Start Service
```bash
sudo systemctl start cloudflared
```

### Disable Auto-start on Boot
```bash
sudo systemctl disable cloudflared
```

### Enable Auto-start on Boot
```bash
sudo systemctl enable cloudflared
```

### Check if Service is Enabled
```bash
sudo systemctl is-enabled cloudflared
```

### Check if Service is Running
```bash
sudo systemctl is-active cloudflared
```

## Current Architecture

### Docker Containers
```bash
docker ps
```

**Running containers:**
1. **bee-node** - Swarm storage node (ethersphere/bee:stable)
   - Port 1634 exposed for P2P
   - Port 1633 internal API (not exposed to host)

2. **bee-proxy** - Rate limiting and whitelist proxy
   - Port 3323 exposed (maps to internal 3000)
   - Proxies requests to bee-node:1633

### System Services
- **cloudflared** - Cloudflare Tunnel running on host
  - Auto-starts with system
  - Proxies gateway.woco-net.com to localhost:3323

### Network Flow
```
Internet
  ↓
Cloudflare CDN
  ↓
cloudflared (systemd service on host)
  ↓
localhost:3323 (port mapping)
  ↓
bee-proxy container :3000
  ↓
bee-node container :1633
  ↓
Swarm Network
```

## Troubleshooting

### Cloudflared not starting
```bash
# Check logs for errors
sudo journalctl -u cloudflared -n 100

# Verify the service file
cat /etc/systemd/system/cloudflared.service

# Reload systemd and try again
sudo systemctl daemon-reload
sudo systemctl restart cloudflared
```

### 502 Errors Returning
```bash
# Check if cloudflared is running
sudo systemctl status cloudflared

# Check if bee-proxy is running
docker ps | grep bee-proxy

# Check bee-proxy logs
docker logs bee-proxy --tail 50

# Restart services
sudo systemctl restart cloudflared
docker restart bee-proxy
```

### Cloudflare Configuration Issues
If you need to update the tunnel configuration:
1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Networks → Tunnels → Configure
3. Ensure service URL is `http://localhost:3323`
4. Ensure `connectTimeout` is set appropriately (30s)

### Checking Connectivity
```bash
# Test bee-proxy from host
curl -s -o /dev/null -w "Status: %{http_code}\n" http://localhost:3323/health

# Test through Cloudflare
curl -s -o /dev/null -w "Status: %{http_code}\n" https://gateway.woco-net.com/health
```

## Important Notes

### Auto-start Behavior
- Cloudflared is configured to start automatically when WSL starts
- No manual intervention needed after reboot
- The service will automatically restart if it crashes (RestartSec=5)

### Token Security
The tunnel token in the systemd service file contains authentication credentials. Keep this file secure:
```bash
sudo chmod 600 /etc/systemd/system/cloudflared.service
```

### Updating Cloudflared
To update cloudflared to a newer version:
```bash
# Download latest version
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb

# Stop the service
sudo systemctl stop cloudflared

# Install update
sudo dpkg -i cloudflared.deb

# Start the service
sudo systemctl start cloudflared

# Verify
cloudflared --version
sudo systemctl status cloudflared
```

### WSL-Specific Notes
Since this is running in WSL (Windows Subsystem for Linux):
- WSL must be running for the tunnel to work
- Cloudflared will start when WSL starts
- If you shut down WSL, the tunnel will stop

## Files Modified/Created

### Created Files
- `/etc/systemd/system/cloudflared.service` - Systemd service configuration
- `~/cloudflared.deb` - Installation package (can be deleted)
- `~/cloudflared.service` - Temporary service file (can be deleted)

### Modified Configuration
- Cloudflare Zero Trust Dashboard tunnel configuration
- Updated ingress rule from Docker IP to localhost

### Removed
- `cloudflare-tunnel` Docker container
- `ngrok-tunnel` Docker container

## Verification Checklist

After completing the migration, verify:

- [ ] Cloudflared service is running: `sudo systemctl status cloudflared`
- [ ] Service is enabled for auto-start: `sudo systemctl is-enabled cloudflared`
- [ ] Gateway health check passes: `curl https://gateway.woco-net.com/health`
- [ ] Profile pictures load successfully
- [ ] No 502 errors when browsing forum
- [ ] Old Docker containers removed: `docker ps` (should only show bee-node and bee-proxy)
- [ ] Forum accessible at https://gateway.woco-net.com

## Credits
Special thanks to the friend who suggested that running Cloudflare in Docker could be causing these issues - they were absolutely correct!

## Date
Fixed: October 30, 2025
