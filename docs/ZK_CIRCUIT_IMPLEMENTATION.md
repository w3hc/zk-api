# ZK Circuit Implementation Summary

This document provides an overview of the Zero-Knowledge Circuit implementation for the ZK API Credits system.

## Implementation Status

✅ **Completed Components:**

1. **ZK Circuit (Circom)** - `circuits/api_credit_proof.circom`
2. **Smart Contract** - `contracts/src/ZkApiCredits.sol`
3. **NestJS Backend Services**:
   - Nullifier tracking (`nullifier-store.service.ts`)
   - Proof verification (`proof-verifier.service.ts`)
   - ETH/USD rate oracle (`eth-rate-oracle.service.ts`)
   - Refund signing (`refund-signer.service.ts`)
   - Main API service (`zk-api.service.ts`)
4. **API Endpoints** - `zk-api.controller.ts`
5. **DTOs and Module** - Complete integration

## Architecture Overview

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
│  │ 2. Proof Verification (ZK-STARK)                    │   │
│  │    - ProofVerifierService                           │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 3. Execute Claude API Request                       │   │
│  │    - Anthropic SDK (to be integrated)               │   │
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
│  │  - slashDoubleSpend(): Extract k, reward slasher    │   │
│  │  - slashPolicy()     : Burn policy stake            │   │
│  │  - Merkle Tree       : Identity anonymity set       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Key Files and Their Purpose

### ZK Circuit Layer

| File | Purpose |
|------|---------|
| `circuits/api_credit_proof.circom` | Main ZK circuit proving membership, refund summation, solvency, and RLN |
| `circuits/README.md` | Circuit setup and compilation instructions |

**Circuit Inputs:**
- **Private**: `secretKey`, Merkle proof, refund tickets, ticket index
- **Public**: `merkleRoot`, `maxCost`, `initialDeposit`, `signalX`, server public key

**Circuit Outputs:**
- `nullifier`: Prevents double-spending
- `signalY`: Part of RLN signal (reveals `k` if reused)
- `idCommitment`: User's anonymous identity

### Smart Contract Layer

| File | Purpose |
|------|---------|
| `contracts/src/ZkApiCredits.sol` | On-chain deposit management, Merkle tree, slashing |

**Key Functions:**
- `deposit(idCommitment)`: User deposits ETH, gets added to anonymity set
- `withdraw(idCommitment, recipient, secretKey)`: Reclaim unused funds
- `slashDoubleSpend(secretKey, signals)`: Punish double-spenders, reward slasher
- `slashPolicyViolation(nullifier, idCommitment)`: Burn policy stake (server-only)

### Backend Services Layer

| File | Purpose |
|------|---------|
| `zk-api/zk-api.service.ts` | Main orchestrator for request handling |
| `zk-api/nullifier-store.service.ts` | In-memory nullifier tracking (Redis in production) |
| `zk-api/proof-verifier.service.ts` | ZK proof verification (placeholder for now) |
| `zk-api/eth-rate-oracle.service.ts` | Fetches ETH/USD from Kraken, converts costs |
| `zk-api/refund-signer.service.ts` | Signs refund tickets with EdDSA |

### API Layer

| File | Purpose |
|------|---------|
| `zk-api/zk-api.controller.ts` | HTTP endpoints for ZK API requests |
| `zk-api/dto/api-request.dto.ts` | Request validation (payload, nullifier, signal, proof) |
| `zk-api/dto/api-response.dto.ts` | Response format (Claude response, refund ticket) |
| `zk-api/zk-api.module.ts` | NestJS module wiring |

## API Endpoints

### POST `/zk-api/request`

Submit anonymous API request with ZK proof.

**Request Body:**
```typescript
{
  payload: string;          // User's prompt for Claude
  nullifier: string;        // RLN nullifier (hex)
  signal: {
    x: string;              // RLN signal x
    y: string;              // RLN signal y
  };
  proof: string;            // ZK-STARK proof (hex)
  maxCost: string;          // Maximum cost in wei
  model?: string;           // Claude model (default: claude-sonnet-4.6)
}
```

**Response:**
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

**Status Codes:**
- `200`: Success
- `401`: Invalid ZK proof
- `403`: Double-spend detected or nullifier already used

### GET `/zk-api/server-pubkey`

Get server's EdDSA public key for signature verification.

**Response:**
```typescript
{
  x: string;  // Public key x coordinate
  y: string;  // Public key y coordinate
}
```

## Protocol Flow

### 1. User Registration (One-time)

```typescript
// Client-side
const secretKey = generateRandomKey();
const idCommitment = hash(secretKey);

// On-chain
await zkApiCredits.deposit(idCommitment, { value: parseEther('0.01') });
// User is now part of the anonymity set
```

### 2. Making API Requests (Repeatable)

```typescript
// Client generates proof
const proof = await generateProof({
  secretKey,
  merkleProof: await contract.getMerkleProof(idCommitment),
  refundTickets: previousRefunds,
  ticketIndex: nextIndex,
  maxCost: parseEther('0.001')
});

// Client computes RLN signal
const a = hash(secretKey, ticketIndex);
const nullifier = hash(a);
const x = hash(payload);
const y = secretKey + a * x;

// Submit to API
const response = await fetch('/zk-api/request', {
  method: 'POST',
  body: JSON.stringify({
    payload: "What is quantum computing?",
    nullifier,
    signal: { x, y },
    proof,
    maxCost: parseEther('0.001')
  })
});

// Store refund ticket for next request
refundTickets.push(response.refundTicket);
ticketIndex++;
```

### 3. Double-Spend Detection

If user reuses ticket index with different payload:

```typescript
// Server detects: same nullifier, different signal x
const signal1 = { x: x1, y: y1 };  // From first request
const signal2 = { x: x2, y: y2 };  // From second request (x2 ≠ x1)

// Extract secret key: k = (y1*x2 - y2*x1) / (x2 - x1)
const k = (y1 * x2 - y2 * x1) / (x2 - x1);

// Submit to smart contract
await zkApiCredits.slashDoubleSpend(k, nullifier, signal1, signal2);
// Slasher receives user's RLN stake as reward
```

## Claude API Pricing (March 2026)

| Model | Input ($/M tokens) | Output ($/M tokens) |
|-------|-------------------|---------------------|
| claude-opus-4.6 | $5 | $25 |
| claude-sonnet-4.6 | $3 | $15 |
| claude-haiku-4.5 | $1 | $5 |

**Example Cost Calculation:**
```typescript
// Request: 1000 input tokens, 500 output tokens on Sonnet
// Cost in USD: (1000/1M × $3) + (500/1M × $15) = $0.0105
// ETH price: $2000
// Cost in ETH: 0.0105 / 2000 = 0.00000525 ETH = 5,250,000,000,000 wei
```

## Testing

```bash
# Run unit tests
npm test

# Run specific test suite
npm test -- zk-api.service.spec.ts

# Run with coverage
npm run test:cov

# Build project
npm run build
```

## Production Readiness Checklist

⚠️ **Items to complete before production:**

1. **ZK Proof Verification**
   - [ ] Integrate actual ZK proof library (snarkjs/Cairo/Noir)
   - [ ] Deploy and test proof verification on-chain
   - [ ] Run trusted setup ceremony for circuit

2. **Anthropic API Integration**
   - [ ] Install `@anthropic-ai/sdk`
   - [ ] Replace mock Claude API calls with real SDK
   - [ ] Add API key management

3. **EdDSA Signing**
   - [ ] Replace placeholder EdDSA with `@noble/curves` or `circomlibjs`
   - [ ] Secure private key storage (HSM/KMS)
   - [ ] Implement key rotation

4. **Persistence**
   - [ ] Replace in-memory nullifier store with Redis/PostgreSQL
   - [ ] Add database migrations
   - [ ] Implement nullifier expiration

5. **Smart Contract**
   - [ ] Audit contract security
   - [ ] Optimize gas costs
   - [ ] Deploy to testnet/mainnet
   - [ ] Use proper Merkle tree library (e.g., OpenZeppelin)

6. **Security**
   - [ ] Rate limiting per nullifier
   - [ ] DoS protection
   - [ ] MEV considerations
   - [ ] Audit entire system

7. **Monitoring**
   - [ ] Logging for double-spend attempts
   - [ ] Metrics for API usage
   - [ ] Alerting for anomalies

## References

- [ZK API Credits Proposal](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104)
- [Rate-Limit Nullifiers Documentation](https://rate-limiting-nullifier.github.io/rln-docs/)
- [Circom Documentation](https://docs.circom.io/)
- [Anthropic API Pricing](https://www.anthropic.com/api)
- [Kraken API](https://docs.kraken.com/api/)

## License

GPL-3.0
