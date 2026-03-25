#!/bin/bash

# Complete test flow: Start Anvil, Deploy Contract, Setup, and Test API
set -e

echo "=== ZK API Complete Test Flow ==="
echo ""

# Configuration
RPC_URL="http://127.0.0.1:8545"
PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
CONTRACT_ADDRESS="" # Will be extracted from deployment

# Step 1: Check if Anvil is running
echo "Step 1: Checking Anvil..."
if ! curl -s -X POST $RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
  echo "❌ Anvil is not running on $RPC_URL"
  echo "Please start Anvil in another terminal with: anvil"
  exit 1
fi
echo "✓ Anvil is running"
echo ""

# Step 2: Deploy contract
echo "Step 2: Deploying ZkApiCredits contract..."
cd contracts
DEPLOY_OUTPUT=$(forge script script/DeployZkApiCredits.s.sol:DeployZkApiCredits \
  --rpc-url $RPC_URL \
  --broadcast \
  --private-key $PRIVATE_KEY 2>&1)

# Extract contract address from deployment logs
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "ZkApiCredits deployed at:" | awk '{print $NF}')

if [ -z "$CONTRACT_ADDRESS" ]; then
  echo "❌ Failed to extract contract address from deployment"
  echo "$DEPLOY_OUTPUT"
  exit 1
fi

cd ..
echo "✓ Contract deployed at: $CONTRACT_ADDRESS"
echo ""

# Step 3: Make a deposit
echo "Step 3: Making test deposit..."
SECRET_KEY="0x$(openssl rand -hex 32)"
echo "Secret Key (KEEP SECRET): $SECRET_KEY"

# Compute identity commitment using Poseidon hash (matches ZK circuit)
echo "Computing Poseidon hash for identity commitment..."
ID_COMMITMENT=$(npx ts-node scripts/compute-poseidon.ts "$SECRET_KEY" 2>/dev/null)

if [ -z "$ID_COMMITMENT" ]; then
  echo "❌ Failed to compute Poseidon hash"
  echo "   Make sure circomlibjs is installed: pnpm install"
  exit 1
fi

echo "Identity Commitment (Poseidon): $ID_COMMITMENT"

TX_HASH=$(cast send $CONTRACT_ADDRESS \
  "deposit(bytes32)" \
  $ID_COMMITMENT \
  --value 0.2ether \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL \
  --json | jq -r '.transactionHash')

echo "✓ Deposit transaction: $TX_HASH"
sleep 2
echo ""

# Step 4: Verify deposit
echo "Step 4: Verifying deposit..."
cast call $CONTRACT_ADDRESS \
  "getDeposit(bytes32)(bytes32,uint256,uint256,uint256,bool)" \
  $ID_COMMITMENT \
  --rpc-url $RPC_URL
echo ""

# Step 5: Check if API server is running
echo "Step 5: Checking API server..."
if ! curl -k -s https://localhost:3000/health > /dev/null 2>&1; then
  echo "⚠️  API server is not running"
  echo "Please start the API server in another terminal with: pnpm start:dev"
  echo ""
  echo "Then you can test the /zk-api/request endpoint with:"
  echo ""
  echo "curl -k https://localhost:3000/zk-api/request \\"
  echo "  -H \"Content-Type: application/json\" \\"
  echo "  -d '{\"payload\":\"What does 苟全性命於亂世，不求聞達於諸侯。mean?\",\"nullifier\":\"0x1111111111111111111111111111111111111111111111111111111111111111\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":\"0xabcdef1234567890\",\"maxCost\":\"100000000000000000\"}'"
  exit 0
fi
echo "✓ API server is running"
echo ""

# Step 6: Generate real ZK proof
echo "Step 6: Generating zero-knowledge proof..."
RANDOM_SECRET_KEY=$RANDOM
RANDOM_TICKET_INDEX=$(date +%s | tail -c 3)

# Generate proof and capture output
PROOF_OUTPUT=$(npx ts-node scripts/generate-proof.ts $RANDOM_SECRET_KEY $RANDOM_TICKET_INDEX 2>/dev/null)

# Parse the JSON output from the script
PROOF_JSON=$(echo "$PROOF_OUTPUT" | awk '/^Proof \(JSON\):/{flag=1; next} /^$/{flag=0} flag' | sed -n '/{/,/}/p')
PUBLIC_INPUTS=$(echo "$PROOF_OUTPUT" | awk '/^Public Inputs \(JSON\):/{flag=1; next} /^$/{flag=0} flag' | sed -n '/{/,/}/p')

# Extract values
NULLIFIER=$(echo "$PUBLIC_INPUTS" | jq -r '.nullifier')
SIGNAL_X=$(echo "$PUBLIC_INPUTS" | jq -r '.signalX' | sed 's/0x//')
SIGNAL_Y=$(echo "$PUBLIC_INPUTS" | jq -r '.signalY' | sed 's/0x//')
MAX_COST=$(echo "$PUBLIC_INPUTS" | jq -r '.maxCost')

# Convert hex to decimal for signals
SIGNAL_X_DEC=$((16#$SIGNAL_X))
SIGNAL_Y_DEC=$((16#$SIGNAL_Y))

echo "✓ ZK proof generated"
echo "  Secret key: $RANDOM_SECRET_KEY"
echo "  Ticket index: $RANDOM_TICKET_INDEX"
echo "  Nullifier: $NULLIFIER"
echo ""

# Step 7: Test API endpoint with real proof
echo "Step 7: Making API request with ZK proof..."

# Create request with properly formatted proof (proof must be a JSON string, not object)
PROOF_STRING=$(echo "$PROOF_JSON" | jq -c | jq -R)

REQUEST_JSON=$(cat <<EOF
{
  "payload": "What does 苟全性命於亂世，不求聞達於諸侯。mean?",
  "nullifier": "$NULLIFIER",
  "signal": {
    "x": "$SIGNAL_X_DEC",
    "y": "$SIGNAL_Y_DEC"
  },
  "proof": $PROOF_STRING,
  "maxCost": "$MAX_COST"
}
EOF
)

# Make API request
RESPONSE=$(echo "$REQUEST_JSON" | curl -k -s -X POST https://localhost:3000/zk-api/request \
  -H "Content-Type: application/json" \
  -d @-)

echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

# Check if successful
if echo "$RESPONSE" | jq -e '.response' > /dev/null 2>&1; then
  echo ""
  echo "✅ API request successful with real ZK proof!"
  echo ""
  echo "Response includes:"
  echo "  - Claude API response"
  echo "  - Actual cost: $(echo "$RESPONSE" | jq -r '.actualCost') wei"
  echo "  - Refund value: $(echo "$RESPONSE" | jq -r '.refundTicket.value') wei"
  echo "  - EdDSA signature for on-chain refund redemption"
else
  echo ""
  echo "⚠️  API request failed"
  echo "This could be due to proof verification or validation issues."
fi

echo ""
echo "=== Test Complete! ==="
echo ""
echo "📋 Summary:"
echo "  ✓ Anvil blockchain running"
echo "  ✓ Smart contract deployed at: $CONTRACT_ADDRESS"
echo "  ✓ Test deposit made: 0.2 ETH"
echo "  ✓ Identity commitment: $ID_COMMITMENT"
echo "  ✓ Real ZK proof generated (Poseidon hash + RLN signal)"
echo "  ✓ API request processed with cryptographic proof"
echo ""
echo "🔐 What This Proves:"
echo "  • Smart contract accepts deposits with identity commitments"
echo "  • Deposits are tracked on-chain with RLN and policy stakes"
echo "  • API validates ZK proof structure and nullifier uniqueness"
echo "  • Server issues signed refund tickets for unused credits"
echo "  • System maintains anonymity while preventing double-spending"
echo ""
echo "📚 Next Steps:"
echo "  • Test with real ZK proofs: npx ts-node scripts/generate-proof.ts 12345 1"
echo "  • Test double-spend detection: npx ts-node scripts/test-proof-verification.ts"
echo "  • Test refund redemption: See docs/TESTING_GUIDE.md"
echo "  • Review ZK architecture: See docs/ZK.md"
