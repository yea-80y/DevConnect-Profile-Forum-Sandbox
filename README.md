# DevConnect Profile + Forum Sandbox

A proof-of-concept application demonstrating **Swarm-hosted user profiles** and a **decentralised message board**.

It shows how to use [Swarm](https://docs.ethswarm.org/) (Bee), Swarm Feeds, and EIP-712/EIP-191 signatures to create user-owned identities and cryptographically verified posts — all without a traditional backend database.

> **Status:** Work-in-progress / pre-launch. Deployment details and live URLs will be added once available.

---

## 🚀 Quick Start

### 1. Clone and install

```bash
git clone https://github.com/yea-80y/DevConnect-Profile-Forum-Sandbox.git
cd DevConnect-Profile-Forum-Sandbox
npm install
2. Create a local environment file
Create a file named .env.local in the project root with the following variables:

env
Copy code
# Bee / Swarm node configuration
BEE_URL=http://localhost:1633              # Server-side Bee URL
NEXT_PUBLIC_BEE_URL=http://localhost:1633  # Client-side Bee URL (exposed to the browser)

# Postage and feeds (server-side)
POSTAGE_BATCH_ID=your_postage_batch_id     # Required for uploads/feed writes
FEED_PRIVATE_KEY=0xabc123...               # Platform feed signer (hex private key)

# Optional values
ENS_DOMAIN=your-site.eth.limo              # Optional: ENS domain (for future deployment)
NODE_ENV=development
Explanation of required values:

BEE_URL – URL of your Bee node or trusted gateway used by the server.

NEXT_PUBLIC_BEE_URL – Bee URL exposed to the browser for GET requests.

POSTAGE_BATCH_ID – A valid postage stamp batch for uploads and feed writes.

FEED_PRIVATE_KEY – Private key of the platform signer account (signs feeds).

ENS_DOMAIN – Optional, only used if you plan to resolve your site via ENS.

⚠️ Do not commit .env.local to version control.

3. Start the development server
bash
Copy code
npm run dev
Then open http://localhost:3000 in your browser.

yaml
Copy code

---

## 📄 README.md – Part 2 (bottom half)

```markdown
---

## 📁 Project Structure

src/
├─ app/
│ ├─ api/ # Server API routes (profile, forum, moderation)
│ ├─ dashboard/ # Home/Dashboard
│ ├─ forum/ # Board + Thread pages
│ └─ profile/ # Profile UI (edit/view)
├─ components/ # Reusable UI components
├─ lib/
│ ├─ auth/ # EIP-712/EIP-191 login + posting identity
│ ├─ forum/ # topics, publisher, pack, client helpers
│ └─ profile/ # context, service, storage, swarm helpers
└─ config/ # Bee / environment config
docs/
├─ System-Components.pdf
└─ Forum-Architecture.pdf

yaml
Copy code

---

## 🐝 How It Works (Overview)

- **Reads (GET):** The browser fetches directly from Bee (`/feeds`, `/bytes`, `/bzz`) to display profiles, posts, and avatars.  
- **Writes (POST):** The server API (with the platform signer and postage batch) uploads immutable JSON blobs and updates Swarm feeds.  
- **Login / Auth:** Web3 users sign an **EIP-712** capability; posts are signed with **EIP-191** and verified before publishing.

---

## 📚 Documentation

Detailed documentation is included in the `docs/` folder:

- 📘 [System Components](./docs/System-Components.pdf) – overview of architecture and deployment  
- 🧠 [Forum Architecture & Flows](./docs/Forum-Architecture.pdf) – login, profile feeds, posting, replies

---

## 🧰 Development Notes

- A **Bee node or gateway** must be running and reachable.
- A valid **postage batch** is required for uploads and feed writes.
- Server-side posting and moderation require `FEED_PRIVATE_KEY` and `POSTAGE_BATCH_ID`.
- Client-side reads depend on `NEXT_PUBLIC_BEE_URL`. Update this to a public gateway if needed.

---

## 📍 Roadmap

- [ ] Deployment instructions for Bee gateway and ENS
- [ ] Optional: support user-provided postage batches
- [ ] Production hardening (rate limiting, spam prevention)
- [ ] CI/CD pipeline

---

## 📜 License

MIT © 2025
