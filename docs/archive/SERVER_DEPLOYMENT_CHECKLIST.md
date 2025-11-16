# Server-Only Files Checklist

## ⚠️ CRITICAL: These files MUST remain on the server (use secrets)

### 1. API Routes (all use FEED_PRIVATE_KEY or SESSION_SECRET)
Located in `src/app/api/`:

- ✅ `auth/admin/elevate/route.ts` - Uses SESSION_SECRET, ADMIN_ADDRESSES
- ✅ `auth/logout/route.ts` - Uses SESSION_SECRET
- ✅ `auth/me/route.ts` - Uses SESSION_SECRET, ADMIN_ADDRESSES
- ✅ `moderation/mute/route.ts` - Uses FEED_PRIVATE_KEY
- ✅ `moderation/unmute/route.ts` - Uses FEED_PRIVATE_KEY
- ✅ `moderation/muted/route.ts` - Reads moderation data
- ✅ `profile/route.ts` - Uses FEED_PRIVATE_KEY (platform signer)
- ✅ `forum/board/route.ts` - Uses FEED_PRIVATE_KEY + publisher
- ✅ `forum/thread/route.ts` - Uses FEED_PRIVATE_KEY + publisher
- ✅ `forum/post/route.ts` - Imports from publisher

### 2. Server-Only Helper Modules
These are imported by API routes and MUST stay on server:

#### 📦 `src/lib/forum/publisher.ts` - **CRITICAL**
**Why**: Uses `FEED_PRIVATE_KEY` to sign and publish feed updates

**Functions:**
- `updateBoardFeed(boardTopicHex, threadRootRefHex)` - Adds thread to board index
- `updateThreadFeed(threadTopicHex, postRefHex)` - Adds post to thread index
- `publishNewThread(identifierWord, threadRootRefHex)` - bchan-style thread
- `publishPostToThread(identifierWord, threadRootRefHex, postRefHex)` - bchan-style post

**Internal utilities:**
- `pack4096(refs[])` - Packs up to 128 refs into 4KB page (newest first)
- `decode4096_toOldestFirst(page)` - Decodes 4KB page back to refs array
- `readOldestFirstByTopic(topic)` - Reads existing feed before update
- `publishPage(topic, page)` - Signs and uploads feed page with platform key

**Used by:**
- `src/app/api/forum/board/route.ts`
- `src/app/api/forum/thread/route.ts`
- `src/app/api/forum/post/route.ts`

#### 📦 `src/lib/moderation/store-swarm.ts`
**Why**: Uses `FEED_PRIVATE_KEY` to write moderation data

**Functions:**
- Writes muted user lists to platform-signed feeds
- Updates moderation state on Swarm

**Used by:**
- `src/app/api/moderation/mute/route.ts`
- `src/app/api/moderation/unmute/route.ts`

#### 📦 `src/config/swarm.ts`
**Why**: Exports ALL server secrets

**Exports:**
- `BEE_URL` - Server-side Bee endpoints
- `POSTAGE_BATCH_ID` - Server write batch
- `FEED_PRIVATE_KEY` - Platform signer private key (NEVER expose!)
- `normalizePk(pk)` - Ensures key is 0x-prefixed 64-char hex
- `assertFeedSignerConfigured()` - Startup validation

**Used by:**
- ALL API routes
- `lib/forum/publisher.ts`
- `lib/moderation/store-swarm.ts`

### 3. Bee Gateway Components
Located in `~/bee_gateway/bee-slam/`:

- ✅ `docker-compose.yml` - Bee node + proxy orchestration
- ✅ `proxy/src/index.ts` - Express proxy with:
  - Whitelist management
  - SOC endpoint with auto-whitelisting
  - Body parsing for binary uploads
  - Query string forwarding for signatures
- ✅ `data/whitelist.json` - Allowed content hashes

---

## ✅ Safe for Client Deployment (Swarm/CDN)

These files don't use secrets and can be in the static build:

### Client-Only Files:
- `src/app/**/*.tsx` (page components)
- `src/components/**/*.tsx` (UI components)
- `src/lib/profile/` (client-side profile readers)
- `src/lib/forum/` (client-side readers, NOT publisher.ts!)
- `public/` (static assets)
- `src/styles/` (CSS)

### Client-Safe Utilities:
- Topic generation utilities (read-only)
- Feed readers that don't sign
- UI state management
- Client-side form validation

---

## 🔒 Security Rules

### NEVER put these in client code:
❌ `FEED_PRIVATE_KEY` - Platform signer key
❌ `SESSION_SECRET` - Cookie signing secret
❌ `ADMIN_ADDRESSES` - Moderator allowlist (server validates this)
❌ Any imports from `config/swarm.ts` (server-only)
❌ Any imports from `lib/forum/publisher.ts` (uses private key)
❌ Any imports from `lib/moderation/store-swarm.ts` (uses private key)

### Safe for NEXT_PUBLIC_ (client env vars):
✅ `NEXT_PUBLIC_BEE_URL` - Public gateway URL (read-only)
✅ `NEXT_PUBLIC_POSTAGE_BATCH_ID` - If clients do direct uploads (optional)

### API Call Pattern (Client → Server):
```
Client (Swarm)                    Server (Laptop)
     |                                   |
     | POST /api/forum/thread            |
     |   body: { title, content }        |
     |   cookies: [user session]         |
     |---------------------------------->|
     |                                   |
     |                    1. Verify user auth
     |                    2. Import publisher.ts
     |                    3. Sign with FEED_PRIVATE_KEY
     |                    4. Upload to Bee via gateway
     |                    5. Update board feed index
     |                                   |
     |       { ok: true, ref: "0x..." }  |
     |<----------------------------------|
```

---

## 📋 Deployment Steps Summary

1. **On Server (Windows 10 laptop in WSL):**
   ```bash
   # Clone full repo
   git clone <your-repo> ~/devconnect-profile-sandbox

   # Install dependencies
   cd ~/devconnect-profile-sandbox
   npm install

   # Create .env.production.local with ALL secrets
   nano .env.production.local
   # (add FEED_PRIVATE_KEY, SESSION_SECRET, ADMIN_ADDRESSES, etc.)

   # Build Next.js (includes ALL API routes + server helpers)
   npm run build

   # Run server
   npm start  # or use systemd service
   ```

2. **Deploy Bee Gateway:**
   ```bash
   cd ~/bee_gateway/bee-slam
   docker-compose up -d
   ```

3. **For Client (Swarm):**
   - Build static export: `next build && next export`
   - Upload `out/` directory to Swarm
   - Configure API calls to point to your server domain
   - Update ENS to Swarm hash

---

## ⚙️ Configuration

### Server .env.production.local
```bash
# SECRETS (never expose)
FEED_PRIVATE_KEY=your-64-char-hex-key
SESSION_SECRET=your-32-char-random-string
ADMIN_ADDRESSES=0xAddress1,0xAddress2

# Server endpoints
BEE_URLS=http://localhost:1633,http://bee-node:1633
POSTAGE_BATCH_ID=your-batch-id

# Public (exposed to browser)
NEXT_PUBLIC_BEE_URL=https://your-domain.com/bee
NEXT_PUBLIC_API_URL=https://your-domain.com
```

### Client Build (for Swarm)
In `next.config.js`:
```javascript
module.exports = {
  output: 'export',  // Static export
  env: {
    NEXT_PUBLIC_API_URL: 'https://your-server-domain.com',
    NEXT_PUBLIC_BEE_URL: 'https://your-server-domain.com/bee'
  }
}
```

---

## 🧪 Testing Checklist

Before going live, test these flows:

### From Server (localhost):
- [ ] API routes respond: `curl http://localhost:3000/api/profile`
- [ ] Admin elevation works: Test `/api/auth/admin/elevate`
- [ ] Forum post creation: Test `/api/forum/thread`
- [ ] Moderation mute: Test `/api/moderation/mute`
- [ ] Bee Gateway running: `curl http://localhost:3323/health`

### From Remote Device (your laptop/phone):
- [ ] Can access server: `https://your-domain.com`
- [ ] Can login with wallet
- [ ] Can create forum post (calls server API)
- [ ] Moderator can elevate (if in ADMIN_ADDRESSES)
- [ ] Moderator can mute posts
- [ ] Muted posts hidden across all devices

### From Swarm (woco.eth.limo):
- [ ] Static site loads: `https://woco.eth.limo`
- [ ] API calls go to server (check network tab)
- [ ] Forum reads work (Bee Gateway)
- [ ] Forum writes work (server API)
- [ ] Cookies persist for admin session

---

## 🚨 Common Mistakes to Avoid

❌ **DON'T** put `publisher.ts` or `store-swarm.ts` in client bundle
❌ **DON'T** import from `config/swarm.ts` in client code
❌ **DON'T** expose `FEED_PRIVATE_KEY` via `NEXT_PUBLIC_*`
❌ **DON'T** forget to set `SESSION_SECRET` (use strong random string)
❌ **DON'T** allow CORS from `*` - whitelist your domain only
❌ **DON'T** skip HTTPS in production (cookies won't work)

✅ **DO** keep all API routes on server
✅ **DO** use httpOnly, Secure cookies for admin session
✅ **DO** verify ADMIN_ADDRESSES on server, never trust client
✅ **DO** use Caddy/Nginx reverse proxy for HTTPS
✅ **DO** backup whitelist.json and .env regularly
