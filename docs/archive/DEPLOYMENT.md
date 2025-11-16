# Deployment Guide: Frontend (Swarm) + Backend (Server)

## Architecture Overview

```
┌─────────────────────────────────┐
│  SWARM NETWORK                   │
│  Frontend Static Files           │
│  - HTML, CSS, JavaScript        │
│  - React components compiled    │
│  - Public env vars baked in     │
└──────────────┬──────────────────┘
               │
               │ HTTPS API calls
               │ (CORS enabled)
               ↓
┌─────────────────────────────────┐
│  YOUR SERVER (SERVER-IP)    │
│  Backend (Next.js API routes)   │
│  + bee-proxy + bee-node         │
└─────────────────────────────────┘
```

## What Goes Where

### SWARM (Static Frontend)
**Built from**: `npm run build` → creates `out/` folder
**Contains**:
- All React components (compiled to HTML/CSS/JS)
- Client-side logic
- Public environment variables (NEXT_PUBLIC_*)

**Environment Variables Baked In**:
```env
NEXT_PUBLIC_BEE_URL=https://gateway.woco-net.com
NEXT_PUBLIC_POSTAGE_BATCH_ID=58a35141d74fedb10a6d4ebb9064b3f473ecd98df49be771cc6abed98a0ee756
NEXT_PUBLIC_API_URL=https://gateway.woco-net.com
```

### SERVER (Backend API)
**Location**: `~/woco-backend/` (to be created)
**Contains**:
- Next.js project with ONLY API routes
- Server-side environment variables
- Runs as Node.js process

**Environment Variables** (`.env` on server):
```env
BEE_URL=https://gateway.woco-net.com
BEE_URLS=http://SERVER-IP:1633,http://SERVER-IP:3323
POSTAGE_BATCH_ID=58a35141d74fedb10a6d4ebb9064b3f473ecd98df49be771cc6abed98a0ee756
FEED_PRIVATE_KEY=709e900683b5da55f1b0b57d93cd90634b4bb2cf16c31334b9eff171a7b30fbe
ADMIN_ADDRESSES=0xB49c8DDB7cC8168350E15CB90c899E63d2744d60,0x87b87644CC640C48C63E90eaFcbe235226Edd10B
SESSION_SECRET=change-me-to-a-long-random-string33
```

## Build Process

### 1. Build Static Frontend (for Swarm)
```bash
npm run build
# Creates: out/ directory with static files
```

### 2. What Gets Built
- `out/` folder contains:
  - `index.html` (and other page HTMLs)
  - `_next/static/` (JavaScript bundles)
  - `_next/static/css/` (Stylesheets)
  - All static assets

### 3. Upload to Swarm
```bash
# Using bee-js or swarm-cli
swarm-cli upload out/
# Returns: Swarm hash (e.g., abc123...)
```

## Deployment Steps

### Step 1: Build Frontend
```bash
npm run build
```

### Step 2: Upload to Swarm
```bash
# Upload the out/ directory to Swarm
# Save the returned hash
```

### Step 3: Deploy Backend to Server
```bash
# On server laptop:
cd ~
mkdir woco-backend
cd woco-backend

# Copy the entire project (excluding node_modules and .next)
# Then:
npm install
npm run build  # This builds the API routes

# Run the backend
npm start  # or use PM2 for production
```

### Step 4: Configure CORS
The backend API needs to allow requests from Swarm-hosted frontend.
This is done in the API routes (middleware).

### Step 5: Test
- Access frontend via Swarm gateway
- Verify it can call your server APIs
- Check forum posting works

## Environment Variable Strategy

### Development (npm run dev)
Uses `.env.local`:
- Frontend and backend run together
- All vars available

### Production Static Export (Swarm)
Uses `.env.production`:
- Only `NEXT_PUBLIC_*` vars included
- Frontend is standalone static files

### Production Backend (Server)
Uses `.env` on server:
- All non-public vars
- Secrets stay on server

## Important Notes

1. **NEXT_PUBLIC_* vars are PUBLIC** - Anyone can see them in browser
2. **Never put secrets in NEXT_PUBLIC_*** - They'll be in the JavaScript bundle
3. **The static build is deterministic** - Same code = same output every time
4. **CORS must be configured** - Frontend from Swarm needs to call your server

## Files Modified

- `next.config.ts` - Added `output: 'export'`
- `.env.production` - Production environment vars
- `src/config/api.ts` - API URL helper (NEW)

## Next Steps

1. ✅ Wait for build to complete
2. Check `out/` directory contents
3. Test locally by serving `out/` directory
4. Upload to Swarm
5. Deploy backend to server
6. Configure CORS
7. Test end-to-end
