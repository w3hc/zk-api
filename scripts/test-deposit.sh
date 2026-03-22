#!/bin/bash

# Test script for depositing to ZkApiCredits contract

CONTRACT_ADDRESS="0x5FbDB2315678afecb367f032d93F642f64180aa3"
RPC_URL="http://127.0.0.1:8545"
PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

echo "=== ZK API Credits Test Deposit ==="
echo ""

# Generate a random secret key (in production, user keeps this secret!)
SECRET_KEY="0x$(openssl rand -hex 32)"
echo "Secret Key (KEEP SECRET): $SECRET_KEY"

# Calculate identity commitment: keccak256(secretKey)
ID_COMMITMENT=$(cast keccak "$SECRET_KEY")
echo "Identity Commitment: $ID_COMMITMENT"
echo ""

# Deposit 0.2 ETH (minimum required)
echo "Depositing 0.2 ETH to contract..."
TX_HASH=$(cast send $CONTRACT_ADDRESS \
  "deposit(bytes32)" \
  $ID_COMMITMENT \
  --value 0.2ether \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL \
  --json | jq -r '.transactionHash')

echo "Transaction: $TX_HASH"
echo ""

# Wait for confirmation
echo "Waiting for confirmation..."
sleep 2

# Check deposit
echo "Checking deposit status..."
cast call $CONTRACT_ADDRESS \
  "getDeposit(bytes32)(bytes32,uint256,uint256,uint256,bool)" \
  $ID_COMMITMENT \
  --rpc-url $RPC_URL

echo ""
echo "=== Deposit Complete! ==="
echo ""
echo "Now you can test the API with:"
echo ""
echo "curl -k https://localhost:3000/zk-api/request \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{\"payload\":\"What is 2+2?\",\"nullifier\":\"0x1111111111111111111111111111111111111111111111111111111111111111\",\"signal\":{\"x\":\"123\",\"y\":\"456\"},\"proof\":\"0xabcdef1234567890\",\"maxCost\":\"100000000000000000\"}'"
