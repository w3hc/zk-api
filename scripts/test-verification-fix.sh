#!/bin/bash
# Quick test to verify the proof format fix works

set -e

echo "🧪 Testing ZK Proof Verification Fix"
echo ""

# Generate a proof
echo "1. Generating proof..."
PROOF_OUTPUT=$(npx ts-node scripts/generate-proof.ts 12345 0 2>/dev/null)

# Extract proof and public inputs
PROOF_JSON=$(echo "$PROOF_OUTPUT" | awk '/^Proof \(JSON\):/{flag=1; next} /^$/{flag=0} flag' | sed -n '/{/,/}/p')
PUBLIC_INPUTS=$(echo "$PROOF_OUTPUT" | awk '/^Public Inputs \(JSON\):/{flag=1; next} /^$/{flag=0} flag' | sed -n '/{/,/}/p')

# Verify proof structure has 3 coordinates
echo "2. Verifying proof structure..."
PI_A_LEN=$(echo "$PROOF_JSON" | jq '.pi_a | length')
PI_B0_LEN=$(echo "$PROOF_JSON" | jq '.pi_b[0] | length')
PI_C_LEN=$(echo "$PROOF_JSON" | jq '.pi_c | length')

if [ "$PI_A_LEN" != "3" ] || [ "$PI_B0_LEN" != "3" ] || [ "$PI_C_LEN" != "3" ]; then
  echo "❌ Proof format incorrect! Expected 3 coordinates per point."
  echo "   pi_a length: $PI_A_LEN (expected 3)"
  echo "   pi_b[0] length: $PI_B0_LEN (expected 3)"
  echo "   pi_c length: $PI_C_LEN (expected 3)"
  exit 1
fi

echo "   ✓ Proof has correct 3-coordinate format"

# Verify z coordinates are '1'
PI_A_Z=$(echo "$PROOF_JSON" | jq -r '.pi_a[2]')
PI_B0_Z=$(echo "$PROOF_JSON" | jq -r '.pi_b[0][2]')
PI_C_Z=$(echo "$PROOF_JSON" | jq -r '.pi_c[2]')

if [ "$PI_A_Z" != "1" ] || [ "$PI_B0_Z" != "1" ] || [ "$PI_C_Z" != "1" ]; then
  echo "❌ Z coordinates should be '1'"
  exit 1
fi

echo "   ✓ Z coordinates set to '1' (projective)"

echo ""
echo "✅ Proof format is correct!"
echo ""
echo "📝 The proof can now be verified by snarkjs after coordinate conversion:"
echo "   - API format: [x, y, z] with z='1'"
echo "   - snarkjs format: [x, y] (affine) with reversed order for pi_b"
echo ""
echo "To test full integration:"
echo "  1. Start anvil: anvil"
echo "  2. Start server: pnpm start:dev"
echo "  3. Run test: bash scripts/test-complete-flow.sh"
