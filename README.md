# DevConnect Profile + Forum Sandbox

A decentralized forum and profile application built on Ethereum and Swarm.

Demonstrates **Swarm-hosted user profiles** and a **decentralized message board** using Swarm (Bee), Swarm Feeds, and EIP-712/EIP-191 signatures for user-owned identities and cryptographically verified posts.

> **Status:** Live deployment at [gateway.woco-net.com](https://gateway.woco-net.com/bzz/9ebcea7ca2d4a3a975d1724ee579856684dc6f2ffa3082b64317006c922f3100/)

---

## Project Structure

This repository contains both frontend and backend:

```text
devconnect-profile-sandbox/
├── frontend/          # Next.js static export → deployed to Swarm
├── backend/           # Next.js API routes → runs on server
└── src/              # Legacy (will be removed)
```

### Frontend (Decentralized Static Site)

**Location:** `frontend/`

Static Next.js application deployed to Swarm for decentralized hosting.

**Tech Stack:**

- Next.js 15 with static export
- React 19
- Ethers.js for wallet integration
- Swarm (bee-js) for decentralized storage
- EIP-712 for authentication

**Development:**

```bash
cd frontend
npm install
npm run dev
# Opens at http://localhost:3000
```

**Build & Deploy to Swarm:**

```bash
cd frontend

# Build (with batch ID override if needed)
NEXT_PUBLIC_POSTAGE_BATCH_ID=<your-batch-id> npm run build

# Upload to Swarm
node upload-manual-collection.js

# For ENS deployment (no basePath)
npm run build:ens
npm run upload:ens
```

### Backend (API Server)

**Location:** `backend/`

Next.js API routes for forum, profiles, moderation, and Swarm interactions.

**Features:**

- Forum API (threads, posts, boards)
- User authentication & profiles
- Moderation (mute/unmute)
- Avatar/image proxy
- EIP-712 signature verification

**Development:**

```bash
cd backend
npm install
npm run dev
# API runs at http://localhost:3000/api
```

**Deployment:**
See `backend/DEPLOY_ON_SERVER.md` for server deployment instructions.

## Quick Start

### 1) Clone Repository

```bash
git clone https://github.com/yea-80y/DevConnect-Profile-Forum-Sandbox.git
cd DevConnect-Profile-Forum-Sandbox
```

### 2) Setup Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local  # Create and edit with your values
npm run dev
```

### 3) Setup Backend

```bash
cd backend
npm install
cp .env.production.local.TEMPLATE .env.production.local  # Edit with your values
npm run dev
```

---

## How It Works

- **Frontend (Static):** Browser fetches directly from Swarm (`/feeds`, `/bytes`, `/bzz`) to display profiles, posts, and avatars
- **Backend (API):** Server uploads immutable JSON blobs and updates Swarm feeds with platform signer and postage batch
- **Authentication:** Web3 users sign EIP-712 capabilities; posts are signed with EIP-191 and verified before publishing

---

## Deployment Workflow

### This Laptop (Master Development)

1. Make changes to frontend or backend
2. Test locally
3. Commit and push to GitHub

### Frontend Deployment

```bash
cd frontend
NEXT_PUBLIC_POSTAGE_BATCH_ID=<batch-id> npm run build
node upload-manual-collection.js
```

### Backend Deployment

```bash
# On server laptop (SERVER-IP)
ssh server-user@SERVER-IP
cd ~/your-backend-directory
git pull
npm install
pm2 restart devconnect-api
```

---

## Common Issues

### Old Batch ID in Builds

If builds show old batch ID, check Windows environment variables:

1. Windows Key + R → `sysdm.cpl`
2. Advanced → Environment Variables
3. Look for `NEXT_PUBLIC_POSTAGE_BATCH_ID`
4. Delete or update it

**Workaround:** Build with inline override:

```bash
NEXT_PUBLIC_POSTAGE_BATCH_ID=<new-batch-id> npm run build
```

### ENS Deployment Issues

Currently, Next.js has CSP compatibility issues with eth.limo gateways. The site loads but gets stuck in loading loops due to strict Content Security Policy blocking Next.js's eval usage.

---

## Links

- **Live Site:** [gateway.woco-net.com](https://gateway.woco-net.com/bzz/9ebcea7ca2d4a3a975d1724ee579856684dc6f2ffa3082b64317006c922f3100/)
- **API:** <https://api.woco-net.com>
- **Gateway:** <https://gateway.woco-net.com>

---

## License

MIT © 2025
