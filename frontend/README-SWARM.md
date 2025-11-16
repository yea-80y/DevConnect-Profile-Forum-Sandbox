# Deploying to Swarm Network

## Prerequisites

1. **Bee node running** at `http://localhost:3323` (or set custom `BEE_URL`)
2. **Postage batch ID** - purchase stamps for uploading data
3. **Optional: Feed private key** - for permanent updatable URL

## Quick Start

### 1. Build the frontend

```bash
npm run build
```

This creates the `out/` directory with static files.

### 2. Set environment variables

Create a `.env.swarm` file (or set in your shell):

```bash
BEE_URL=http://localhost:3323
POSTAGE_BATCH_ID=your-batch-id-here
FEED_PRIVATE_KEY=optional-for-feed-updates
```

### 3. Upload to Swarm

**Simple upload (one-time):**
```bash
POSTAGE_BATCH_ID=your-batch-id node upload-to-swarm.js
```

**Upload with feed (updatable URL):**
```bash
POSTAGE_BATCH_ID=your-batch-id FEED_PRIVATE_KEY=your-key node upload-to-swarm.js
```

## How it Works

### Without Feed (Static Reference)
- Uploads `out/` directory to Swarm
- Returns a **reference hash** (e.g., `abc123...`)
- Access at: `http://localhost:3323/bzz/abc123.../`
- **Each upload creates a new reference**

### With Feed (Permanent URL)
- Uploads `out/` directory
- Publishes the reference to a **feed**
- Feed has a permanent URL that always points to latest version
- Access at: `http://localhost:3323/bzz/FEED_MANIFEST/`
- **Re-run script to update - same URL, new content**

## Production Deployment

For production (serving from a public Swarm gateway):

1. Use a public Bee gateway URL:
   ```bash
   BEE_URL=https://gateway.ethswarm.org
   ```

2. Or run your own Bee node with public access

3. The website will be accessible at:
   ```
   https://gateway.ethswarm.org/bzz/YOUR_REFERENCE/
   ```

## Environment Variables Reference

- **BEE_URL**: Bee node API endpoint (default: `http://localhost:3323`)
- **POSTAGE_BATCH_ID**: Required. Your postage batch for uploading
- **FEED_PRIVATE_KEY**: Optional. 64-char hex private key for feed updates

## Generating a Feed Private Key

```bash
openssl rand -hex 32
```

Save this key securely - it's needed for updating the feed.

## Notes

- The `index.html` file must exist in `out/` (created by `npm run build`)
- Website routing uses query params: `/forum?thread=abc123`
- All API calls go to the backend server at `https://gateway.woco-net.com`
- Static files are optimized and compressed

## Troubleshooting

**"POSTAGE_BATCH_ID is required"**
- Set the environment variable with your postage batch ID

**"out/ directory not found"**
- Run `npm run build` first

**"Connection refused"**
- Check Bee node is running at the specified URL
- Verify firewall settings

**"Insufficient funds"**
- Your postage batch may be expired or insufficient
- Purchase a new batch or top up existing one
