# What We're Moving to Server - Complete List

## Overview

We need to move 3 things from dev laptop to server laptop:

1. **Bee node data** (Docker volume)
2. **Proxy data** (Docker volume)
3. **Configuration files** (bee-slam folder)

---

## 1. Bee Node Data (bee-slam_bee-data volume)

**Contains:**
- `keys/` - Your Bee node identity (CRITICAL - unique to your node)
- `statestore/` - Postage batches you've purchased
- `localstore/` - Content you've uploaded to Swarm
- `password` - Encrypted with BEE_PASSWORD

**Size:** Usually 100-500 MB

**Backed up to:** `bee-data-backup.tar.gz`

**Why critical:**
- Without this, you lose your node identity
- You'd have to buy new postage batches
- You'd lose access to content you've uploaded

---

## 2. Proxy Data (bee-slam_proxy-data volume)

**Contains:**
- `whitelist.json` - Approved Swarm content hashes

**Example whitelist.json:**
```json
{
  "hashes": [
    "363ea01b3145745632edc4b2ff74210adf2fde6fb36794f26e5c08f21831bae2",
    "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd"
  ]
}
```

**Size:** Usually < 1 MB

**Backed up to:** `proxy-data-backup.tar.gz`

**Why needed:**
- Controls which content users can access
- Without it, all content requests would be blocked

---

## 3. Configuration Files (bee-slam folder)

**Directory structure:**
```
bee-slam/
├── docker-compose.yml    ← Bee configuration (swap-enable, ports, etc.)
├── .env                  ← BEE_PASSWORD
├── .env.example
├── proxy/
│   ├── src/
│   │   └── index.ts      ← Proxy code (whitelist logic, routing)
│   ├── dist/             ← Compiled JavaScript
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── README.md
└── other docs
```

**Key files:**

### docker-compose.yml
Contains ALL Bee node configuration:
```yaml
command: >
  start
  --api-addr=:1633
  --p2p-addr=:1634
  --verbosity=info
  --cors-allowed-origins=*
  --full-node=false
  --swap-enable=true              # ← Your swap config
  --blockchain-rpc-endpoint=https://rpc.gnosischain.com
  --mainnet=true
```

Also defines:
- Port mappings (1633, 1634, 3323)
- Volume names (bee-slam_bee-data, bee-slam_proxy-data)
- Network configuration
- Environment variables

### .env
Contains:
```bash
BEE_PASSWORD=Harvey02
```

This password encrypts your node's private key in the `keys/` folder.

### proxy/ folder
The custom gateway code with:
- Whitelist enforcement
- Image serving
- Access control
- Logging

**Size:** Usually 50-100 MB (includes node_modules)

---

## Summary Table

| Item | What It Contains | Size | Backed Up As | Why Critical |
|------|-----------------|------|--------------|--------------|
| Bee node data | Keys, postage, content | 100-500 MB | bee-data-backup.tar.gz | Lose this = lose node identity |
| Proxy data | whitelist.json | <1 MB | proxy-data-backup.tar.gz | Controls access to content |
| bee-slam folder | Config & code | 50-100 MB | (copy directly) | All Bee settings (swap-enable, etc.) |

---

## What Happens When We Move

### On Dev Laptop:
1. Stop Docker containers
2. Export volumes to .tar.gz files
3. Copy files to server

### On Server Laptop:
1. Copy bee-slam folder
2. Create new Docker volumes
3. Import .tar.gz files into volumes
4. Start Docker containers
5. **Same config, same data, same node identity!**

---

## Important Notes

### Your Node Identity
Your Bee node has a unique identity derived from the keys. When you move:
- ✅ Node identity stays the same
- ✅ Postage batches still valid
- ✅ Content still accessible
- ✅ P2P connections will reconnect to your node

### Your Whitelist
The proxy whitelist moves with you:
- ✅ Same approved hashes work
- ✅ Users can still access whitelisted content
- ✅ New content can be whitelisted on server

### Your Configuration
All Bee settings in docker-compose.yml move:
- ✅ `--swap-enable=true` preserved
- ✅ RPC endpoint preserved
- ✅ Port configuration preserved
- ✅ Everything works exactly the same

---

## Verification Checklist

After moving, verify:

**Bee Node Data:**
```bash
# Should show your keys
docker run --rm -v bee-slam_bee-data:/data alpine ls -la /data/keys
```

**Proxy Data:**
```bash
# Should show whitelist.json
docker run --rm -v bee-slam_proxy-data:/data alpine ls -la /data
```

**Configuration:**
```bash
# Should show swap-enable=true
cat ~/bee_gateway/bee-slam/docker-compose.yml | grep swap-enable
```

**Containers Running:**
```bash
docker ps
# Should show: bee-node and bee-proxy
```

**Bee Node Health:**
```bash
curl http://localhost:1633/health
# Should return: health status JSON
```

**Gateway Health:**
```bash
curl http://localhost:3323/health
# Should return: {"ok":true} or similar
```

---

## If Something Goes Wrong

### Backup Still Exists
All your original data is still in:
- `C:\Users\nabil\bee-data-backup.tar.gz` (on dev laptop)
- `C:\Users\nabil\proxy-data-backup.tar.gz` (on dev laptop)
- `C:\Users\nabil\bee_gateway\bee-slam` (on dev laptop)

You can always:
1. Go back to dev laptop
2. Re-import the backups
3. Start fresh

### Docker Volumes on Dev
The original Docker volumes on dev laptop are STILL THERE even after export:
```bash
docker volume ls
# Will still show: bee-slam_bee-data and bee-slam_proxy-data
```

**We only EXPORT, not DELETE.** Your dev laptop keeps working!

---

## After Moving - What Changes?

### On Dev Laptop:
- Bee node: **STOPPED** (you ran `docker-compose down`)
- You can restart anytime: `docker-compose up -d`
- Or leave stopped (server is now running Bee)

### On Server Laptop:
- Bee node: **RUNNING** (same identity, same data)
- Gateway: **RUNNING** (same whitelist)
- API: **RUNNING** (connects to local Bee)

### For Users:
- **Before:** Client calls `http://dev-laptop-ip:3323`
- **After:** Client calls `http://server-laptop-ip:3323` or `http://your-domain.com`
- Everything else works the same!

---

## Ready to Start?

You now understand EXACTLY what we're moving and why. The guide [SIMPLE_MOVE_BEE_TO_SERVER.md](SIMPLE_MOVE_BEE_TO_SERVER.md) is 100% correct and includes:

- ✅ Backing up bee-data volume (keys, postage, content)
- ✅ Backing up proxy-data volume (whitelist)
- ✅ Copying bee-slam folder (docker-compose.yml with swap-enable=true)
- ✅ Importing on server
- ✅ Verifying everything works

Start with **Part 1** when you're ready!
