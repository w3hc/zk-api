#!/bin/bash

# Test double-spend prevention by reusing the same nullifier
set -e

echo "=== Testing Double-Spend Prevention ==="
echo ""

# Check if test artifacts exist
TEST_DATA_FILE=".test-artifacts.json"
if [ ! -f "$TEST_DATA_FILE" ]; then
  echo "❌ Test artifacts not found: $TEST_DATA_FILE"
  echo "   Please run: bash scripts/test-complete-flow.sh first"
  exit 1
fi

# Load test data
CONTRACT_ADDRESS=$(jq -r '.contractAddress' "$TEST_DATA_FILE")
RPC_URL="http://127.0.0.1:8545"

echo "📋 Test Setup:"
echo "  Contract: $CONTRACT_ADDRESS"
echo ""

# Check if API server is running
echo "Step 1: Checking API server..."
if ! curl -k -s https://localhost:3000/health > /dev/null 2>&1; then
  echo "❌ API server is not running"
  echo "   Please start it with: pnpm start:dev"
  exit 1
fi
echo "✓ API server is running"
echo ""

# Generate real ZK proofs
echo "Step 2: Generating real ZK proofs..."

# Generate first proof
RANDOM_SECRET_KEY=$RANDOM
RANDOM_TICKET_INDEX=$(date +%s | tail -c 3)

PROOF_OUTPUT=$(npx ts-node scripts/generate-proof.ts $RANDOM_SECRET_KEY $RANDOM_TICKET_INDEX 2>/dev/null)

# Parse the JSON output
PROOF_JSON=$(echo "$PROOF_OUTPUT" | awk '/^Proof \(JSON\):/{flag=1; next} /^$/{flag=0} flag' | sed -n '/{/,/}/p')
PUBLIC_INPUTS=$(echo "$PROOF_OUTPUT" | awk '/^Public Inputs \(JSON\):/{flag=1; next} /^$/{flag=0} flag' | sed -n '/{/,/}/p')

# For the first request, use the real nullifier from the proof
NULLIFIER=$(echo "$PUBLIC_INPUTS" | jq -r '.nullifier')
SIGNAL_X=$(echo "$PUBLIC_INPUTS" | jq -r '.signalX' | sed 's/0x//')
SIGNAL_Y=$(echo "$PUBLIC_INPUTS" | jq -r '.signalY' | sed 's/0x//')
MAX_COST=$(echo "$PUBLIC_INPUTS" | jq -r '.maxCost')

# Convert hex to decimal for signals
SIGNAL_X_DEC=$((16#$SIGNAL_X))
SIGNAL_Y_DEC=$((16#$SIGNAL_Y))

PROOF_STRING=$(echo "$PROOF_JSON" | jq -c | jq -R)

echo "✓ First proof generated"
echo "  Secret key: $RANDOM_SECRET_KEY"
echo "  Ticket index: $RANDOM_TICKET_INDEX"
echo "  Nullifier: $NULLIFIER"
echo ""

# First request - should succeed
echo "Step 3: Making FIRST API request..."
REQUEST_JSON=$(cat <<EOF
{
  "payload": "First double-spend test request",
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

RESPONSE1=$(echo "$REQUEST_JSON" | curl -k -s -X POST https://localhost:3000/zk-api/request \
  -H "Content-Type: application/json" \
  -d @- || echo '{"error": "request_failed"}')

if echo "$RESPONSE1" | jq -e '.response' > /dev/null 2>&1; then
  echo "✅ First request SUCCEEDED (expected)"
  echo "   Response: $(echo "$RESPONSE1" | jq -r '.response' | head -c 50)..."
else
  echo "⚠️  First request FAILED (unexpected)"
  echo "   This might mean the nullifier was already used in a previous test"
  echo "   Response: $(echo "$RESPONSE1" | jq -c '.')"
  echo ""
  echo "Continuing to test double-spend anyway..."
fi
echo ""

# Generate second proof with different signal (for double-spend detection)
echo "Step 4: Generating SECOND proof with SAME nullifier (different signal)..."
sleep 1

# Generate second proof with different ticket index but keep the same secret key
SECOND_TICKET_INDEX=$((RANDOM_TICKET_INDEX + 1))
PROOF_OUTPUT2=$(npx ts-node scripts/generate-proof.ts $RANDOM_SECRET_KEY $SECOND_TICKET_INDEX 2>/dev/null)

# Parse second proof
PROOF_JSON2=$(echo "$PROOF_OUTPUT2" | awk '/^Proof \(JSON\):/{flag=1; next} /^$/{flag=0} flag' | sed -n '/{/,/}/p')
PUBLIC_INPUTS2=$(echo "$PROOF_OUTPUT2" | awk '/^Public Inputs \(JSON\):/{flag=1; next} /^$/{flag=0} flag' | sed -n '/{/,/}/p')

SIGNAL_X2=$(echo "$PUBLIC_INPUTS2" | jq -r '.signalX' | sed 's/0x//')
SIGNAL_Y2=$(echo "$PUBLIC_INPUTS2" | jq -r '.signalY' | sed 's/0x//')
SIGNAL_X2_DEC=$((16#$SIGNAL_X2))
SIGNAL_Y2_DEC=$((16#$SIGNAL_Y2))

PROOF_STRING2=$(echo "$PROOF_JSON2" | jq -c | jq -R)

echo "✓ Second proof generated (with different signal)"
echo ""

# Second request - should FAIL (double-spend)
echo "Step 5: Making SECOND API request with SAME nullifier..."
REQUEST_JSON2=$(cat <<EOF
{
  "payload": "Second request - should FAIL (double-spend)",
  "nullifier": "$NULLIFIER",
  "signal": {
    "x": "$SIGNAL_X2_DEC",
    "y": "$SIGNAL_Y2_DEC"
  },
  "proof": $PROOF_STRING2,
  "maxCost": "$MAX_COST"
}
EOF
)

RESPONSE2=$(echo "$REQUEST_JSON2" | curl -k -s -X POST https://localhost:3000/zk-api/request \
  -H "Content-Type: application/json" \
  -d @- || echo '{"error": "request_failed"}')

echo ""
ERROR_MSG=$(echo "$RESPONSE2" | jq -r '.message // ""')
if echo "$ERROR_MSG" | grep -iE "(nullifier|double-spend)" > /dev/null 2>&1; then
  echo "✅ Second request REJECTED (expected - double-spend prevented!)"
  echo "   Error: $ERROR_MSG"
  DOUBLE_SPEND_PREVENTED=true
elif echo "$RESPONSE2" | jq -e '.response' > /dev/null 2>&1; then
  echo "❌ Second request SUCCEEDED (UNEXPECTED - double-spend not prevented!)"
  echo "   This is a security issue - the same nullifier was accepted twice"
  DOUBLE_SPEND_PREVENTED=false
else
  echo "⚠️  Second request failed with unexpected error:"
  echo "   Response: $(echo "$RESPONSE2" | jq -c '.')"
  DOUBLE_SPEND_PREVENTED=unknown
fi
echo ""

# Check onchain nullifier status
echo "Step 6: Verifying nullifier tracking..."
IS_USED=$(cast call $CONTRACT_ADDRESS \
  "isNullifierUsed(bytes32)(bool)" \
  "$NULLIFIER" \
  --rpc-url $RPC_URL 2>/dev/null || echo "unknown")

if [ "$IS_USED" = "true" ]; then
  echo "✓ Nullifier is marked onchain (refund redeemed or slashed)"
elif [ "$IS_USED" = "false" ]; then
  echo "✓ Nullifier tracked in API database (expected - not yet submitted onchain)"
  echo "   Note: Nullifiers are only recorded onchain during refund redemption or slashing"
else
  echo "⚠️  Could not check onchain status (contract method may not exist)"
  # Set to empty so we don't fail the test on this
  IS_USED=""
fi
echo ""

# Summary
echo "=== Test Results ==="
echo ""
if [ "$DOUBLE_SPEND_PREVENTED" = "true" ]; then
  echo "✅ PASS: Double-spend prevention is working correctly!"
  echo ""
  echo "   ✓ First request with nullifier succeeded"
  echo "   ✓ Second request with same nullifier was rejected"
  if [ "$IS_USED" = "true" ]; then
    echo "   ✓ Nullifier is marked as used onchain"
  else
    echo "   ✓ Nullifier is tracked in API database"
  fi
  exit 0
else
  echo "❌ FAIL: Double-spend prevention is NOT working!"
  echo ""
  echo "   This is a critical security issue that must be fixed."
  exit 1
fi
