# ZK Proof Verification Implementation

## Overview

This document describes the zero-knowledge proof system implemented for the ZK API. The system uses **Groth16 ZK-SNARKs** with **Rate-Limit Nullifiers (RLN)** to provide privacy-preserving API access with double-spend protection.

## Architecture

### Core Components

1. **ProofGenService** ([src/zk-api/proof-gen.service.ts](../src/zk-api/proof-gen.service.ts))
   - Generates identity commitments using Poseidon hash
   - Creates RLN nullifiers and signals
   - Implements double-spend detection (secret key recovery from two signals)
   - Generates mock Groth16 proofs for development

2. **ProofVerifierService** ([src/zk-api/proof-verifier.service.ts](../src/zk-api/proof-verifier.service.ts))
   - Verifies proof structure (Groth16 format validation)
   - Validates public inputs against blockchain state
   - Checks nullifier slashing status
   - Verifies Merkle root matches on-chain state

3. **ZKProofService** ([src/zk-api/zkproof.service.ts](../src/zk-api/zkproof.service.ts))
   - Full snarkjs integration (currently unused - for future production use)
   - Would handle real ZK-SNARK proof generation and verification
   - Exports Solidity verifier contracts

4. **Client Scripts**
   - `scripts/generate-proof.ts` - CLI tool for generating proofs
   - `scripts/test-proof-verification.ts` - Test suite for cryptographic primitives

## Cryptographic Primitives

### Poseidon Hash Function

Used for all hash operations in the ZK circuit:

```typescript
import { buildPoseidon } from 'circomlibjs';
const poseidon = await buildPoseidon();
const hash = poseidon([input1, input2, ...]);
```

### Identity Commitment

Each user has a secret key `k` and generates an identity commitment:

```
ID = Poseidon(k)
```

This commitment is stored in the Merkle tree anonymity set on-chain.

### RLN (Rate-Limit Nullifier)

For each API request with ticket index `i` and signal `x`:

1. Compute intermediate value: `a = Poseidon(k, i)`
2. Generate nullifier: `nullifier = Poseidon(a)`
3. Generate signal: `y = k + a * x`

**Public outputs**: `(nullifier, y, ID)`
**Private inputs**: `(k, i)`
**Public inputs**: `(x, merkleRoot, maxCost, initialDeposit)`

### Double-Spend Detection

If a user reuses the same ticket index `i` with different signals `x₁` and `x₂`:

```
y₁ = k + a * x₁
y₂ = k + a * x₂
```

Anyone can recover the secret key:

```
k = (x₂*y₁ - x₁*y₂) / (x₂ - x₁)
```

This allows slashing of the user's RLN stake.

## Implementation Details

### Proof Generation

```typescript
const { proof, publicInputs } = await proofGenService.generateMockProof({
  secretKey: BigInt(12345),
  ticketIndex: BigInt(0),
  signalX: BigInt(randomValue),
  merkleRoot: '0x...',
  maxCost: '1000000000000000',
  initialDeposit: '100000000000000000'
});
```

**Proof Structure** (Groth16):
```json
{
  "pi_a": [point_x, point_y],
  "pi_b": [[x1, x2], [y1, y2]],
  "pi_c": [point_x, point_y],
  "protocol": "groth16"
}
```

**Public Inputs**:
```json
{
  "merkleRoot": "0x...",
  "maxCost": "1000000000000000",
  "initialDeposit": "100000000000000000",
  "signalX": "0x...",
  "nullifier": "0x...",
  "signalY": "0x...",
  "idCommitment": "0x..."
}
```

### Proof Verification

The verification process includes:

1. **Structural Validation**
   - Check proof is valid Groth16 format
   - Validate all required fields present

2. **Blockchain State Verification**
   - Verify Merkle root matches on-chain state
   - Check nullifier hasn't been slashed
   - Ensure user's deposit is still active

3. **Cryptographic Verification** (production only)
   - Use snarkjs to verify proof against verification key
   - Validate public inputs match proof outputs

### Field Arithmetic

The Poseidon hash operates over a finite field. When performing arithmetic:

```typescript
const F = poseidon.F;

// Convert to field element
const aF = F.e(a);
const bF = F.e(b);

// Perform operation
const result = F.add(aF, F.mul(bF, cF));

// Convert back to bigint
const output = F.toObject(result);
```

## Circuit Design

Located in `circuits/api_credit_proof_simple.circom`:

```circom
template ApiCreditProofSimple(levels) {
    // Private inputs
    signal input secretKey;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal input ticketIndex;

    // Public inputs
    signal input merkleRoot;
    signal input maxCost;
    signal input initialDeposit;
    signal input signalX;

    // Public outputs
    signal output nullifier;
    signal output signalY;
    signal output idCommitment;

    // Circuit logic...
}
```

## Usage

### Server-Side (API)

The proof verification happens automatically when clients make requests:

```typescript
// In ZkApiController
const result = await this.zkApiService.chat(dto);
```

The service verifies:
- Proof structure is valid
- Nullifier hasn't been seen before
- Public inputs match blockchain state
- User has sufficient balance

### Client-Side

Generate a proof using the CLI tool:

```bash
npx ts-node scripts/generate-proof.ts 12345 0
```

This outputs a proof and public inputs that can be used in API requests:

```bash
curl -X POST http://localhost:3000/zk-api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "proof": "...",
    "publicInputs": {
      "merkleRoot": "0x...",
      "maxCost": "1000000000000000",
      ...
    },
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Testing

### Unit Tests

All services have comprehensive test coverage:

```bash
pnpm test
```

### Integration Tests

Test the full proof generation and verification flow:

```bash
npx ts-node scripts/test-proof-verification.ts
```

Expected output:
```
🧪 Testing ZK Proof Generation and Verification

1️⃣ Generating Identity Commitment...
   ✅ ID Commitment: 0x096f56a93ef8bcf4f...

2️⃣ Generating RLN Signal...
   ✅ a: 540663689097534992617434090946771...
   ✅ Nullifier: 0x1831d7fcdedf8c37a368b4f7...
   ✅ Signal Y: 3318490649409698453384355...

3️⃣ Testing Double-Spend Detection...
   ✅ Recovered Secret Key: 12345
   ✅ Original Secret Key: 12345
   ✅ Match: true

✅ All tests passed!
```

## Production Deployment

### Current Status (Development)

- ✅ Proof structure validation
- ✅ RLN cryptographic primitives
- ✅ Double-spend detection
- ✅ Blockchain state verification
- ✅ Mock proof generation

### TODO for Production

- ❌ Real Groth16 proof generation (requires trusted setup)
- ❌ Solidity verifier contract deployment
- ❌ On-chain proof verification
- ❌ Merkle tree witness generation
- ❌ Refund signature verification in circuit

### Trusted Setup

For production, a trusted setup ceremony is required:

```bash
# 1. Compile circuit
npx circom circuits/api_credit_proof.circom --r1cs --wasm --sym

# 2. Download powers of tau
npx snarkjs powersoftau new bn128 14 pot14_0000.ptau

# 3. Contribute to ceremony
npx snarkjs powersoftau contribute pot14_0000.ptau pot14_0001.ptau

# 4. Prepare phase 2
npx snarkjs powersoftau prepare phase2 pot14_0001.ptau pot14_final.ptau

# 5. Generate proving key
npx snarkjs groth16 setup api_credit_proof.r1cs pot14_final.ptau proof_0000.zkey

# 6. Export verification key
npx snarkjs zkey export verificationkey proof_final.zkey verification_key.json

# 7. Generate Solidity verifier
npx snarkjs zkey export solidityverifier proof_final.zkey Verifier.sol
```

## Security Considerations

1. **Secret Key Protection**: Users must never reveal their secret key `k`
2. **Signal Randomness**: Each `signalX` must be cryptographically random
3. **Nullifier Uniqueness**: Each ticket index can only be used once
4. **Merkle Proof Freshness**: Clients must use current on-chain Merkle root
5. **Proof Replay**: Nullifiers are tracked on-chain to prevent replay

## References

- [Ethresear.ch Proposal](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104)
- [RLN (Rate-Limit Nullifiers)](https://rate-limiting-nullifier.github.io/rln-docs/)
- [Circom Documentation](https://docs.circom.io/)
- [SnarkJS](https://github.com/iden3/snarkjs)
- [Poseidon Hash](https://www.poseidon-hash.info/)
