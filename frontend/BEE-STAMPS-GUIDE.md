# Managing Bee Postage Stamps (Batches)

Your Bee node is running in Docker on the server laptop. Here's how to manage postage batches.

## Quick Reference

```bash
# SSH to server
ssh server-user@SERVER-IP

# Check Bee container is running
docker ps | grep bee

# List all postage batches
curl http://localhost:1633/stamps

# Check specific batch details
curl http://localhost:1633/stamps/YOUR_BATCH_ID

# Top up existing batch (add 10000000 BZZ)
curl -X PATCH http://localhost:1633/stamps/topup/YOUR_BATCH_ID/10000000

# Create new batch (amount: 10000000, depth: 20)
curl -X POST http://localhost:1633/stamps/10000000/20
```

## Step-by-Step Guide

### 1. SSH to the Server

```bash
ssh server-user@SERVER-IP
```

### 2. Check Bee is Running

```bash
docker ps | grep bee
```

You should see:
```
CONTAINER ID   IMAGE           COMMAND       STATUS
abc123...      ethersphere/bee ...           Up X hours
```

### 3. Check Your Current Batches

```bash
curl http://localhost:1633/stamps
```

This returns JSON with all your batches. Look for:
- `batchID` - The stamp ID you use for uploads
- `utilization` - How much of the batch is used
- `usable` - Whether it's still valid
- `batchTTL` - Time to live (how long until it expires)

Example output:
```json
{
  "stamps": [
    {
      "batchID": "abc123...",
      "utilization": 0,
      "usable": true,
      "batchTTL": 12345678
    }
  ]
}
```

### 4. Top Up an Existing Batch

If you have a batch that's running low or expired:

```bash
# Syntax: curl -X PATCH http://localhost:1633/stamps/topup/BATCH_ID/AMOUNT
curl -X PATCH http://localhost:1633/stamps/topup/abc123.../10000000
```

**Amount explanation:**
- Amount is in PLUR (smallest unit of BZZ)
- 1 BZZ = 10^16 PLUR
- 10000000 PLUR ≈ 0.000000000001 BZZ (very small amount)
- For production, you might need larger amounts

### 5. Create a New Batch

If you need a fresh batch:

```bash
# Syntax: curl -X POST http://localhost:1633/stamps/AMOUNT/DEPTH
curl -X POST http://localhost:1633/stamps/10000000/20
```

**Parameters:**
- **Amount**: How much BZZ to attach to the batch
- **Depth**: Bucket depth (20 is standard for most use cases)

**Response:**
```json
{
  "batchID": "new-batch-id-here...",
  "txHash": "transaction-hash..."
}
```

Save the `batchID` - this is what you use for `POSTAGE_BATCH_ID`!

### 6. Dilute a Batch (Increase Capacity)

If your batch has enough funds but needs more capacity:

```bash
# Increase depth by 1 (doubles capacity)
curl -X PATCH http://localhost:1633/stamps/dilute/YOUR_BATCH_ID/1
```

## Understanding Batch Parameters

### Depth
- Determines how many chunks you can upload
- Each depth level doubles capacity
- Common depths: 17-22
- Depth 20 = ~1 million chunks (~4GB)

### Amount
- How much BZZ you're spending
- Determines how long the batch lasts
- More BZZ = longer TTL

### TTL (Time To Live)
- How long until batch expires
- Shown in blocks
- Check with: `curl http://localhost:1633/stamps/YOUR_BATCH_ID`

## Checking Bee Node Balance

```bash
# Check xBZZ balance (testnet)
curl http://localhost:1633/chequebook/balance

# Check xDAI balance (for gas)
curl http://localhost:1633/wallet
```

If balance is low, you'll need to fund the wallet.

## Common Issues

### "Insufficient funds"
- Your Bee wallet doesn't have enough xBZZ
- Fund it using the Gnosis Chain (xDAI) faucet
- Or transfer xBZZ from another wallet

### "Batch not usable"
- Batch has expired
- Top it up with more funds
- Or create a new batch

### "Connection refused"
- Bee API might be on a different port
- Check Docker port mapping: `docker ps | grep bee`
- Might be port 1633 or 1635 depending on setup

## Your Bee Node Setup

Based on your deployment, your Bee node is likely:
- Running in Docker container
- Accessible at `http://localhost:1633` on the server
- Behind the bee-proxy (which adds rate limiting/auth)

**API ports:**
- `1633` - Bee API (administrative)
- `1635` - Bee debug API (advanced features)
- `3323` - Your proxy (public access with auth)

## Using with the Upload Script

Once you have a batch ID:

```bash
# On your dev laptop
cd frontend

# Set the batch ID from server
POSTAGE_BATCH_ID=your-batch-id-from-server npm run upload:swarm
```

Or add to `.env.swarm`:
```
POSTAGE_BATCH_ID=your-batch-id-from-server
```

## Monitoring Batch Usage

```bash
# Watch batch utilization
watch -n 5 'curl -s http://localhost:1633/stamps/YOUR_BATCH_ID | jq'

# Or simple check
curl http://localhost:1633/stamps/YOUR_BATCH_ID | jq '.utilization'
```

## Advanced: Using Bee Dashboard

Bee has a web dashboard at `http://localhost:1635` (if enabled).

To access from your dev laptop:
```bash
# Create SSH tunnel
ssh -L 1635:localhost:1635 server-user@SERVER-IP

# Then open in browser
http://localhost:1635
```

## Quick Commands Cheat Sheet

```bash
# List batches
curl http://localhost:1633/stamps

# Create batch (10M PLUR, depth 20)
curl -X POST http://localhost:1633/stamps/10000000/20

# Top up batch
curl -X PATCH http://localhost:1633/stamps/topup/BATCH_ID/10000000

# Check batch status
curl http://localhost:1633/stamps/BATCH_ID

# Check node balance
curl http://localhost:1633/chequebook/balance
```

## Need More BZZ?

For testnet (Gnosis Chain):
1. Get xDAI from faucet: https://gnosisfaucet.com/
2. Swap xDAI for xBZZ on DEX
3. Your Bee wallet address: `curl http://localhost:1633/addresses`

For mainnet:
1. Buy BZZ on exchange
2. Send to your Bee wallet address
3. Wait for confirmations
