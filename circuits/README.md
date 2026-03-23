# ZK Circuit for API Credits

This directory contains the Circom implementation of the Zero-Knowledge circuit for privacy-preserving API access using Rate-Limit Nullifiers (RLN).

## Overview

The circuit proves four key properties without revealing the user's identity:

1. **Membership**: User's identity commitment is in the Merkle tree (part of anonymity set)
2. **Refund Summation**: All refund tickets are validly signed by the server
3. **Solvency**: User has sufficient balance for the current request
4. **RLN**: Generates nullifier and signal for double-spend detection

## Circuit Parameters

- **levels**: Merkle tree depth (default: 20, supports up to 2^20 = ~1M users)
- **maxRefunds**: Maximum number of refund tickets (default: 100)

## Setup

### Prerequisites

```bash
# Install Circom compiler
curl -sSL https://circom.io/install.sh | bash

# Install snarkjs
npm install -g snarkjs

# Install circomlib
npm install circomlib
```

### Compile Circuit

```bash
# Compile to R1CS format
circom api_credit_proof.circom --r1cs --wasm --sym

# Generate witness
node api_credit_proof_js/generate_witness.js api_credit_proof_js/api_credit_proof.wasm input.json witness.wtns

# Powers of Tau ceremony (one-time setup)
snarkjs powersoftau new bn128 17 pot17_0000.ptau -v
snarkjs powersoftau contribute pot17_0000.ptau pot17_0001.ptau --name="First contribution" -v
snarkjs powersoftau prepare phase2 pot17_0001.ptau pot17_final.ptau -v

# Generate proving and verification keys
snarkjs groth16 setup api_credit_proof.r1cs pot17_final.ptau api_credit_proof_0000.zkey
snarkjs zkey contribute api_credit_proof_0000.zkey api_credit_proof_final.zkey --name="1st Contributor" -v
snarkjs zkey export verificationkey api_credit_proof_final.zkey verification_key.json

# Generate Solidity verifier
snarkjs zkey export solidityverifier api_credit_proof_final.zkey ZkApiVerifier.sol
```

## Input Format

```json
{
  "secretKey": "0x1234...",
  "pathElements": ["0x...", "0x...", ...],
  "pathIndices": [0, 1, 0, ...],
  "refundValues": [1000, 2000, ...],
  "refundSignaturesR8x": ["0x...", "0x...", ...],
  "refundSignaturesR8y": ["0x...", "0x...", ...],
  "refundSignaturesS": ["0x...", "0x...", ...],
  "ticketIndex": 5,
  "numRefunds": 2,
  "merkleRoot": "0x...",
  "maxCost": 10000,
  "initialDeposit": 100000,
  "signalX": "0x...",
  "serverPubKeyX": "0x...",
  "serverPubKeyY": "0x..."
}
```

## Output Format

```json
{
  "nullifier": "0x...",
  "signalY": "0x...",
  "idCommitment": "0x..."
}
```

## Testing

```bash
# Create test input
echo '{
  "secretKey": "123456",
  "pathElements": [...],
  "pathIndices": [...],
  ...
}' > input.json

# Generate witness
node api_credit_proof_js/generate_witness.js api_credit_proof_js/api_credit_proof.wasm input.json witness.wtns

# Generate proof
snarkjs groth16 prove api_credit_proof_final.zkey witness.wtns proof.json public.json

# Verify proof
snarkjs groth16 verify verification_key.json public.json proof.json
```

## Security Considerations

1. **Trusted Setup**: The Powers of Tau ceremony must be done securely
2. **Circuit Auditing**: The circuit should be audited before mainnet deployment
3. **Nullifier Uniqueness**: Each ticket index must generate a unique nullifier
4. **Signal Extraction**: Double-spending reveals the secret key through RLN math

## Integration

The generated verifier contract (`ZkApiVerifier.sol`) should be deployed on-chain and called by the `ZkApiCredits` contract to verify proofs.

## References

- [Circom Documentation](https://docs.circom.io/)
- [snarkjs Documentation](https://github.com/iden3/snarkjs)
- [Rate-Limit Nullifiers](https://rate-limiting-nullifier.github.io/rln-docs/)
- [ZK API Credits Proposal](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104)
