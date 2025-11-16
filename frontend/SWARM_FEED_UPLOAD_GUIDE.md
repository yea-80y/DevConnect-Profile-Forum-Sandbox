# Swarm Feed Upload Guide

This guide walks you through uploading your Next.js site to a Swarm Feed.

## Why Use a Feed?

A Swarm Feed gives you:
- **Static address** - Set once in ENS, never changes
- **Updatable content** - Upload new versions anytime
- **Same URL** - Users always access via same woco.eth.limo

## Prerequisites

1. Built Next.js site (`npm run build` creates `out/` directory)
2. Postage batch ID (already have: `58a35141d74fedb10a6d4ebb9064b3f473ecd98df49be771cc6abed98a0ee756`)
3. Gateway access (already have: `https://gateway.woco-net.com`)

## Step-by-Step Instructions

### Step 1: Install Dependencies

```bash
cd C:\Users\nabil\devconnect-profile-sandbox\frontend
npm install @ethersphere/bee-js
```

### Step 2: Generate Feed Private Key

**IMPORTANT:** This is NOT your wallet private key. This is a dedicated key just for publishing to the feed.

Run this command to generate a new random private key:

```bash
node -e "console.log('0x' + require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output (it will look like: `0xabc123...def456`)

### Step 3: Configure the Upload Script

Edit `upload-to-swarm-feed.js` and update these lines:

```javascript
// Line 28: Your feed's private key (from Step 2)
const FEED_PRIVATE_KEY = '0xYOUR_GENERATED_KEY_HERE';

// Line 31: Your feed topic (can be anything descriptive)
const FEED_TOPIC = 'woco-website';
```

**Save these values in a safe place!** You'll need the same private key and topic every time you update.

### Step 4: Build Your Site

```bash
npm run build
```

This creates the `out/` directory with your static site.

### Step 5: Upload to Swarm Feed

```bash
node upload-to-swarm-feed.js
```

The script will:
1. Upload your `out/` directory to Swarm
2. Update the feed with the new content reference
3. Create/get the feed manifest (your permanent address)
4. Display the feed manifest reference
5. Save info to `swarm-feed-info.json`

### Step 6: Add to Whitelist

Copy the curl command from the script output and run it:

```bash
curl -X POST https://gateway.woco-net.com/admin/whitelist \
  -H "Content-Type: application/json" \
  -d '{"hash":"YOUR_FEED_MANIFEST_REFERENCE"}'
```

### Step 7: Set ENS Content Hash

1. Go to https://app.ens.domains
2. Connect wallet (owner of woco.eth)
3. Select your domain → Records
4. Set Content Hash to: `bzz://YOUR_FEED_MANIFEST_REFERENCE`

### Step 8: Test Access

Visit: https://woco.eth.limo

## Updating Your Site (Future)

When you want to update your site:

1. Make your changes
2. `npm run build`
3. `node upload-to-swarm-feed.js` (same command!)
4. No need to update ENS or whitelist - they stay the same!

The feed automatically points to the latest version.

## Troubleshooting

**"Directory out does not exist"**
- Run `npm run build` first

**"You must set a valid FEED_PRIVATE_KEY"**
- Generate a key with the command in Step 2
- Update line 28 in the script

**"Postage batch not found"**
- Check your batch ID is correct
- Check your bee node has the batch

**Upload is slow**
- Large sites take time (several minutes)
- Check your internet connection
- Check bee node is running

## Important Notes

- **Save your feed private key!** You need it to update the feed
- **Save your feed topic!** Must use the same topic for updates
- The feed manifest reference is your permanent address
- First upload creates the feed, future uploads update it
- Users always see the latest version via the feed manifest
