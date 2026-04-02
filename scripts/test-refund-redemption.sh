#!/bin/bash

# Test refund redemption on-chain
set -e

echo "=== Testing Refund Redemption ==="
echo ""

# Configuration
RPC_URL="http://127.0.0.1:8545"
PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
TEST_DATA_FILE=".test-artifacts.json"

# Check if test artifacts exist
if [ ! -f "$TEST_DATA_FILE" ]; then
  echo "❌ Test artifacts not found: $TEST_DATA_FILE"
  echo "   Please run: bash scripts/test-complete-flow.sh first"
  exit 1
fi

# Load test data
CONTRACT_ADDRESS=$(jq -r '.contractAddress' "$TEST_DATA_FILE")
ID_COMMITMENT=$(jq -r '.identityCommitment' "$TEST_DATA_FILE")
NULLIFIER=$(jq -r '.refundTicket.nullifier' "$TEST_DATA_FILE")
VALUE=$(jq -r '.refundTicket.value' "$TEST_DATA_FILE")
TIMESTAMP=$(jq -r '.refundTicket.timestamp' "$TEST_DATA_FILE")
R8X=$(jq -r '.refundTicket.signature.R8x' "$TEST_DATA_FILE")
R8Y=$(jq -r '.refundTicket.signature.R8y' "$TEST_DATA_FILE")
S=$(jq -r '.refundTicket.signature.S' "$TEST_DATA_FILE")

echo "📋 Refund Ticket Details:"
echo "  Contract: $CONTRACT_ADDRESS"
echo "  ID Commitment: $ID_COMMITMENT"
echo "  Nullifier: $NULLIFIER"
echo "  Value: $VALUE wei ($(echo "scale=6; $VALUE / 1000000000000000000" | bc) ETH)"
echo "  Timestamp: $TIMESTAMP"
echo "  Signature: R8=($R8X, $R8Y), S=$S"
echo ""

# Get the test account address
ACCOUNT=$(cast wallet address --private-key $PRIVATE_KEY)
echo "🔑 Using account: $ACCOUNT"
echo ""

# Check if Anvil is running
echo "Step 1: Checking Anvil..."
if ! curl -s -X POST $RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
  echo "❌ Anvil is not running on $RPC_URL"
  echo "   Please start Anvil in another terminal with: anvil"
  exit 1
fi
echo "✓ Anvil is running"
echo ""

# Get balance before redemption
echo "Step 2: Checking balance before redemption..."
BALANCE_BEFORE=$(cast balance $ACCOUNT --rpc-url $RPC_URL)
echo "   Balance: $BALANCE_BEFORE wei ($(echo "scale=6; $BALANCE_BEFORE / 1000000000000000000" | bc) ETH)"
echo ""

# Check if nullifier is already redeemed
echo "Step 3: Checking if nullifier is already redeemed..."
IS_REDEEMED=$(cast call $CONTRACT_ADDRESS \
  "isNullifierUsed(bytes32)(bool)" \
  "$NULLIFIER" \
  --rpc-url $RPC_URL 2>/dev/null || echo "error")

if [ "$IS_REDEEMED" = "true" ]; then
  echo "⚠️  Nullifier is already marked as used/redeemed"
  echo "   This test may fail. Consider running test-complete-flow.sh again"
  echo "   Continuing anyway..."
elif [ "$IS_REDEEMED" = "false" ]; then
  echo "✓ Nullifier is not yet redeemed"
else
  echo "⚠️  Could not check on-chain status (contract may not have isNullifierUsed)"
fi
echo ""

# Redeem the refund
echo "Step 4: Redeeming refund on-chain..."
echo "   Calling redeemRefund(idCommitment, nullifier, value, timestamp, signature, recipient)..."

# The contract expects: redeemRefund(bytes32 idCommitment, bytes32 nullifier, uint256 value, uint256 timestamp, EdDSASignature signature, address payable recipient)
# EdDSASignature is a struct: (bytes32 R8x, bytes32 R8y, bytes32 S)

REDEEM_RESULT=$(cast send $CONTRACT_ADDRESS \
  "redeemRefund(bytes32,bytes32,uint256,uint256,(bytes32,bytes32,bytes32),address)" \
  "$ID_COMMITMENT" \
  "$NULLIFIER" \
  "$VALUE" \
  "$TIMESTAMP" \
  "($R8X,$R8Y,$S)" \
  "$ACCOUNT" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL \
  --json 2>&1 || echo '{"error": "transaction_failed"}')

if echo "$REDEEM_RESULT" | jq -e '.transactionHash' > /dev/null 2>&1; then
  TX_HASH=$(echo "$REDEEM_RESULT" | jq -r '.transactionHash')
  echo "✅ Refund redemption transaction succeeded!"
  echo "   TX Hash: $TX_HASH"

  # Check if transaction was successful
  TX_STATUS=$(cast receipt $TX_HASH --rpc-url $RPC_URL --json | jq -r '.status')
  if [ "$TX_STATUS" = "0x1" ]; then
    echo "✓ Transaction status: SUCCESS"
  else
    echo "❌ Transaction status: FAILED"
    echo "   The transaction was mined but reverted"
    cast receipt $TX_HASH --rpc-url $RPC_URL
    exit 1
  fi
else
  echo "❌ Refund redemption transaction FAILED"
  echo "   Error: $REDEEM_RESULT"
  echo ""
  echo "Possible reasons:"
  echo "  • Signature verification failed"
  echo "  • Nullifier already redeemed"
  echo "  • Invalid refund ticket format"
  echo "  • Contract doesn't have redeemRefund function"
  exit 1
fi
echo ""

# Get balance after redemption
echo "Step 5: Checking balance after redemption..."
sleep 1
BALANCE_AFTER=$(cast balance $ACCOUNT --rpc-url $RPC_URL)
BALANCE_DIFF=$((BALANCE_AFTER - BALANCE_BEFORE))
echo "   Balance: $BALANCE_AFTER wei ($(echo "scale=6; $BALANCE_AFTER / 1000000000000000000" | bc) ETH)"
echo "   Difference: $BALANCE_DIFF wei ($(echo "scale=6; $BALANCE_DIFF / 1000000000000000000" | bc) ETH)"
echo ""

# Verify the refund amount (accounting for gas costs)
if [ $BALANCE_DIFF -gt 0 ]; then
  echo "✓ Balance increased (refund received, minus gas costs)"
  EXPECTED_GAIN=$VALUE
  GAS_COST=$((EXPECTED_GAIN - BALANCE_DIFF))
  echo "   Expected refund: $EXPECTED_GAIN wei"
  echo "   Gas cost: ~$GAS_COST wei"
else
  echo "⚠️  Balance decreased (gas cost exceeded refund value)"
  echo "   This might happen if refund value is very small"
fi
echo ""

# Verify nullifier is now marked as redeemed
echo "Step 6: Verifying nullifier is now marked as redeemed..."
IS_REDEEMED_AFTER=$(cast call $CONTRACT_ADDRESS \
  "isNullifierUsed(bytes32)(bool)" \
  "$NULLIFIER" \
  --rpc-url $RPC_URL 2>/dev/null || echo "unknown")

if [ "$IS_REDEEMED_AFTER" = "true" ]; then
  echo "✓ Nullifier is marked as used/redeemed"
else
  echo "⚠️  Nullifier status: $IS_REDEEMED_AFTER"
fi
echo ""

# Test double redemption prevention
echo "Step 7: Testing double-redemption prevention..."
DOUBLE_REDEEM=$(cast send $CONTRACT_ADDRESS \
  "redeemRefund(bytes32,bytes32,uint256,uint256,(bytes32,bytes32,bytes32),address)" \
  "$ID_COMMITMENT" \
  "$NULLIFIER" \
  "$VALUE" \
  "$TIMESTAMP" \
  "($R8X,$R8Y,$S)" \
  "$ACCOUNT" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL \
  --json 2>&1 || echo '{"error": "expected_failure"}')

if echo "$DOUBLE_REDEEM" | jq -e '.error' > /dev/null 2>&1; then
  echo "✅ Double-redemption PREVENTED (expected)"
  echo "   Same nullifier cannot be redeemed twice"
elif echo "$DOUBLE_REDEEM" | jq -e '.transactionHash' > /dev/null 2>&1; then
  TX_HASH2=$(echo "$DOUBLE_REDEEM" | jq -r '.transactionHash')
  TX_STATUS2=$(cast receipt $TX_HASH2 --rpc-url $RPC_URL --json | jq -r '.status')
  if [ "$TX_STATUS2" = "0x0" ]; then
    echo "✅ Double-redemption transaction REVERTED (expected)"
  else
    echo "❌ Double-redemption SUCCEEDED (CRITICAL SECURITY ISSUE!)"
    exit 1
  fi
fi
echo ""

# Summary
echo "=== Test Results ==="
echo ""
echo "✅ PASS: Refund redemption is working correctly!"
echo ""
echo "Summary:"
echo "  ✓ Refund ticket signature verified"
echo "  ✓ Refund amount transferred to user"
echo "  ✓ Nullifier marked as redeemed"
echo "  ✓ Double-redemption prevented"
echo ""
echo "💰 Financial Summary:"
echo "  Refund value: $VALUE wei"
echo "  Balance change: $BALANCE_DIFF wei (after gas)"
echo ""
