# Deployment Steps for Swarm Feed Website

## Step 1: Rebuild and Restart Bee-Proxy (Docker)

On your **SERVER laptop** (where bee-proxy Docker container runs):

```bash
# Navigate to bee-proxy directory
cd /path/to/bee_gateway/bee-slam/proxy

# Rebuild TypeScript
npm run build

# Restart Docker container
docker-compose restart
# OR if using docker run:
docker restart bee-proxy-container-name
# OR rebuild and restart:
docker-compose up -d --build
```

Verify it's running:
```bash
curl http://localhost:3000/health
```

## Step 2: Use the Correct Upload Script

On THIS laptop, your upload script needs to:
1. Upload the `/out` directory
2. **Create feed manifest** (this is what was broken before)
3. Update the feed
4. Give you the manifest reference for ENS

The script at [frontend/upload-to-swarm-feed.js](frontend/upload-to-swarm-feed.js) is currently the OLD version without manifest creation.

You need to replace it with the version that includes lines 73-94 for creating the feed manifest.

## Step 3: Run the Upload

```bash
cd frontend
node upload-to-swarm-feed.js
```

This should now work and give you:
- ✅ Directory uploaded
- ✅ Feed manifest created (one-time)
- ✅ Feed updated
- 🌐 Manifest URL for ENS: `https://gateway.woco-net.com/bzz/{manifestRef}/`

## Step 4: Set ENS Content Hash

Use the manifest reference from the output and set it in ENS:
```
bzz://{manifestRef}
```

---

## What I Fixed in Bee-Proxy

Added POST /feeds endpoint at [c:\Users\nabil\bee_gateway\bee-slam\proxy\src\index.ts:440-506](c:/Users/nabil/bee_gateway/bee-slam/proxy/src/index.ts#L440-L506):
- Forwards feed manifest creation requests to Bee node
- Auto-whitelists the manifest reference
- Returns manifest reference to client

Before this fix, the proxy returned 502 for POST /feeds requests.
