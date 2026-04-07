# ZK API System Overview

## Introduction

ZK API is a privacy-preserving system for accessing external API services anonymously using Zero-Knowledge proofs and Rate-Limit Nullifiers (RLN). Users deposit ETH once and make unlimited untraceable requests without revealing their identity or linking requests together.

**Implementation**: Based on [ZK API Usage Credits: LLMs and Beyond](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) by Davide Crapis & Vitalik Buterin.

**Current Status**: Testnet-ready with Claude provider integration (claude-sonnet-4-5-20250929). 434 tests passing.

**Key Innovation**: Combines ZK-SNARKs (Groth16) for proving solvency with Rate-Limit Nullifiers for preventing double-spending, maintaining complete privacy through cryptographic unlinkability rather than policy.

## TEE Deployment: Why This Matters

ZK API is **designed to run in a Trusted Execution Environment (TEE)** such as:
- AMD SEV-SNP (Secure Encrypted Virtualization)
- Intel TDX (Trust Domain Extensions)
- AWS Nitro Enclaves
- Phala Network (TDX/SGX infrastructure)

### The TEE + ZK Advantage

**Without TEE (session-based approach)**:
- User pays → Server issues session token → Requests authenticated
- Server *can* link payments to requests (chooses not to via policy)
- Vulnerable to regulatory demands: "Show us who made request X"

**With TEE Only**:
- Server operator cannot read memory (hardware isolation)
- But the *code* can still correlate payments to requests
- Regulatory demand: "Your code can link them, so extract that data"

**With TEE + ZK (this system)**:
- Server operator cannot read memory (TEE isolation)
- Code *cannot* link payments to requests (ZK nullifiers destroy linkage)
- Regulatory demand: "We mathematically cannot comply—the system is cryptographically designed to prevent it"

**The complexity is justified**: ZK provides cryptographic unlinkability that survives regulatory pressure, not just operational privacy.

## Architecture

The system consists of three main layers:

### 1. Smart Contract Layer (Ethereum)

**Contract**: [`ZkApiCredits.sol`](../contracts/src/ZkApiCredits.sol)

The smart contract manages the economic guarantees and serves as the source of truth for:

- **Deposits & Withdrawals**: Users deposit ETH along with an identity commitment (Poseidon hash of their secret key)
- **Merkle Tree**: Maintains an onchain Merkle tree of all identity commitments (anonymity set)
- **Dual Staking Mechanism**:
  - 50% RLN stake: Claimable by anyone who proves double-spending
  - 50% Policy stake: Burnable by operator for ToS violations (not claimable to prevent false accusations)
- **Refund Redemption**: Users can redeem server-signed refund tickets onchain
- **Slashing**: Automatic punishment when someone proves you reused a ticket

**Key Functions**:
- `deposit(bytes32 identityCommitment)`: Deposit ETH with anonymous identity
- `withdraw(address recipient, uint256 amount)`: Withdraw available balance
- `redeemRefund(...)`: Redeem server-signed refund ticket
- `slashDoubleSpend(...)`: Submit proof of double-spending to claim RLN stake
- `slashPolicy(...)`: Operator burns policy stake for ToS violations

### 2. Zero-Knowledge Circuit Layer

**Main Circuit**: [`circuits/api_credit_proof.circom`](../circuits/api_credit_proof.circom)

The ZK circuit proves four critical properties in zero-knowledge:

1. **Membership**: User's identity commitment exists in the Merkle tree (k-anonymity among all depositors)
2. **Refund Validity**: All accumulated refund tickets have valid EdDSA signatures from the operator
3. **Solvency**: Current balance ≥ maxCost of this request
   ```
   balance = initial_deposit + sum(refund_tickets) - sum(spent)
   ```
4. **RLN Signal**: Generates unique nullifier and signal for double-spend prevention
   ```
   a = Poseidon(secretKey, ticketIndex)
   nullifier = Poseidon(a)
   x = Poseidon(message)
   y = secretKey + a * x
   ```

**Circuit Parameters**:
- Merkle tree depth: 20 (supports ~1M depositors)
- Max refund tickets: 10 (configurable)
- Proof system: Groth16 (fast verification, ~200-300 bytes)
- Hash function: Poseidon (ZK-friendly, much cheaper than SHA256 in circuits)
- Proof generation: ~2-5 seconds (client-side)
- Proof verification: ~10-20ms (server-side)

See [ZK.md](./ZK.md) for detailed circuit documentation.

### 3. Backend Services Layer (NestJS)

The backend orchestrates proof verification, API execution, and refund signing:

**Core ZK Services**

| Service | File | Purpose |
|---------|------|---------|
| **ZkApiService** | [zk-api.service.ts](../src/zk-api/zk-api.service.ts) | Main request orchestrator |
| **ProofVerifierService** | [proof-verifier.service.ts](../src/zk-api/proof-verifier.service.ts) | Groth16 proof verification (~10-20ms) |
| **NullifierStoreService** | [nullifier-store.service.ts](../src/zk-api/nullifier-store.service.ts) | SQLite persistent nullifier storage |
| **RefundSignerService** | [refund-signer.service.ts](../src/zk-api/refund-signer.service.ts) | EdDSA refund ticket signing (in-circuit verified) |
| **MerkleTreeService** | [merkle-tree.service.ts](../src/zk-api/merkle-tree.service.ts) | Onchain Merkle tree synchronization |
| **BlockchainService** | [blockchain.service.ts](../src/zk-api/blockchain.service.ts) | Ethereum contract interactions |
| **EthRateOracleService** | [eth-rate-oracle.service.ts](../src/zk-api/eth-rate-oracle.service.ts) | ETH/USD pricing (Kraken + Chainlink fallback) |

**Provider Abstraction** (Multi-API Support)

| Service | Purpose |
|---------|---------|
| **ProviderRegistryService** | Dynamic provider registration and routing |
| **PricingOracleService** | Cost calculation with 1-hour cache |
| **CostEstimationService** | Pre-request cost estimation |
| **ClaudeProvider** | Reference implementation (claude-sonnet-4-5-20250929) |

See [PROVIDERS.md](./PROVIDERS.md) for adding new providers.

**Security & Privacy**

| Service | Purpose |
|---------|---------|
| **SiweService** | Sign-In with Ethereum authentication |
| **MlkemEncryptionService** | Post-quantum encryption (ML-KEM-768) |
| **TeePlatformService** | TEE attestation verification |
| **SecretService** | Secure secret management (TEE/KMS) |
| **MetadataSanitizerInterceptor** | Remove identifying headers from logs |
| **TimingProtectionInterceptor** | Constant-time responses (prevent timing attacks) |

## Request Flow

### One-Time Setup

1. User generates random secret key `k`
2. Computes identity commitment: `idCommitment = Poseidon(k)`
3. Deposits ETH to contract with `idCommitment`
4. User is now part of the anonymity set

### Making an Anonymous Request

```
┌─────────┐                ┌─────────────┐                ┌──────────┐
│  User   │                │  Backend    │                │ Contract │
└────┬────┘                └──────┬──────┘                └────┬─────┘
     │                            │                            │
     │ 1. Generate ZK proof       │                            │
     │    - Merkle proof          │                            │
     │    - Previous refunds      │                            │
     │    - RLN signal            │                            │
     │                            │                            │
     │ 2. POST /zk-api/request    │                            │
     │    {proof, nullifier,      │                            │
     │     signal, maxCost}       │                            │
     ├───────────────────────────>│                            │
     │                            │                            │
     │                            │ 3. Verify proof            │
     │                            │    (Groth16)               │
     │                            │                            │
     │                            │ 4. Check nullifier         │
     │                            │    not used                │
     │                            │                            │
     │                            │ 5. Store nullifier         │
     │                            │                            │
     │                            │ 6. Call Claude API         │
     │                            │                            │
     │                            │ 7. Calculate actual        │
     │                            │    cost (tokens * price)   │
     │                            │                            │
     │                            │ 8. Sign refund ticket      │
     │                            │    (EdDSA)                 │
     │                            │                            │
     │ 9. Response + refund       │                            │
     │    ticket                  │                            │
     │<───────────────────────────┤                            │
     │                            │                            │
     │ 10. Accumulate tickets     │                            │
     │     for next request       │                            │
     │                            │                            │
     │ ... many requests ...      │                            │
     │                            │                            │
     │ 11. Redeem refunds         │                            │
     │     onchain               │                            │
     ├────────────────────────────┼───────────────────────────>│
     │                            │                            │
     │                            │                            │ 12. Verify EdDSA
     │                            │                            │     signature
     │                            │                            │
     │                            │                            │ 13. Credit balance
     │                            │                            │
     │ 14. ETH sent to recipient  │                            │
     │<───────────────────────────┼────────────────────────────┤
```

### Key Privacy Guarantees

1. **Identity Privacy** (Deposit Unlinkability)
   - ZK proof proves membership without revealing which leaf in the Merkle tree
   - k-anonymity scales with depositor count (~1M max with depth-20 tree)
   - Onchain deposits can't be linked to API requests

2. **Request Unlinkability** (Cross-Request Privacy)
   - Each request uses a unique nullifier: `nullifier = Poseidon(Poseidon(secretKey, ticketIndex))`
   - Server stores nullifiers but can't link them: nullifier₁, nullifier₂, nullifier₃...
   - No way to determine if requests came from the same user

3. **Balance Privacy** (Range Proof)
   - ZK proof only reveals: `balance ≥ maxCost`
   - Server never learns actual balance or deposit amount
   - Prevents profiling users by spending patterns

4. **Double-Spend Prevention** (RLN)
   - Each ticket index can be used exactly once
   - Reusing a ticket with different message reveals secret key via linear algebra
   - Anyone can compute: `k = (y₁×x₂ - y₂×x₁) / (x₂ - x₁)` and claim RLN stake
   - Cryptographic guarantee, not policy enforcement

**Cryptographic Unlinkability**: These properties survive regulatory pressure because the system is mathematically incapable of linking requests to users, even if compelled. TEE deployment ensures the operator can't read memory or tamper with the code.

## Cryptographic Primitives

### Rate-Limit Nullifiers (RLN)

RLN is a cryptographic primitive that allows one-time use of tickets while preserving privacy:

**Signal Generation**:
```
a = Poseidon(secretKey, ticketIndex)
nullifier = Poseidon(a)
x = Poseidon(message)
y = secretKey + a × x
```

**Properties**:
- Different messages with same ticket → reveals secret key
- Server can verify: `nullifier` hasn't been seen before
- Server stores: `(nullifier, x, y)` for double-spend detection

**Double-Spend Detection**:
If someone submits two requests with same `ticketIndex`:
```
Signal 1: y₁ = k + a×x₁
Signal 2: y₂ = k + a×x₂

Solve for k:
k = (y₁×x₂ - y₂×x₁) / (x₂ - x₁)
```

Anyone can compute the secret key and submit a slashing transaction to claim the RLN stake.

### EdDSA Refund Tickets

The server signs refund tickets with EdDSA (verifiable in ZK circuits):

**Ticket Structure**:
```typescript
{
  nullifier: string,      // From this request
  value: bigint,         // Refund amount in wei
  timestamp: number,     // Unix timestamp
  signature: {          // EdDSA signature
    R8: [string, string],
    S: string
  }
}
```

**In-Circuit Verification**: The ZK circuit verifies EdDSA signatures on all accumulated refund tickets, ensuring the server actually authorized them.

### Poseidon Hash

- **Purpose**: ZK-friendly hash function (much cheaper in circuits than SHA256)
- **Usage**: Identity commitments, nullifiers, RLN signals
- **Parameters**: Rate = 2, capacity = 1 (standard configuration)

## Security Model

### Threat Model

**Trusted**:
- Smart contract (after audit)
- ZK circuit (after trusted setup ceremony)
- Cryptographic primitives (Poseidon, EdDSA, Groth16)

**Semi-Trusted**:
- Server operator (can censor but can't steal funds or break privacy)

**Adversaries**:
- Network observers (ISP, server operator)
- Other users
- Blockchain analysts

### Attack Vectors & Mitigations

| Attack | Mitigation |
|--------|-----------|
| **Double-spending** | RLN reveals secret key → automatic slashing |
| **Proof forgery** | Groth16 soundness guarantee (computationally infeasible) |
| **Replay attacks** | Nullifiers stored server-side, checked onchain for refunds |
| **Balance draining** | ZK proof ensures balance ≥ maxCost before request |
| **Server refusing refunds** | Overpayment is minor per request, accumulate and redeem onchain |
| **Sybil attacks** | Each deposit requires real ETH stake |
| **ToS violations** | Policy stake can be burned (separate from RLN stake) |

### Privacy Limitations & Best Practices

While the system provides strong cryptographic privacy guarantees, users should be aware of these limitations:

1. **Network-level privacy**
   - **Risk**: IP addresses visible to server operator
   - **Mitigation**: Use Tor, VPN, or mixnets for network-level anonymity
   - **Future**: TEE deployment prevents operator from logging IPs

2. **Timing correlation**
   - **Risk**: Request timing patterns could correlate with onchain deposits
   - **Mitigation**: Space out requests, use random delays
   - **Future**: Decentralized relay networks (mixnets)

3. **Anonymity set size**
   - **Risk**: Privacy scales with number of depositors (k-anonymity)
   - **Current**: Supports up to ~1M depositors (20-level tree)
   - **Recommendation**: Wait for larger anonymity set before depositing large amounts

4. **Message content**
   - **Risk**: Prompt content could reveal identity ("As the CEO of FooBar Inc...")
   - **Mitigation**: Sanitize prompts, avoid PII
   - **Note**: Server cannot correlate prompts to identities, but prompts are visible to API provider (Claude/OpenAI)

5. **Browser/device fingerprinting**
   - **Risk**: Unique browser fingerprints could link requests
   - **Mitigation**: Use Tor Browser, randomize user agents
   - **Implementation**: `MetadataSanitizerInterceptor` removes identifying headers server-side

## Cost Economics

### User Costs

| Cost Type | Estimate | Frequency |
|-----------|----------|-----------|
| **Initial Deposit** | ~$5-20 (gas cost) | One-time per identity |
| **API Request** | 1-5% overpayment | Per request (due to ETH/USD fluctuation) |
| **Refund Redemption** | ~$3-10 (gas cost) | Batch after ~100 requests |

**Example**: Deposit $50 → Make 500 requests at $0.10 each → Redeem ~$0.50 overpayment → Net cost: $55.50 (3% overhead from gas + overpayment)

### Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| **Proof generation** | 2-5 seconds | Client-side (browser/Node.js) |
| **Proof verification** | 10-20ms | Server-side (SnarkJS) |
| **Proof size** | 200-300 bytes | Groth16 constant size |
| **Deposit gas cost** | ~150k gas | One-time per identity |
| **Refund redemption gas** | ~80k gas | Batch redemption recommended |
| **Max depositors** | ~1M | Depth-20 Merkle tree |

### Gas Optimization Notes

- **Batch refunds**: Redeem after accumulating 50-100 tickets to amortize gas
- **L2 deployment**: Consider Arbitrum/Optimism for 10-100x cheaper deposits
- **Merkle proofs**: 20 hashes verified onchain per deposit (Poseidon in assembly)

## Current Status

### ✅ Core System Complete

**Zero-Knowledge Layer**
- [x] ZK circuit design (Circom) - Groth16 with RLN
- [x] Proof verification (SnarkJS) - ~10-20ms server-side
- [x] Smart contract (Solidity) - ZkApiCredits.sol with dual staking
- [x] Merkle tree service - 20-level tree, supports ~1M depositors
- [x] Nullifier store - SQLite persistent storage with privacy guarantees

**Backend Services (NestJS)**
- [x] API endpoints with HTTPS/TLS
- [x] Refund ticket signing (EdDSA, in-circuit verification)
- [x] ETH/USD oracle (Kraken + Chainlink fallback)
- [x] Rate limiting (hybrid: fingerprint + per-nullifier)
- [x] Comprehensive test suite (434 tests passing)

**Provider Abstraction**
- [x] Multi-provider architecture with dynamic pricing
- [x] Claude provider (claude-sonnet-4-5-20250929)
  - $3/M input tokens, $15/M output tokens
  - Cache-aware pricing (90% read discount)
  - Token counting and cost estimation
- [x] Cost estimation endpoint (public, no auth required)
- [x] Pricing database (SQLite) with audit trail
- [x] See [PROVIDERS.md](./PROVIDERS.md) and [QUICK_START.md](./QUICK_START.md)

**⚠️ USE AT YOUR OWN RISK - CRITICAL SECURITY VULNERABILITIES ⚠️**

**DO NOT USE WITH REAL FUNDS. TESTNET ONLY.**

This is an **alpha-stage research implementation** of the ZK-API system described in the [Ethresear.ch proposal](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104). While the backend services correctly implement all cryptographic primitives, the smart contract contains **critical placeholder implementations** that make it vulnerable to theft.

### Why is this dangerous?

The backend correctly verifies:
- ✅ EdDSA signatures on refund tickets (using Babyjub + circomlibjs)
- ✅ RLN double-spend math (field arithmetic for secret key extraction)
- ✅ Merkle tree membership (20-level binary tree with Poseidon)

**However**, the smart contract uses **placeholder verification functions** that accept invalid inputs. This means:

❌ **Anyone can bypass the backend** and call the contract directly with fake data
❌ **The contract cannot detect the difference** between legitimate and malicious inputs
❌ **Your deposited funds can be stolen** by anyone who understands the vulnerabilities

### Specific Vulnerabilities

🔴 **CRITICAL** (see [notes/TRUSTLESSNESS.md](./notes/TRUSTLESSNESS.md) for full technical analysis):

1. **EdDSA signature verification is placeholder** ([ZkApiCredits.sol:493-515](../contracts/src/ZkApiCredits.sol#L493-515))
   - Contract accepts any non-zero signature
   - Attackers can forge refund tickets with arbitrary amounts
   - Can drain all deposited ETH from the contract

2. **RLN double-spend slashing is incomplete** ([ZkApiCredits.sol:242-245](../contracts/src/ZkApiCredits.sol#L242-245))
   - Contract doesn't verify the RLN mathematics
   - Attackers can submit fake slashing proofs
   - Can steal any user's RLN stake (50% of deposit)

3. **Merkle tree is never verified onchain** ([ZkApiCredits.sol:425-453](../contracts/src/ZkApiCredits.sol#L425-453))
   - Contract computes a Merkle root but never checks it
   - No enforcement of anonymity set membership
   - Withdrawal function doesn't require Merkle proof

4. **Withdrawal reveals secret key onchain** ([ZkApiCredits.sol:188-202](../contracts/src/ZkApiCredits.sol#L188-202))
   - Users must submit secret key as public parameter
   - All past API requests become linkable retroactively
   - Blockchain analysts can track complete request history

�� **ADDITIONAL TRUST ASSUMPTIONS**:
- **Server dependency**: Users cannot withdraw if server is down (requires Merkle proof from server)
- **Admin control**: Contract owner can arbitrarily slash policy stakes and change server address
- **Deposit not anonymous**: First deposit publicly links wallet address to identity commitment

### Current Status

**Safe for**: Testnet development and cryptographic research
**NOT safe for**: Any deployment involving real value (mainnet, L2s, etc.)

**Before mainnet deployment**, the following must be completed:
- [ ] Implement real EdDSA signature verification in contract (using audited library)
- [ ] Implement full RLN slashing verification in contract (Poseidon + field arithmetic)
- [ ] Implement Merkle proof verification for withdrawals
- [ ] Use ZK proof for withdrawal (don't reveal secret key)
- [ ] Professional security audit of contracts
- [ ] Bug bounty program

See [Phase 0: Critical Security Fixes](./notes/TRUSTLESSNESS.md#phase-0-critical-security-fixes-must-do-before-any-deployment-) for complete roadmap.

**Next Steps**: See [Roadmap](#roadmap) section below for deployment phases (SDK → Testnet → Mainnet → TEE).

### 📚 Documentation

- [SQLite Database Implementation](./SQLITE3.md) - Storage architecture and privacy design
- [ZK Circuits Guide](./ZK.md) - Zero-knowledge proof circuits
- [API Reference](./API_REFERENCE.md) - Endpoint documentation
- [Provider Abstraction](./PROVIDER_ABSTRACTION.md) - Multi-provider support and pricing architecture
- [Metadata Protection](./METADATA_PROTECTION.md) - Privacy and rate limiting implementation
- [Testing Guide](./TESTING_GUIDE.md) - Test procedures

## Roadmap

### Phase 1: SDK & Testnet Launch (Next)
- [ ] **w3pk Wallet SDK integration**
  - Client-side proof generation (WASM/SnarkJS)
  - Refund ticket accumulation and management
  - Balance tracking and nullifier coordination
  - TypeScript helpers for deposits and withdrawals
- [ ] **Deploy to Sepolia**
  - Production-grade trusted setup ceremony
  - Circuit parameter validation
  - Gas cost optimization and stress testing
  - Faucet for testing deposits
- [ ] **Spin up a UI**
  - Wallet connection (MetaMask, WalletConnect)
  - Deposit/withdraw interface
  - Anonymous chat with Claude
  - Balance and refund ticket visualization
  - Network switcher (Sepolia/Mainnet)
- [ ] **Beta testing**
  - Real user integration testing
  - Security audit (circuit + contract + backend)
  - Performance tuning and monitoring
  - Documentation and tutorials

### Phase 2: Mainnet Launch
- [ ] **Deploy to Ethereum Mainnet**
  - Final trusted setup (reuse Sepolia parameters if validated)
  - Contract deployment and verification
  - HSM/KMS integration for EdDSA signing key
  - Multi-RPC endpoint redundancy
- [ ] **Production infrastructure**
  - Multi-network support in UI
  - Monitoring, alerting, and incident response
  - Load balancing and autoscaling
  - Rate limiting and DDoS protection

### Phase 3: Decentralized Deployment
- [ ] **Deploy to Phala Network (TEE)**
  - TEE attestation integration
  - Decentralized compute verification
  - Cross-chain state synchronization
  - Secret injection via Phala's secure runtime
- [ ] **Alternative TEE platforms**
  - AWS Nitro Enclaves
  - Intel TDX / AMD SEV-SNP
  - Comparison and performance benchmarking

### Phase 4: Multi-Provider Expansion
- [ ] **Add new API providers**
  - OpenAI (GPT-4, GPT-4o)
  - Mistral AI
  - Generic HTTP proxy mode
- [ ] **w3pk integration**
  - ML-KEM encrypted document injection
  - Private context management (PDFs, code, etc.)
  - Multi-turn conversations with TEE storage

## References

- [ZK API Usage Credits: LLMs and Beyond](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) - Original proposal by Davide Crapis & Vitalik Buterin
- [Rate-Limit Nullifiers](https://rate-limiting-nullifier.github.io/rln-docs/) - RLN documentation
- [Circom Documentation](https://docs.circom.io/) - Circuit development
- [SnarkJS](https://github.com/iden3/snarkjs) - ZK proof generation and verification
- [Poseidon Hash](https://eprint.iacr.org/2019/458.pdf) - ZK-friendly hash function
