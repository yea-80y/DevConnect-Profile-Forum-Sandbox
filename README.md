# DevConnect Profile + Forum Sandbox

A proof-of-concept app demonstrating **Swarm-hosted user profiles** and a **decentralised message board**.
It shows how to use Swarm (Bee), Swarm Feeds, and EIP-712/EIP-191 signatures to create user-owned identities
and cryptographically verified posts.

> **Project status:** pre-launch / work-in-progress. Deployment instructions and URLs will be added once live.

---

## Quick Start

### 1) Install

```bash
git clone https://github.com/yea-80y/DevConnect-Profile-Forum-Sandbox.git
cd DevConnect-Profile-Forum-Sandbox
npm install
2) Configure environment
Create a .env.local in the project root:

ini
Copy code
# Bee / Swarm
BEE_URL=http://localhost:1633             # Server-side Bee URL
NEXT_PUBLIC_BEE_URL=http://localhost:1633 # Client-side Bee URL (exposed to the browser)

# Postage / Feeds (server)
POSTAGE_BATCH_ID=YOUR_POSTAGE_BATCH_ID    # Required for uploads/feed writes
FEED_PRIVATE_KEY=0xabc123...              # Platform feed signer (hex private key)

# Optional / nice-to-have
ENS_DOMAIN=your-site.eth.limo             # Only used for display / future deploy docs
NODE_ENV=development
What these do:

BEE_URL — where the server API writes/reads (your Bee node or trusted gateway).

NEXT_PUBLIC_BEE_URL — what the browser uses for GETs (profiles, posts, avatars).

POSTAGE_BATCH_ID — a valid postage stamp batch for writing bytes/feeds.

FEED_PRIVATE_KEY — the platform signer that publishes deterministic feeds.

ENS_DOMAIN — optional; add when you’ve pointed ENS to a Swarm hash.

Keep .env.local out of version control.

3) Run
bash
Copy code
npm run dev
# open http://localhost:3000
Project Structure
graphql
Copy code
src/
├─ app/
│  ├─ api/                 # Server API routes (profile, forum, moderation)
│  ├─ dashboard/           # Home/Dashboard
│  ├─ forum/               # Board + Thread pages
│  └─ profile/             # Profile UI (edit/view)
├─ components/             # Reusable UI (Composer, PostItem, etc.)
├─ lib/
│  ├─ auth/                # EIP-712/EIP-191 login + posting identity
│  ├─ forum/               # topics, publisher, pack, client helpers
│  └─ profile/             # context, service, storage, swarm helpers
└─ config/                 # centralised config (e.g., Bee URLs)
docs/
├─ System-Components.pdf
└─ Forum-Architecture.pdf
How it works (high level)
Reads (GET): the browser fetches directly from Bee (/feeds, /bytes, /bzz) to display
profiles, posts, avatars — no database involved.

Writes (POST): the server API (with the platform signer + postage batch) uploads immutable
JSON blobs and advances Swarm feeds (board indexes, threads, profile feeds).

Login / Auth: Web3 users sign an EIP-712 capability; posts are signed with EIP-191.
The client verifies before sending, and the server re-verifies before publishing.

Local Development Notes
You’ll need a reachable Bee node or gateway and a valid postage batch.

For moderation and posting, the server must have FEED_PRIVATE_KEY and POSTAGE_BATCH_ID.

Client fetches rely on NEXT_PUBLIC_BEE_URL. If you swap to a public gateway later, update it here.

Docs
System Components – overall architecture and deployment shape:
docs/System-Components.pdf

Forum Architecture & Flows – login, profiles, posting, replies:
docs/Forum-Architecture.pdf

Roadmap (short)
 Public deployment docs (Bee/gateway, postage management, CORS)

 Optional: user-provided postage batch flow

 Production hardening (rate limits, input caps, anti-spam)
