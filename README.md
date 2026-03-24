# ZK API

**Privacy-preserving Claude API access using Zero-Knowledge proofs and Rate-Limit Nullifiers**

ZK API enables anonymous access to Claude's AI models through a prepaid credit system backed by Ethereum smart contracts. Users deposit ETH once and make thousands of anonymous API requests without revealing their identity or linking requests together, using ZK-SNARK proofs and Rate-Limit Nullifiers (RLN).

See the [ZK API Usage Credits: LLMs and Beyond](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) original proposal on Ethresear.ch for more details.

## Overview

### Key Features

- **Anonymous API Requests** - Use Claude AI without linking requests to your identity
- **Zero-Knowledge Proofs** - Groth16 ZK-SNARKs prove solvency without revealing balance
- **Rate-Limit Nullifiers (RLN)** - Cryptographic primitive prevents double-spending while preserving privacy
- **TEE Deployment** - Runs in Trusted Execution Environments (AMD SEV-SNP, Intel TDX, AWS Nitro, Phala Network)
- **Automatic Refunds** - Overpayment is refunded with cryptographically signed tickets
- **Ethereum Integration** - Smart contract manages deposits, withdrawals, and slashing
- **Double-Spend Protection** - Reusing tickets reveals your secret key and triggers automatic slashing
- **Post-Quantum Encryption** - ML-KEM (CRYSTALS-Kyber) protects long-term secrets

### How It Works

1. **Deposit**: User deposits ETH to the smart contract with an anonymous identity commitment
2. **Prove**: For each API request, user generates a ZK proof of solvency
3. **Request**: Server verifies the proof and executes the Claude API request
4. **Refund**: Server returns a signed refund ticket for the unused portion
5. **Redeem**: User redeems accumulated refund tickets on-chain

### Privacy Guarantees

- **Identity Privacy** - Requests cannot be linked to your identity commitment
- **Request Unlinkability** - Each request uses a unique nullifier
- **Balance Privacy** - ZK proofs hide your actual balance
- **Cryptographic Enforcement** - No trusted parties required
- **Anonymity Set** - You're indistinguishable within all depositors
- **TEE Isolation** - Server operator cannot read memory or observe request contents
- **Cryptographic Unlinkability** - Even the TEE code cannot link payments to requests

### Why TEE + ZK?

**The critique**: "Session tokens are simpler—why use ZK?"

**The answer**: ZK API runs in a TEE. The combination provides cryptographic guarantees that session-based systems cannot:

| Approach | Server Can Track? | Regulator Can Compel? | Quantum Secure? |
|----------|------------------|----------------------|-----------------|
| **Session Tokens** | Yes (chooses not to) | Yes | No |
| **TEE Only** | No (encrypted memory) | Yes (code can link) | No |
| **TEE + ZK** | No (encrypted memory) | **No (cryptographically impossible)** | No |
| **TEE + ZK + ML-KEM** | No | No | **Yes** |

When regulators demand "show us who paid for request X", the system **mathematically cannot answer**—the linkage is cryptographically destroyed, not just policy-protected.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 10.23+
- For production: Ethereum wallet with ETH

### Local Development

```bash
# Clone the repository
git clone https://github.com/w3hc/zk-api.git
cd zk-api

# Install dependencies
pnpm install

# Install Foundry contract deps
forge install

# Setup environment
cp .env.template .env.local

# Generate TLS certificates
mkdir -p secrets
openssl req -x509 -newkey rsa:4096 \
  -keyout secrets/tls.key \
  -out secrets/tls.cert \
  -days 365 -nodes \
  -subj "/CN=localhost"

# Generate EdDSA keypair for refund signing
pnpm ts-node scripts/generate-admin-keypair.ts
# Copy the output keys to your .env.local file

# Start development server
pnpm start:dev
```

The API will be available at `https://localhost:3000` (accept the self-signed certificate warning).

### Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:cov

# Test ZK proof generation and verification
pnpm ts-node scripts/test-proof-verification.ts

# Test full API request flow
pnpm ts-node scripts/test-api-request.ts
```

## Flow

### One-Time Setup

```typescript
import { buildPoseidon } from 'circomlibjs';

// Generate secret key
const secretKey = generateRandomKey();

// Create identity commitment
const poseidon = await buildPoseidon();
const idCommitment = poseidon([secretKey]);

// Deposit to smart contract
await zkApiCredits.deposit(idCommitment, {
  value: ethers.parseEther('0.01')
});
```

### Making Requests

```typescript
// Generate ZK proof
const proof = await generateProof({
  secretKey,
  merkleProof: await getMerkleProof(idCommitment),
  refundTickets: previousRefunds,
  ticketIndex: currentIndex,
  maxCost: ethers.parseEther('0.001')
});

// Compute RLN signal
const a = poseidon([secretKey, ticketIndex]);
const nullifier = poseidon([a]);
const x = poseidon([payload]);
const y = secretKey + a * x;

// Submit request
const response = await fetch('/zk-api/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    payload: 'What does 苟全性命於亂世，不求聞達於諸侯。mean?',
    proof: proof,
    nullifier: nullifier.toString(),
    signal: { x: x.toString(), y: y.toString() },
    maxCost: ethers.parseEther('0.001').toString()
  })
});

// Store refund ticket for next request
const { refundTicket } = await response.json();
refundTickets.push(refundTicket);
```

### Redeeming Refunds

```typescript
// Redeem accumulated refunds on-chain
await zkApiCredits.redeemRefund(
  idCommitment,
  refundTicket.nullifier,
  refundTicket.value,
  refundTicket.timestamp,
  refundTicket.signature,
  recipientAddress
);
```

## Components

### ZK Circuit ([circuits/api_credit_proof.circom](circuits/api_credit_proof.circom))

Proves four properties:
1. **Membership**: User's identity is in the Merkle tree
2. **Refund Validity**: All refund tickets have valid EdDSA signatures
3. **Solvency**: User has sufficient balance for this request
4. **RLN**: Generates unique nullifier and signal for double-spend prevention

### Smart Contract ([contracts/src/ZkApiCredits.sol](contracts/src/ZkApiCredits.sol))

- **Dual Staking**: 50% RLN stake (claimed by double-spend provers) + 50% policy stake (burned for ToS violations)
- **Merkle Tree**: Maintains anonymity set of all depositors
- **Slashing**: Automatic punishment for double-spending
- **Refund Redemption**: On-chain verification of server-signed refund tickets

### Backend Services

| Service | Purpose |
|---------|---------|
| **ZkApiService** | Main request orchestrator |
| **ProofVerifierService** | Groth16 ZK proof verification (real crypto + fallback) |
| **SnarkjsProofService** | ✨ **NEW**: Real snarkjs cryptographic verification |
| **NullifierStoreService** | SQLite persistent store for double-spend detection |
| **EthRateOracleService** | ETH/USD conversion (Kraken API) |
| **RefundSignerService** | EdDSA refund ticket signing |
| **BlockchainService** | Ethereum contract interaction |
| **MerkleTreeService** | Off-chain Merkle tree sync |

## Documentation

### Setup & Deployment

- [Local Setup](docs/LOCAL_SETUP.md) - Run without Docker (development only)
- [Docker Setup](docs/DOCKER.md) - Docker development environment
- [**TEE Deployment**](docs/TEE_SETUP.md) - Deploy to AMD SEV-SNP, Intel TDX, AWS Nitro, or Phala Network (**recommended for production**)
- [Phala Config](docs/PHALA_CONFIG.md) - Phala Cloud specific configuration

### API & Usage

- [**API Reference**](docs/API_REFERENCE.md) - Complete REST API documentation with App endpoints
- [**ZK System Guide**](docs/ZK.md) - Zero-Knowledge proofs and circuits (**✨ Updated: Real verification implemented**)
- [**ZK Proof Completion**](README_ZK_PROOF_COMPLETION.md) - Implementation summary and status
- [Testing Guide](docs/TESTING_GUIDE.md) - Test procedures

### Architecture

- [Overview](docs/OVERVIEW.md) - System architecture and design
- [**SQLite Database**](docs/SQLITE3.md) - Persistent storage, privacy design, and implementation
- [**Trusted Setup Ceremony**](docs/TRUSTED_SETUP_CEREMONY.md) - Powers of Tau generation (**✨ Automated setup available**)

## Cost Calculation

### Claude API Pricing

| Model | Input ($/M tokens) | Output ($/M tokens) |
|-------|-------------------|---------------------|
| claude-opus-4.6 | $5 | $25 |
| claude-sonnet-4.6 | $3 | $15 |
| claude-haiku-4.5 | $1 | $5 |

### Example Costs (ETH = $2,000)

| Scenario | Tokens (in/out) | Model | Cost (USD) | Cost (ETH) |
|----------|----------------|-------|------------|------------|
| Simple Q&A | 100/400 | Opus 4.6 | $0.0105 | 0.00000525 |
| Code Generation | 500/2000 | Sonnet 4.6 | $0.0465 | 0.00002325 |
| Document Analysis | 10,000/1,000 | Haiku 4.5 | $0.015 | 0.0000075 |

## Security

### Cryptographic Guarantees

- **Rate-Limit Nullifiers (RLN)**: Prevents double-spending while preserving anonymity
- **Groth16 ZK-SNARKs**: Proves solvency without revealing balance
- **EdDSA Signatures**: Server signs refund tickets (verifiable in ZK circuits)
- **Poseidon Hash**: ZK-friendly hash function for circuits

### Double-Spend Detection

If you reuse a ticket index with different messages:

```
Given: y₁ = k + a×x₁ and y₂ = k + a×x₂
Solve:  k = (y₁×x₂ - y₂×x₁) / (x₂ - x₁)
```

Your secret key `k` is revealed and anyone can claim your RLN stake.

### Accountability Mechanisms

- **RLN Slashing**: Automatic punishment for double-spending (stake claimed by prover)
- **Policy Slashing**: Server can burn policy stake for ToS violations (not claimed, to prevent false accusations)

## Credits

Inspired by the Ethresear.ch proposal [ZK API Usage Credits: LLMs and Beyond](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) by Davide Crapis & Vitalik Buterin

Based on the **Wulong API template** by W3HC: https://github.com/w3hc/wulong

## License

GPL-3.0

## Contact

**Julien Béranger** ([GitHub](https://github.com/julienbrg))

- Element: [@julienbrg:matrix.org](https://matrix.to/#/@julienbrg:matrix.org)
- Farcaster: [julien-](https://warpcast.com/julien-)
- Telegram: [@julienbrg](https://t.me/julienbrg)

<img src="https://bafkreid5xwxz4bed67bxb2wjmwsec4uhlcjviwy7pkzwoyu5oesjd3sp64.ipfs.w3s.link" alt="built-with-ethereum-w3hc" width="100"/>
