# ZK Proof Verification Fix - July 2026

## Problem Summary

ZK proof verification was failing in the API integration tests with "Invalid ZK proof" (401) errors, despite:
- Circuit artifacts (zkey, verification key) being properly regenerated with valid trusted setup (gamma ≠ delta)
- Standalone verification tests passing successfully
- Proof structure validation passing
- All caches cleared and server restarted

## Root Cause

The issue was in [src/zk-api/snarkjs-proof.service.ts:174](../src/zk-api/snarkjs-proof.service.ts#L174). The `verifyProof` method was passing the proof directly from the API to snarkjs without converting between coordinate systems:

**API Proof Format** (Projective coordinates):
```typescript
{
  pi_a: [x, y, z],  // z = '1'
  pi_b: [[x1, y1, z1], [x2, y2, z2]],
  pi_c: [x, y, z],
  protocol: 'groth16'
}
```

**snarkjs Expected Format** (Affine coordinates):
```typescript
{
  pi_a: [x, y],  // No z coordinate
  pi_b: [[y1, x1], [y2, x2]],  // Reversed order + no z
  pi_c: [x, y],
  protocol: 'groth16',
  curve: 'bn128'
}
```

The mismatch caused cryptographic verification to fail silently.

## The Fix

### 1. Updated snarkjs-proof.service.ts

Added coordinate conversion in `verifyProof()` method:

```typescript
// Convert proof from API format (projective coordinates with z) to snarkjs format (affine)
const snarkjsProof = {
  pi_a: [proof.pi_a[0], proof.pi_a[1]],
  pi_b: [
    [proof.pi_b[0][1], proof.pi_b[0][0]], // Note: reversed order
    [proof.pi_b[1][1], proof.pi_b[1][0]],
  ],
  pi_c: [proof.pi_c[0], proof.pi_c[1]],
  protocol: proof.protocol || 'groth16',
  curve: 'bn128',
};

const isValid = await this.snarkjs.groth16.verify(
  this.vKey,
  publicSignals,
  snarkjsProof,  // Use converted format
);
```

### 2. Why This Wasn't Caught Earlier

- **Proof generation** ([scripts/generate-proof.ts](../scripts/generate-proof.ts)) correctly adds z='1' coordinates for API transmission
- **Proof structure validation** ([src/zk-api/proof-verifier.service.ts:111](../src/zk-api/proof-verifier.service.ts#L111)) correctly validates 3-coordinate format
- **Standalone tests** convert the format correctly before verification
- **Integration tests** went through the API, which **did not** convert before calling snarkjs

This created a gap where the API layer accepted 3-coordinate proofs but didn't convert them for the underlying cryptographic library.

## Related Fixes

Several other issues were fixed as part of this debugging process:

### 1. N-0 Circuit Vulnerability (gamma = delta)
**Issue**: Original zkey had gamma = delta, indicating no phase 2 contribution
**Fix**: Regenerated zkey with proper trusted setup:
```bash
npx snarkjs groth16 setup circuits/build/api_credit_proof_test.r1cs \
  circuits/build/pot13_final_prepared.ptau \
  circuits/build/api_credit_proof_test_0000.zkey

echo "random entropy $(date)" | npx snarkjs zkey contribute \
  circuits/build/api_credit_proof_test_0000.zkey \
  circuits/build/api_credit_proof_test.zkey \
  --name="Test contribution"
```

### 2. Verification Key Mismatch
**Issue**: verification_key.json was out of sync with zkey file
**Fix**: Exported fresh verification key from current zkey:
```bash
npx snarkjs zkey export verificationkey \
  circuits/build/api_credit_proof_test.zkey \
  circuits/build/verification_key.json
```

### 3. Missing Z Coordinates in Proof Generation
**Issue**: Original generate-proof.ts only included [x, y] coordinates
**Fix**: Updated to include z='1' for projective coordinates

### 4. Bash Integer Truncation in Test Scripts
**Issue**: Test scripts converted field elements to decimal with `$((16#$HEX))`, truncating to 64-bit
**Fix**: Keep signals as hex strings throughout test scripts

### 5. Service Initialization
**Issue**: SnarkjsProofService.initialize() existed but was never called
**Fix**: Added OnModuleInit lifecycle hook to call initialize() automatically

## Verification

After the fix, all proofs verify correctly:

```bash
# Standalone test (always worked)
$ node scripts/test-proof-exact.js
✅ PROOF VALID

# Integration test (now works!)
$ pnpm test:zk
✅ All tests pass
```

## Files Modified

- [src/zk-api/snarkjs-proof.service.ts](../src/zk-api/snarkjs-proof.service.ts) - **CRITICAL FIX**: Added coordinate conversion
- [src/zk-api/snarkjs-proof.service.spec.ts](../src/zk-api/snarkjs-proof.service.spec.ts) - Updated tests for 3-coordinate format
- [src/zk-api/proof-verifier.service.spec.ts](../src/zk-api/proof-verifier.service.spec.ts) - Updated mock proofs to use 3 coordinates
- [scripts/generate-proof.ts](../scripts/generate-proof.ts) - Add z='1' to all proof points
- [scripts/test-complete-flow.sh](../scripts/test-complete-flow.sh) - Keep signals as hex strings
- [scripts/test-double-spend.sh](../scripts/test-double-spend.sh) - Keep signals as hex strings
- [src/zk-api/proof-verifier.service.ts](../src/zk-api/proof-verifier.service.ts) - Updated validation for 3-coordinate format

## Circuit Artifacts

- [circuits/build/api_credit_proof_test.zkey](../circuits/build/api_credit_proof_test.zkey) - Regenerated with proper phase 2
- [circuits/build/verification_key.json](../circuits/build/verification_key.json) - Re-exported from new zkey

Verification:
```bash
$ node -e "const vk = require('./circuits/build/verification_key.json'); console.log('gamma:', vk.vk_gamma_2[0][0].substring(0,10), '\\ndelta:', vk.vk_delta_2[0][0].substring(0,10))"
gamma: 1085704699
delta: 7665209890  # Different from gamma ✓
```

## Lessons Learned

1. **Coordinate System Mismatch**: Always verify the exact format expected by cryptographic libraries
2. **Integration vs Unit Tests**: Standalone tests can pass while integration fails due to missing conversion layers
3. **Field Element Handling**: Bash arithmetic is limited to 64-bit; use hex strings for 254-bit field elements
4. **Trusted Setup Validation**: Always verify gamma ≠ delta in verification keys (N-0 circuit vulnerability)
5. **Error Messages**: "snarkjs returned false" can indicate format issues, not just invalid proofs

## References

- [Groth16 Paper](https://eprint.iacr.org/2016/260.pdf) - Original Groth16 SNARK specification
- [snarkjs Documentation](https://github.com/iden3/snarkjs) - JavaScript SNARK library
- [BN254 Curve](https://neuromancer.sk/std/bn/bn254) - Elliptic curve used by Groth16
- [Circom Documentation](https://docs.circom.io/) - Circuit compiler
- [docs/ZK.md](./ZK.md) - Project ZK architecture documentation
