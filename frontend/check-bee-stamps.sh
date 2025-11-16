#!/bin/bash
# Helper script to check Bee stamps on the server
# Run this on the server: ssh ntl-dev@192.168.0.144 'bash -s' < check-bee-stamps.sh

echo "🐝 Checking Bee Node Status..."
echo ""

# Check if Bee is running
if docker ps | grep -q bee-node; then
    echo "✅ Bee node container is running"
else
    echo "❌ Bee node container not found"
    echo "   Checking for 'bee' container..."
    docker ps | grep bee || echo "   No Bee containers running"
    exit 1
fi

echo ""
echo "📊 Current Postage Batches:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# List all stamps
STAMPS=$(curl -s http://localhost:1633/stamps)

if [ $? -ne 0 ]; then
    echo "❌ Failed to connect to Bee API"
    echo "   Is Bee running on port 1633?"
    exit 1
fi

# Count stamps
COUNT=$(echo "$STAMPS" | jq -r '.stamps | length' 2>/dev/null)

if [ "$COUNT" = "0" ] || [ "$COUNT" = "null" ]; then
    echo "⚠️  No postage batches found"
    echo ""
    echo "💡 Create a new batch with:"
    echo "   curl -X POST http://localhost:1633/stamps/10000000/20"
    exit 0
fi

echo "Found $COUNT batch(es):"
echo ""

# Show each batch
echo "$STAMPS" | jq -r '.stamps[] |
    "Batch ID:     \(.batchID)\n" +
    "Usable:       \(.usable)\n" +
    "Utilization:  \(.utilization)\n" +
    "Depth:        \(.depth)\n" +
    "Amount:       \(.amount)\n" +
    "Bucket Depth: \(.bucketDepth)\n" +
    "Block Number: \(.blockNumber)\n" +
    "Immutable:    \(.immutableFlag)\n" +
    "Batch TTL:    \(.batchTTL)\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"'

echo ""
echo "💰 Node Balance:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -s http://localhost:1633/chequebook/balance | jq -r '
    "Total Balance:        \(.totalBalance)\n" +
    "Available Balance:    \(.availableBalance)"'

echo ""
echo ""
echo "📝 Quick Commands:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Create new batch:"
echo "  curl -X POST http://localhost:1633/stamps/10000000/20"
echo ""
echo "Top up a batch:"
echo "  curl -X PATCH http://localhost:1633/stamps/topup/BATCH_ID/10000000"
echo ""
echo "Check specific batch:"
echo "  curl http://localhost:1633/stamps/BATCH_ID"
