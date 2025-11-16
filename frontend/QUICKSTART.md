# WoCo Forum - Swarm Deployment Quickstart

## Upload to Swarm Network

### Step 1: Get your Postage Batch ID

You should already have this from your Bee node. If not:

```bash
# List your postage batches
curl http://localhost:3323/stamps

# Or create a new batch (adjust amount as needed)
curl -X POST http://localhost:3323/stamps/10000000/20
```

### Step 2: Upload the website

**Simple upload (one-time reference):**

```bash
cd frontend
POSTAGE_BATCH_ID=your-batch-id-here npm run upload:swarm
```

**Upload with feed (permanent updatable URL):**

```bash
# Generate a private key first
openssl rand -hex 32

# Then upload with feed
POSTAGE_BATCH_ID=your-batch-id FEED_PRIVATE_KEY=your-generated-key npm run upload:swarm
```

### Step 3: Access your website

The script will output URLs like:

```
🌐 Access your website at:
   http://localhost:3323/bzz/abc123.../
```

Or if using a feed:

```
🌐 Access via feed at:
   http://localhost:3323/bzz/FEED_MANIFEST/
```

## Using a Public Gateway

To make your website publicly accessible, use a public Swarm gateway:

```bash
BEE_URL=https://gateway.ethswarm.org POSTAGE_BATCH_ID=your-batch npm run upload:swarm
```

Then access at: `https://gateway.ethswarm.org/bzz/YOUR_REFERENCE/`

## Updating the Website

### Without Feed
1. Make changes to the code
2. Run `npm run build`
3. Run upload script again
4. **You'll get a NEW reference** - update links everywhere

### With Feed (Recommended)
1. Make changes to the code
2. Run `npm run build`
3. Run upload script with **same FEED_PRIVATE_KEY**
4. **Feed URL stays the same** - content updates automatically!

## Production Setup

For your WoCo deployment:

1. **Backend is already running** on server at `~/your-backend-directory/`
2. **Frontend goes to Swarm** using this upload script
3. Frontend calls backend API at `https://gateway.woco-net.com`

### Recommended: Use Feed

```bash
# Save this key somewhere safe!
FEED_PRIVATE_KEY=$(openssl rand -hex 32)
echo $FEED_PRIVATE_KEY > .feed-key-backup.txt

# Upload
POSTAGE_BATCH_ID=your-batch FEED_PRIVATE_KEY=$FEED_PRIVATE_KEY npm run upload:swarm
```

The feed URL becomes your permanent website address!

## File Structure

```
frontend/
├── out/                    # Built static files (3.4MB)
│   ├── index.html         # Entry point (required for Swarm)
│   ├── _next/             # JavaScript bundles
│   ├── dashboard/
│   ├── forum/
│   └── ...
├── upload-to-swarm.js     # Upload script
├── README-SWARM.md        # Detailed docs
└── QUICKSTART.md          # This file
```

## Security Notes

✅ **Frontend is safe** - contains only:
- NEXT_PUBLIC_BEE_URL
- NEXT_PUBLIC_POSTAGE_BATCH_ID
- NEXT_PUBLIC_API_URL

❌ **NOT in frontend**:
- FEED_PRIVATE_KEY (stays local, only used for uploads)
- API routes (on server)
- Server configs (on server)

## Need Help?

Check [README-SWARM.md](./README-SWARM.md) for detailed documentation.
