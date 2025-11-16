# Swarm Deployment Architecture - Complete Picture

## Overview

Your app has 3 layers:
1. **Client** (uploaded to Swarm)
2. **Server APIs** (running on your server laptop)
3. **Bee Gateway** (running on your server laptop, PUBLIC access)

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  USER'S BROWSER (anywhere in the world)                     │
│  Visits: https://woco.eth.limo                               │
└────────────┬─────────────────────────────────────────────────┘
             │
             │ 1. Fetch static files
             ▼
┌──────────────────────────────────────────────────────────────┐
│  ETHEREUM SWARM                                              │
│  - index.html, JavaScript bundles, CSS, images              │
│  - Accessed via ENS: woco.eth → content hash                │
│  - Gateway: eth.limo resolves ENS and serves from Swarm     │
└──────────────────────────────────────────────────────────────┘
             │
             │ 2. JavaScript runs in browser
             │
             ├──────────────────────────────────────────────────┐
             │                                                  │
             │ 3a. Read profile/posts                          │ 3b. Upload avatar
             ▼                                                  ▼
┌────────────────────────────────────┐  ┌────────────────────────────────────┐
│  YOUR SERVER: API (Port 3000)     │  │  YOUR SERVER: Bee Gateway (3323)   │
│  https://yourproject.com/api       │  │  https://gateway.yourproject.com   │
│  OR https://api-xxx.trycloudflare  │  │  OR https://bee-xxx.trycloudflare  │
│                                    │  │                                    │
│  - Server-only operations          │  │  - Public access for uploads       │
│  - Uses FEED_PRIVATE_KEY           │  │  - Whitelist protection            │
│  - Writes platform feeds           │  │  - Image serving                   │
│  - Session management              │  │  - User avatar uploads             │
└────────────┬───────────────────────┘  └────────────┬───────────────────────┘
             │                                        │
             │ Both use:                              │
             │                                        │
             ▼                                        ▼
┌──────────────────────────────────────────────────────────────┐
│  BEE NODE (Docker, Port 1633)                                │
│  - Local only (not exposed to internet)                      │
│  - Connected to Swarm network                                │
│  - Stores/retrieves data                                     │
└──────────────────────────────────────────────────────────────┘
```

---

## What Goes Where

### 1. Swarm (woco.eth.limo)
**Uploaded via `npm run build` + bee-js upload**

Files:
- `out/_next/**/*.js` - Next.js JavaScript bundles
- `out/_next/**/*.css` - Stylesheets
- `out/*.html` - Static HTML pages
- `out/favicon.ico`, images, etc.

**Must include:**
- `index.html` at root (Swarm website entry point)
- All assets with correct relative paths

**Upload command:**
```bash
# After building
npm run build

# Upload with manifest (creates index)
npx bee-js upload --dir out --stamp YOUR_BATCH_ID --index-document index.html

# Returns: Content hash (e.g., 363ea01b...)
# Update ENS: woco.eth → content hash
# Access via: https://woco.eth.limo
```

### 2. Server Laptop - API (Port 3000)
**Runs: `npm start` (Next.js production)**

Includes:
- `src/app/api/**` - All API routes
- `src/lib/forum/publisher.ts` - Platform signer operations
- `src/lib/profile/service.ts` - Profile reads/writes
- Server-only helpers

**Environment variables:**
```bash
# Server operations (uses FEED_PRIVATE_KEY)
FEED_PRIVATE_KEY=xxx
BEE_URLS=http://localhost:1633
POSTAGE_BATCH_ID=xxx

# Public URLs (for client to call)
NEXT_PUBLIC_BEE_URL=https://gateway.yourproject.com  # Your public gateway
NEXT_PUBLIC_API_URL=https://api.yourproject.com      # Your public API
```

**Needs:** Public domain/URL for external access

### 3. Server Laptop - Bee Gateway (Port 3323)
**Runs: Docker (bee-proxy)**

Purpose:
- **User uploads**: Avatars, images from browser
- **Image serving**: `/api/swarm/img/[ref]`
- **Whitelist protection**: Only approved content

**Must be PUBLIC** because:
- Users' browsers need to upload avatars
- JavaScript calls `NEXT_PUBLIC_BEE_URL` from their device
- Can't use `localhost` (only works on your server)

**Security:**
- Whitelist controls what can be read
- Rate limiting
- CORS configured

**Needs:** Public domain/URL for external access

### 4. Server Laptop - Bee Node (Port 1633)
**Runs: Docker (bee-node)**

Purpose:
- Connects to Swarm P2P network
- Stores/retrieves data
- **Private** - only API + Gateway talk to it

**NOT exposed to internet** - stays on localhost:1633

---

## Swarm Upload Process

Swarm websites need a **manifest** (index) to work properly.

### How Swarm Manifests Work

When you upload a directory:
```
out/
├── index.html
├── _next/
│   └── static/
│       ├── chunks/
│       │   └── main-abc123.js
│       └── css/
│           └── app-def456.css
└── favicon.ico
```

Bee creates a **manifest** (like a table of contents):
```json
{
  "/": "index.html",
  "/index.html": "<hash-of-index.html>",
  "/_next/static/chunks/main-abc123.js": "<hash-of-js>",
  "/_next/static/css/app-def456.css": "<hash-of-css>",
  "/favicon.ico": "<hash-of-icon>"
}
```

The **manifest hash** is what you put in ENS.

When someone visits `https://woco.eth.limo`:
1. ENS resolves `woco.eth` → manifest hash
2. Gateway fetches manifest from Swarm
3. Manifest says: "root path `/` serves `index.html`"
4. Gateway fetches `index.html` hash from manifest
5. Browser loads index.html
6. HTML references `/_next/static/chunks/main-abc123.js`
7. Gateway looks up that path in manifest
8. Serves the file

**This is why you need `--index-document index.html` flag.**

---

## Public Access Options

You need **two public URLs**:
1. API endpoint (port 3000)
2. Bee Gateway endpoint (port 3323)

### Option A: Cloudflare Tunnel (Easiest, Free, Recommended for MVP)

**Advantages:**
- Free
- No router configuration
- Automatic HTTPS
- Works behind any firewall
- Takes 5 minutes

**Steps:**
1. Install `cloudflared` on server laptop
2. Create two tunnels:
   - Tunnel 1: `localhost:3000` → `https://api-random123.trycloudflare.com`
   - Tunnel 2: `localhost:3323` → `https://bee-random456.trycloudflare.com`
3. Update `.env.production` on dev laptop:
   ```bash
   NEXT_PUBLIC_API_URL=https://api-random123.trycloudflare.com
   NEXT_PUBLIC_BEE_URL=https://bee-random456.trycloudflare.com
   ```
4. Rebuild client: `npm run build`
5. Upload to Swarm
6. Update ENS

**Disadvantages:**
- Random subdomain (can upgrade to custom later)
- Dependent on Cloudflare

### Option B: Your Own Domain + Port Forwarding

**Advantages:**
- Professional (your own domain)
- Full control
- Can use: `https://api.yourproject.com` and `https://gateway.yourproject.com`

**Steps:**
1. Buy domain: `yourproject.com` ($10/year)
2. Configure DNS:
   - `api.yourproject.com` → Your public IP
   - `gateway.yourproject.com` → Your public IP
3. Router port forwarding:
   - External `443` → Internal `SERVER-IP:3000` (API)
   - External `3323` → Internal `SERVER-IP:3323` (Gateway)
4. Install Caddy for HTTPS:
   ```
   api.yourproject.com {
       reverse_proxy localhost:3000
   }
   gateway.yourproject.com {
       reverse_proxy localhost:3323
   }
   ```
5. Update `.env.production`:
   ```bash
   NEXT_PUBLIC_API_URL=https://api.yourproject.com
   NEXT_PUBLIC_BEE_URL=https://gateway.yourproject.com
   ```

**Disadvantages:**
- Costs money ($10/year domain)
- Need to configure router
- Need to set up Caddy

---

## Recommended Deployment Order

### Phase 1: Move Bee to Server (Local WiFi) - TODAY
Follow: **MOVE_BEE_TO_SERVER.md**

1. Export Bee data from dev laptop
2. Import to server laptop
3. Start Bee + Gateway on server
4. Test locally: `http://SERVER-IP:3323/health`
5. Update server API `.env` to use `http://localhost:3323`

**Result:** Everything runs on server laptop, accessible on WiFi

### Phase 2: Set Up Public Access - TODAY/TOMORROW
Use **Cloudflare Tunnel** (quickest):

1. Install cloudflared on server
2. Create tunnels for port 3000 and 3323
3. Get public URLs

**Result:** API + Gateway accessible from internet

### Phase 3: Build and Upload Client - AFTER PHASE 2
On dev laptop:

1. Update `.env.production` with public URLs
2. Build: `npm run build`
3. Upload to Swarm with manifest:
   ```bash
   # Using bee-js CLI
   bee-js upload out --stamp BATCH_ID --index-document index.html --bee-url http://SERVER-IP:3323

   # Returns: swarm hash abc123...
   ```
4. Update ENS: `woco.eth` → content hash `abc123...`
5. Test: Visit `https://woco.eth.limo`

**Result:** Full decentralized app live!

---

## Testing the Full Flow

After deployment, test:

1. **Visit ENS URL:**
   ```
   https://woco.eth.limo
   ```

2. **Connect Wallet:**
   - JavaScript loads from Swarm ✅
   - Calls your API at `https://api-xxx.trycloudflare.com` ✅

3. **Update Profile:**
   - API uses FEED_PRIVATE_KEY (server-side) ✅
   - Writes name feed to Swarm via localhost:1633 ✅

4. **Upload Avatar:**
   - Browser calls `https://bee-xxx.trycloudflare.com/bzz` ✅
   - Gateway checks whitelist ✅
   - Uploads to Bee node ✅
   - Returns Swarm hash to browser ✅

5. **View Avatar:**
   - Browser requests `/api/swarm/img/[hash]` from API ✅
   - API fetches from Gateway ✅
   - Serves image ✅

---

## Security Considerations

### Gateway (Public)
- ✅ Whitelist protection (only approved refs)
- ✅ HTTPS via Cloudflare/Caddy
- ✅ Rate limiting (configure in proxy)
- ✅ CORS configured for browser access

### API (Public)
- ✅ HTTPS via Cloudflare/Caddy
- ✅ SESSION_SECRET strong (32+ bytes)
- ✅ FEED_PRIVATE_KEY never exposed to client
- ✅ Input validation on all routes

### Bee Node (Private)
- ✅ NOT exposed to internet
- ✅ Only API + Gateway can access
- ✅ Stays on localhost:1633

---

## Swarm Upload Commands Reference

### Using bee-js CLI (Recommended)

```bash
# Install
npm install -g @ethersphere/bee-js

# Upload directory with manifest
bee-js upload out --stamp YOUR_BATCH_ID --index-document index.html --bee-url http://SERVER-IP:3323

# Returns:
# Swarm hash: 363ea01b3145745632edc4b2ff74210adf2fde6fb36794f26e5c08f21831bae2
```

### Using swarm-cli (Alternative)

```bash
# Install
npm install -g @ethersphere/swarm-cli

# Upload
swarm-cli upload out --stamp YOUR_BATCH_ID --index-document index.html
```

### Manual Upload (curl)

```bash
# Tar the directory
cd out
tar -czf ../client.tar.gz .

# Upload with index
curl -X POST \
  -H "swarm-postage-batch-id: YOUR_BATCH_ID" \
  -H "swarm-index-document: index.html" \
  -H "Content-Type: application/x-tar" \
  -H "swarm-collection: true" \
  --data-binary @../client.tar.gz \
  http://SERVER-IP:3323/bzz

# Returns JSON with "reference" field
```

---

## ENS Configuration

### Update Content Hash

1. Go to: https://app.ens.domains/
2. Connect wallet (must own woco.eth)
3. Select `woco.eth`
4. Click "Records"
5. Edit "Content" record
6. Set to: `ipfs://SWARM_HASH` or `bzz://SWARM_HASH`
   - Example: `bzz://363ea01b3145745632edc4b2ff74210adf2fde6fb36794f26e5c08f21831bae2`
7. Save transaction
8. Wait ~15 minutes for propagation

### Test Access

```bash
# Direct hash access
curl https://363ea01b3145745632edc4b2ff74210adf2fde6fb36794f26e5c08f21831bae2.swarm.eth.limo/

# ENS access (after update)
curl https://woco.eth.limo/
```

Both should return your index.html.

---

## Troubleshooting

### Swarm Upload Fails
- Check postage batch is valid: `curl http://localhost:3323/stamps`
- Ensure Bee node is synced: `curl http://localhost:1633/readiness`

### ENS Doesn't Resolve
- Wait 15-30 minutes after updating
- Check content hash is correct (64-char hex)
- Try direct hash URL first

### Assets Don't Load
- Check paths in HTML are relative (not absolute)
- Ensure manifest includes all files
- Check browser console for 404s

### Users Can't Upload
- Verify `NEXT_PUBLIC_BEE_URL` is public URL (not localhost)
- Check CORS on gateway
- Check whitelist allows uploads

---

## Next Steps

**Right now, follow:** [MOVE_BEE_TO_SERVER.md](MOVE_BEE_TO_SERVER.md)

This gets Bee + Gateway running on your server laptop.

**After that's working,** I'll give you the 5 commands to set up Cloudflare Tunnel for public access.

**Then we'll build and upload to Swarm!**
