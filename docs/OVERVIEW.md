# ZK API System Overview

## Introduction

ZK API is a privacy-preserving system for accessing any external API service anonymously using Zero-Knowledge proofs and Rate-Limit Nullifiers (RLN). The system enables users to deposit ETH once and make thousands of untraceable API requests without revealing their identity or linking requests together.

**Reference Implementation**: Claude AI integration is provided as a complete example of how to integrate any external API service.

**Key Innovation**: Combines ZK-SNARKs (Groth16) for proving solvency with Rate-Limit Nullifiers for preventing double-spending, all while maintaining complete privacy.

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
- **Merkle Tree**: Maintains an on-chain Merkle tree of all identity commitments (anonymity set)
- **Dual Staking Mechanism**:
  - 50% RLN stake: Claimable by anyone who proves double-spending
  - 50% Policy stake: Burnable by operator for ToS violations (not claimable to prevent false accusations)
- **Refund Redemption**: Users can redeem server-signed refund tickets on-chain
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

1. **Membership**: User's identity commitment is in the Merkle tree
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
- Merkle tree depth: 20 (supports up to ~1M depositors)
- Max refund tickets: 10 (can be increased)
- Proof system: Groth16 (fast verification, ~200-300 bytes proof size)
- Hash function: Poseidon (ZK-friendly)

**Other Circuits**:
- `api_credit_proof_simple.circom`: Simplified version for testing
- `api_credit_proof_test.circom`: Test harness

### 3. Backend Services Layer (NestJS)

The backend orchestrates proof verification, API execution, and refund signing:

| Service | File | Purpose |
|---------|------|---------|
| **ZkApiService** | [`zk-api.service.ts`](../src/zk-api/zk-api.service.ts) | Main request orchestrator |
| **ProofVerifierService** | [`proof-verifier.service.ts`](../src/zk-api/proof-verifier.service.ts) | Groth16 proof verification using snarkjs |
| **NullifierStoreService** | [`nullifier-store.service.ts`](../src/zk-api/nullifier-store.service.ts) | SQLite persistent store for used nullifiers (double-spend prevention) |
| **RefundSignerService** | [`refund-signer.service.ts`](../src/zk-api/refund-signer.service.ts) | EdDSA signing of refund tickets |
| **EthRateOracleService** | [`eth-rate-oracle.service.ts`](../src/zk-api/eth-rate-oracle.service.ts) | ETH/USD price from Kraken API |
| **BlockchainService** | [`blockchain.service.ts`](../src/zk-api/blockchain.service.ts) | Ethereum contract interactions (read-only in current version) |
| **MerkleTreeService** | [`merkle-tree.service.ts`](../src/zk-api/merkle-tree.service.ts) | Off-chain Merkle tree sync with contract |

**Additional Services** (for broader app functionality):
- **SiweService**: Sign-In with Ethereum authentication
- **MlkemEncryptionService**: Post-quantum encryption (ML-KEM)
- **TeePlatformService**: Trusted Execution Environment attestation
- **SecretService**: Secret storage for TEE environments

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
     │     on-chain               │                            │
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

### Key Privacy Properties

1. **Identity Privacy**: Requests can't be linked to the on-chain deposit
   - ZK proof proves membership without revealing which leaf
   - Merkle tree provides k-anonymity among all depositors

2. **Request Unlinkability**: Requests can't be linked to each other
   - Each request uses a unique nullifier derived from ticket index
   - Server sees: nullifier₁, nullifier₂, ... (no way to link them)

3. **Balance Privacy**: Actual balance is hidden
   - ZK proof only reveals: `balance >= maxCost`
   - Server doesn't know how much you actually have

4. **Double-Spend Prevention**: RLN ensures tickets can't be reused
   - Each ticket has an index
   - Reusing same index with different message reveals secret key
   - Anyone can compute: `k = (y₁×x₂ - y₂×x₁) / (x₂ - x₁)`

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
| **Replay attacks** | Nullifiers stored server-side, checked on-chain for refunds |
| **Balance draining** | ZK proof ensures balance ≥ maxCost before request |
| **Server refusing refunds** | Overpayment is minor per request, accumulate and redeem on-chain |
| **Sybil attacks** | Each deposit requires real ETH stake |
| **ToS violations** | Policy stake can be burned (separate from RLN stake) |

### Privacy Limitations

1. **Network-level privacy**: Use Tor/VPN to hide IP address
2. **Timing correlation**: Space out requests to prevent timing analysis
3. **Anonymity set**: Privacy scales with number of depositors
4. **Message content**: Don't include personally identifiable information in prompts

## Cost Economics

### User Costs

1. **Initial Deposit**: One-time gas cost (~$5-20 depending on L1 gas price)
2. **API Request**: Maximal overpayment per request (~1-5% due to price fluctuations)
3. **Refund Redemption**: Gas cost to redeem accumulated refunds (~$3-10)

### Efficiency

- **Proof generation**: ~2-5 seconds (client-side)
- **Proof verification**: ~10-20ms (server-side)
- **Proof size**: ~200-300 bytes (Groth16)
- **Gas cost per deposit**: ~150k gas
- **Gas cost per refund redemption**: ~80k gas

## Current Status

### ✅ Completed

- [x] ZK circuit design (Circom)
- [x] Smart contract (Solidity)
- [x] Backend services (NestJS)
- [x] API endpoints
- [x] Unit tests (267 tests passing)
- [x] ETH/USD oracle integration
- [x] Refund ticket signing (EdDSA)
- [x] RLN cryptographic primitives
- [x] Merkle tree service
- [x] Anthropic SDK integration

### ⚠️ TODO for Production

- [ ] Complete trusted setup ceremony (Powers of Tau)
- [x] Replace in-memory nullifier store with persistent database (SQLite)
- [x] Rate limiting per nullifier (hybrid approach: fingerprint + per-nullifier)
- [ ] Implement HSM/KMS for EdDSA signing key
- [ ] Add event listener for on-chain Deposit events
- [ ] Deploy contract to mainnet
- [ ] Security audit (contract + circuit + backend)
- [ ] Gas optimization
- [ ] MEV protection for slashing transactions

### 📚 Documentation

- [SQLite Database Implementation](./SQLITE3.md) - Storage architecture and privacy design
- [ZK Circuits Guide](./ZK.md) - Zero-knowledge proof circuits
- [API Reference](./API_REFERENCE.md) - Endpoint documentation
- [Metadata Protection](./METADATA_PROTECTION.md) - Privacy and rate limiting implementation
- [Testing Guide](./TESTING_GUIDE.md) - Test procedures

## References

- [ZK API Usage Credits: LLMs and Beyond](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) - Original proposal by Davide Crapis & Vitalik Buterin
- [Rate-Limit Nullifiers](https://rate-limiting-nullifier.github.io/rln-docs/) - RLN documentation
- [Circom Documentation](https://docs.circom.io/) - Circuit development
- [SnarkJS](https://github.com/iden3/snarkjs) - ZK proof generation and verification
- [Poseidon Hash](https://eprint.iacr.org/2019/458.pdf) - ZK-friendly hash function
