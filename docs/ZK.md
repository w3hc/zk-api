# Zero-Knowledge Proofs and Circuits

This document provides a comprehensive overview of the Zero-Knowledge (ZK) proof system and circuit implementation for the ZK API Credits project.

## Overview

The ZK API system enables privacy-preserving access to Claude API services using Zero-Knowledge proofs, Rate-Limit Nullifiers (RLN), and Ethereum smart contracts. Users deposit ETH once and make thousands of anonymous API calls without revealing their identity or linking requests together.

## Core Concepts

### Rate-Limit Nullifiers (RLN)

RLN is a cryptographic primitive that prevents double-spending while preserving privacy:

- **Nullifier**: A unique identifier for each request: `nullifier = Poseidon(a)` where `a = Poseidon(secretKey, ticketIndex)`
- **Signal**: A proof of authenticity: `y = secretKey + a * x` where `x = Poseidon(message)`
- **Double-Spend Detection**: If the same `ticketIndex` is reused with different messages, the secret key can be recovered algebraically

### Identity Commitment

Each user has a secret key `k` and generates an identity commitment:

```
ID = Poseidon(k)
```

This commitment is stored in the Merkle tree anonymity set on-chain, allowing users to prove membership without revealing their identity.

### Merkle Tree Anonymity Set

- **Structure**: 20 levels deep, supporting up to 1,048,576 identities
- **Hash Function**: Poseidon (ZK-friendly)
- **Storage**: On-chain root, off-chain tree construction
- **Purpose**: Enables privacy-preserving membership proofs

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Side                          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   │
│  │ Secret Key k │───▶│ ZK Prover    │───▶│ Proof π_req  │   │
│  │ Refund Tix   │   │ (Circom)     │   │ Nullifier    │   │
│  └──────────────┘   └──────────────┘   │ Signal (x,y) │   │
│                                         └──────┬───────┘   │
└────────────────────────────────────────────────┼───────────┘
                                                  │
                                                  │ HTTPS
                                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                     ZK API Server (NestJS)                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 1. Nullifier Check (Double-spend detection)         │   │
│  │    - NullifierStoreService                          │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 2. Proof Verification (Groth16 ZK-SNARK)            │   │
│  │    - ProofVerifierService                           │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 3. Execute Claude API Request                       │   │
│  │    - Anthropic SDK                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 4. Calculate Cost in ETH                            │   │
│  │    - EthRateOracleService (Kraken API)              │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 5. Issue Refund Ticket                              │   │
│  │    - RefundSignerService (EdDSA)                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                                │
                                │ Web3 RPC
                                ▼
┌─────────────────────────────────────────────────────────────┐
│              Ethereum Mainnet (Smart Contract)              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ZkApiCredits.sol                                    │   │
│  │  - deposit()         : Add funds + ID commitment    │   │
│  │  - withdraw()        : Reclaim unused funds         │   │
│  │  - redeemRefund()    : Claim refund tickets         │   │
│  │  - slashDoubleSpend(): Extract k, reward slasher    │   │
│  │  - slashPolicy()     : Burn policy stake            │   │
│  │  - Merkle Tree       : Identity anonymity set       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Status

### ✅ Completed: Real ZK Proof Verification

The ZK proof system now supports **cryptographically valid Groth16 SNARK verification** using snarkjs.

**Previous (Mock):** Only validated proof JSON structure
**Current (Real):** Full cryptographic verification with trusted setup

**Key Changes:**
- New [SnarkjsProofService](../src/zk-api/snarkjs-proof.service.ts) for real proof generation/verification
- Updated [ProofVerifierService](../src/zk-api/proof-verifier.service.ts) to use cryptographic verification
- Automated trusted setup script: `npm run setup:circuit`
- Falls back to mock mode if trusted setup not complete (dev-friendly)

**Files:**
- Test circuit: [circuits/api_credit_proof_test.circom](../circuits/api_credit_proof_test.circom) (~676 constraints)
- Production circuit: [circuits/api_credit_proof.circom](../circuits/api_credit_proof.circom) (~12K constraints)

## ZK Circuit Design

### Test Circuit (Current)

**File**: [circuits/api_credit_proof_test.circom](../circuits/api_credit_proof_test.circom)

A simplified circuit for development and testing:

**Inputs:**
- `secretKey` (private) - User's secret key
- `ticketIndex` (private) - Request ticket index
- `signalX` (public) - RLN signal X component
- `idCommitmentExpected` (public) - Expected identity commitment

**Outputs:**
- `nullifier` - Unique request nullifier
- `signalY` - RLN signal Y component
- `idCommitment` - Identity commitment

**Performance:**
- Constraints: ~676 non-linear
- Proving time: ~100-500ms
- Verification time: ~5-20ms

### Production Circuit

**File**: [circuits/api_credit_proof.circom](../circuits/api_credit_proof.circom)

The full circuit proves four key properties:

1. **Membership**: User's identity commitment is in the Merkle tree
2. **Refund Summation**: All refund tickets are valid (EdDSA signature verification)
3. **Solvency**: User has sufficient balance: `(ticketIndex + 1) × maxCost ≤ initialDeposit + totalRefunds`
4. **RLN**: Generates nullifier and signal for double-spend prevention

**Circuit Parameters**:
- `levels = 20`: Merkle tree depth (1,048,576 capacity)
- `maxRefunds = 100`: Maximum refund tickets per proof

**Inputs**:

```circom
// Private inputs
signal input secretKey;
signal input pathElements[levels];
signal input pathIndices[levels];
signal input refundValues[maxRefunds];
signal input refundSignatures[maxRefunds][3];  // [R8x, R8y, S]
signal input ticketIndex;

// Public inputs
signal input merkleRoot;
signal input maxCost;
signal input initialDeposit;
signal input signalX;
signal input serverPubKeyX;
signal input serverPubKeyY;

// Public outputs
signal output nullifier;
signal output signalY;
signal output idCommitment;
```

### Simplified Circuit

**File**: [circuits/api_credit_proof_simple.circom](../circuits/api_credit_proof_simple.circom)

A stripped-down version for testing that omits EdDSA signature verification, focusing on core RLN and solvency checks.

## Smart Contract

**File**: [contracts/src/ZkApiCredits.sol](../contracts/src/ZkApiCredits.sol)

Manages deposits, withdrawals, slashing, and the Merkle root.

**Key Functions**:

```solidity
// Deposit ETH and join anonymity set
function deposit(bytes32 idCommitment) external payable

// Withdraw unused funds
function withdraw(bytes32 idCommitment, address payable recipient, bytes32 secretKey) external

// Redeem refund tickets on-chain
function redeemRefund(
    bytes32 nullifier,
    uint256 value,
    uint256 timestamp,
    uint256[3] calldata signature
) external

// Slash double-spenders
function slashDoubleSpend(
    bytes32 secretKey,
    bytes32 nullifier,
    Signal calldata signal1,
    Signal calldata signal2
) external

// Slash policy violators (server-only)
function slashPolicyViolation(bytes32 nullifier, bytes32 idCommitment) external onlyOwner
```

**Dual Staking**:
- **RLN Stake**: Claimable by anyone who proves double-spending
- **Policy Stake**: Burned (not transferred) by server for ToS violations

## Backend Services

### Core Services

| Service | Purpose | Location |
|---------|---------|----------|
| **ZkApiService** | Main orchestrator for chat requests | [src/zk-api/zk-api.service.ts](../src/zk-api/zk-api.service.ts) |
| **ProofGenService** | RLN primitives (Poseidon, nullifier/signal generation) | [src/zk-api/proof-gen.service.ts](../src/zk-api/proof-gen.service.ts) |
| **ProofVerifierService** | ZK proof verification | [src/zk-api/proof-verifier.service.ts](../src/zk-api/proof-verifier.service.ts) |
| **ZKProofService** | Full snarkjs integration for Groth16 proofs | [src/zk-api/zkproof.service.ts](../src/zk-api/zkproof.service.ts) |
| **BlockchainService** | Ethers.js contract interface, Merkle tree sync | [src/zk-api/blockchain.service.ts](../src/zk-api/blockchain.service.ts) |
| **MerkleTreeService** | Off-chain Merkle tree with Poseidon hash | [src/zk-api/merkle-tree.service.ts](../src/zk-api/merkle-tree.service.ts) |
| **NullifierStoreService** | Tracks used nullifiers (SQLite persistent storage) | [src/zk-api/nullifier-store.service.ts](../src/zk-api/nullifier-store.service.ts) |
| **EthRateOracleService** | Fetches ETH/USD rates from Kraken | [src/zk-api/eth-rate-oracle.service.ts](../src/zk-api/eth-rate-oracle.service.ts) |
| **RefundSignerService** | Signs refund tickets with EdDSA | [src/zk-api/refund-signer.service.ts](../src/zk-api/refund-signer.service.ts) |

### API Endpoints

#### POST `/zk-api/chat`

Submit anonymous Claude API request with ZK proof.

**Request Body**:
```typescript
{
  messages: Array<{ role: string; content: string }>;
  proof: string;  // Groth16 proof (JSON)
  publicInputs: {
    merkleRoot: string;
    maxCost: string;
    initialDeposit: string;
    signalX: string;
    nullifier: string;
    signalY: string;
    idCommitment: string;
  };
  model?: string;  // claude-opus-4.6, claude-sonnet-4.6, claude-haiku-4.5
  maxTokens?: number;
}
```

**Response**:
```typescript
{
  response: string;         // Claude API response
  actualCost: string;       // Actual cost in wei
  refundTicket: {
    nullifier: string;
    value: string;          // Refund amount in wei
    timestamp: number;
    signature: {
      R8x: string;
      R8y: string;
      S: string;
    }
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
  }
}
```

#### GET `/zk-api/server-pubkey`

Get server's EdDSA public key for refund signature verification.

#### GET `/zk-api/merkle-root`

Get current Merkle root from on-chain contract.

## Protocol Flow

### 1. Registration (One-time)

```typescript
// Client-side
const secretKey = generateRandomKey();
const idCommitment = poseidon([secretKey]);

// On-chain
await zkApiCredits.deposit(idCommitment, { value: parseEther('0.01') });
```

### 2. Making Requests (Repeatable)

```typescript
// Generate proof
const proof = await generateProof({
  secretKey,
  merkleProof: await contract.getMerkleProof(idCommitment),
  refundTickets: previousRefunds,
  ticketIndex: nextIndex,
  maxCost: parseEther('0.001')
});

// Compute RLN signal
const a = poseidon([secretKey, ticketIndex]);
const nullifier = poseidon([a]);
const x = poseidon([payload]);
const y = secretKey + a * x;

// Submit request
const response = await fetch('/zk-api/chat', {
  method: 'POST',
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'What does 苟全性命於亂世，不求聞達於諸侯。mean?' }],
    proof,
    publicInputs: { merkleRoot, maxCost, signalX: x, nullifier, signalY: y, ... }
  })
});

// Store refund ticket
refundTickets.push(response.refundTicket);
ticketIndex++;
```

### 3. Double-Spend Detection

If a user reuses the same `ticketIndex` with different messages:

```typescript
// Server detects: same nullifier, different signal x
const signal1 = { x: x1, y: y1 };
const signal2 = { x: x2, y: y2 };  // x2 ≠ x1

// Extract secret key: k = (y1*x2 - y2*x1) / (x2 - x1)
const k = (y1 * x2 - y2 * x1) / (x2 - x1);

// Submit to smart contract
await zkApiCredits.slashDoubleSpend(k, nullifier, signal1, signal2);
```

## Cryptographic Primitives

### Poseidon Hash Function

Used for all hash operations in the ZK circuit:

```typescript
import { buildPoseidon } from 'circomlibjs';
const poseidon = await buildPoseidon();
const hash = poseidon([input1, input2, ...]);
```

### EdDSA Signatures

Used for refund ticket signing:

```typescript
import { buildEddsa, buildBabyjub } from 'circomlibjs';

const eddsa = await buildEddsa();
const babyJub = await buildBabyjub();

// Sign
const signature = eddsa.signPoseidon(privateKey, message);

// Verify
const isValid = eddsa.verifyPoseidon(message, signature, publicKey);
```

### Field Arithmetic

All operations occur in a finite field:

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

## Cost Calculation

### Claude API Pricing (March 2026)

| Model | Input ($/M tokens) | Output ($/M tokens) |
|-------|-------------------|---------------------|
| claude-opus-4.6 | $5 | $25 |
| claude-sonnet-4.6 | $3 | $15 |
| claude-haiku-4.5 | $1 | $5 |

### ETH Conversion

```typescript
async function calculateCostInETH(
  inputTokens: number,
  outputTokens: number,
  model: string
): Promise<bigint> {
  const pricing = CLAUDE_PRICING[model];
  const costUSD = (inputTokens / 1_000_000) * pricing.input
                + (outputTokens / 1_000_000) * pricing.output;

  const ethUsdRate = await getEthUsdRate();  // From Kraken API
  const costETH = costUSD / ethUsdRate;

  return BigInt(Math.ceil(costETH * 1e18));  // Convert to wei
}
```

### Example Costs

Assuming ETH = $2,000:

| Scenario | Input Tokens | Output Tokens | Model | Cost (USD) | Cost (ETH) |
|----------|--------------|---------------|-------|------------|------------|
| Simple Q&A | 100 | 400 | Opus 4.6 | $0.0105 | 0.00000525 |
| Code Generation | 500 | 2000 | Sonnet 4.6 | $0.0465 | 0.00002325 |
| Document Analysis | 10,000 | 1,000 | Haiku 4.5 | $0.015 | 0.0000075 |

## Security Considerations

1. **Secret Key Protection**: Users must never reveal their secret key `k`
2. **Signal Randomness**: Each `signalX` must be cryptographically random
3. **Nullifier Uniqueness**: Each ticket index can only be used once
4. **Merkle Proof Freshness**: Clients must use current on-chain Merkle root
5. **Proof Replay**: Nullifiers are tracked on-chain to prevent replay attacks
6. **Server Accountability**: Policy stake is burned (not claimed) to prevent profit from false bans

## Privacy Guarantees

- ✅ **Identity Privacy**: Requests cannot be linked to identity commitment
- ✅ **Request Unlinkability**: Each request uses unique nullifier
- ✅ **Balance Privacy**: ZK proof hides actual balance
- ✅ **Cryptographic Enforcement**: No trusted parties required
- ✅ **Anonymity Set**: Users are indistinguishable within all depositors

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- zk-api.service.spec.ts

# Run with coverage
npm test -- --coverage
```

### Integration Tests

Test the full proof generation and verification flow:

```bash
npx ts-node scripts/test-proof-verification.ts
```

### Circuit Compilation

```bash
cd circuits
circom api_credit_proof.circom --r1cs --wasm --sym
```

## Production Readiness

### ✅ Completed

- [x] ZK circuit design (Circom)
- [x] Smart contract (Solidity)
- [x] Backend services (NestJS)
- [x] API endpoints
- [x] Unit tests (267 tests passing)
- [x] Documentation
- [x] ETH/USD oracle integration
- [x] Refund ticket signing (EdDSA)
- [x] RLN cryptographic primitives
- [x] Merkle tree service
- [x] Blockchain service
- [x] Anthropic SDK integration

### ⚠️ TODO for Production

- [ ] Complete trusted setup ceremony (Powers of Tau, proving/verification keys)
- [x] Replace in-memory nullifier store with persistent database (SQLite)
- [ ] Implement proper key management (HSM/KMS) for EdDSA signing key
- [ ] Add event listener for on-chain Deposit events
- [ ] Deploy contract to testnet/mainnet
- [ ] Security audit (contract + circuit + backend)
- [ ] Rate limiting per IP/nullifier
- [ ] Monitoring and alerting for double-spend attempts
- [ ] Gas optimization
- [ ] MEV protection for slashing transactions

## References

- [ZK API Credits Proposal](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) - Davide Crapis & Vitalik Buterin
- [Rate-Limit Nullifiers Documentation](https://rate-limiting-nullifier.github.io/rln-docs/)
- [Circom Documentation](https://docs.circom.io/)
- [SnarkJS](https://github.com/iden3/snarkjs)
- [Poseidon Hash](https://www.poseidon-hash.info/)
- [Anthropic API Pricing](https://www.anthropic.com/api)
- [Kraken API](https://docs.kraken.com/api/)

## License

GPL-3.0
