# Simplification Opportunities

This document outlines areas where the zk-api codebase could eventually be simplified to reduce complexity, improve performance, and lower the barrier to entry.

## High-Impact Simplifications

### 1. Circuit Complexity - Refund Verification

**Current Implementation**:
- Circuit verifies up to 100 EdDSA signatures for refund tickets ([api_credit_proof.circom:151](../circuits/api_credit_proof.circom#L151))
- Each signature verification adds ~1,500 constraints
- Total: ~150,000 constraints just for refund verification
- Proof generation time: ~2-5 seconds
- Most users accumulate far fewer refunds before redeeming

**Simplification Option: Homomorphic Refund Accumulation (v2)**
- Use Pedersen commitments instead of refund ticket lists
- Prove: `balance = D + E(R) - spent` where `E(R)` is encrypted refund total
- Server updates commitment, user re-randomizes before submission
- **Benefits**:
  - Eliminates signature verification in circuit
  - Reduces constraints by ~60-70%
  - Faster proving (~1-2 seconds instead of ~2-5 seconds)
  - Smaller proof size

**Trade-offs**:
- Must implement re-randomization to prevent linkability (see [MISSING_FEATURES.md:25-35](MISSING_FEATURES.md#L25-L35))
- Different cryptographic primitives (Pedersen vs EdDSA)

**Priority**: 🟡 High - Significant performance improvement

---

### 2. Dual Cryptographic Systems

**Current Implementation**:
- EdDSA signatures for refund ticket signing
- Groth16 ZK-SNARKs for solvency proofs
- EdDSA verification inside circuit ([api_credit_proof.circom:93-116](../circuits/api_credit_proof.circom#L93-L116))
- Two separate cryptographic systems to maintain

**Simplification Option: Pure Commitment-Based Approach**
- Server maintains balance commitments (Pedersen)
- User proves knowledge of opening
- No signatures needed in circuit
- **Benefits**:
  - Single cryptographic primitive family
  - Simpler circuit design
  - Fewer dependencies

**Trade-offs**:
- Different trust model (commitment-based vs signature-based)
- Requires redesign of refund mechanism

**Priority**: 🟡 Medium - Architecture change required

---

### 3. Service Architecture Consolidation

**Current Implementation**:
7 separate services for ZK API functionality ([OVERVIEW.md:68-76](OVERVIEW.md#L68-L76)):
- `ZkApiService` - Request orchestration
- `ProofVerifierService` - Groth16 verification
- `NullifierStoreService` - Double-spend detection
- `EthRateOracleService` - ETH/USD conversion
- `RefundSignerService` - EdDSA signing
- `BlockchainService` - Contract interaction
- `MerkleTreeService` - Tree synchronization

**Simplification Option: Merge Related Services**

**Proposed structure**:
1. **CoreZkService** (merge `ZkApiService` + `RefundSignerService`)
   - Main request handling
   - Refund generation

2. **VerificationService** (merge `ProofVerifierService` + `NullifierStoreService`)
   - Proof verification
   - Double-spend detection
   - Single responsibility: validation

3. **BlockchainSyncService** (merge `BlockchainService` + `MerkleTreeService`)
   - Contract reads
   - Tree maintenance

4. **PricingService** (keep `EthRateOracleService`)
   - ETH/USD conversion

**Benefits**:
- Cleaner dependency graph
- Reduced inter-service communication
- Better cohesion
- 40% fewer service files

**Priority**: 🟢 Medium - Code organization improvement

---

### 4. Extract Non-Core Features

**Current Implementation**:
Multiple feature sets beyond core ZK privacy:
- **SIWE Authentication** ([src/auth/](../src/auth/)) - Sign-In with Ethereum
- **ML-KEM Encryption** ([src/encryption/](../src/encryption/)) - Post-quantum encryption
- **TEE Attestation** ([src/attestation/](../src/attestation/)) - Trusted Execution Environment
- **Secret Storage** ([src/secret/](../src/secret/)) - Encrypted secret management

**Analysis**:
- These features add ~40% of codebase
- Not required for core ZK API privacy functionality
- Valuable for production deployment but optional for MVP

**Simplification Option: Plugin Architecture**

**Core Package**: `@zk-api/core`
- ZK proof verification
- Nullifier management
- Refund signing
- Claude API integration

**Optional Packages**:
- `@zk-api/auth` - SIWE authentication
- `@zk-api/encryption` - ML-KEM post-quantum encryption
- `@zk-api/tee` - TEE attestation
- `@zk-api/secrets` - Secret management

**Benefits**:
- Core package is 60% smaller
- Easier to understand and audit
- Users install only what they need
- Better separation of concerns

**Priority**: 🟡 High - Simplifies onboarding and audits

---

### 5. Merkle Tree Depth Optimization

**Current Implementation**:
- 20-level Merkle tree ([api_credit_proof.circom:151](../circuits/api_credit_proof.circom#L151))
- Supports up to ~1,048,576 depositors
- Requires 20 Poseidon hash operations per proof
- Each hash adds ~150 constraints

**Simplification Option: Graduated Tree Depth**

**Phase 1 (MVP)**: Depth 10
- Supports 1,024 users
- 10 Poseidon hashes = ~1,500 constraints
- **50% reduction in Merkle verification cost**

**Phase 2 (Growth)**: Depth 15
- Supports 32,768 users
- 15 Poseidon hashes = ~2,250 constraints

**Phase 3 (Scale)**: Depth 20
- Supports 1,048,576 users
- Current implementation

**Migration Strategy**:
- Deploy new circuit when approaching capacity
- Users migrate by depositing to new contract
- Old contract remains accessible for withdrawals

**Benefits**:
- Faster proving for early adopters
- Can optimize for actual usage patterns
- 25-50% faster proof generation initially

**Priority**: 🟢 Medium - Performance optimization

---

### 6. Price Oracle Simplification

**Current Implementation**:
- Real-time ETH/USD conversion via Kraken API ([eth-rate-oracle.service.ts](../src/zk-api/eth-rate-oracle.service.ts))
- External dependency on Kraken WebSocket
- Requires error handling, reconnection logic, fallback rates
- Adds infrastructure complexity

**Simplification Options**:

**Option A: Fixed Price Updates**
- Admin updates ETH price weekly/daily via smart contract
- Backend reads on-chain price
- **Benefits**: No external API, simpler infrastructure
- **Trade-off**: Slight price staleness (users slightly overpay)

**Option B: USD-Denominated System**
- Accept USDC/DAI deposits instead of ETH
- Price in USD directly
- **Benefits**: No conversion needed, stable pricing
- **Trade-off**: Different UX, requires stablecoin support

**Option C: Chainlink Oracle**
- Use existing Chainlink ETH/USD feed
- More reliable than single-source API
- **Benefits**: Decentralized, battle-tested
- **Trade-off**: Adds on-chain dependency

**Priority**: 🟢 Low - Current implementation works, but simpler alternatives exist

---

### 7. Circuit Consolidation

**Current Implementation**:
Multiple circuit files:
- `api_credit_proof.circom` - Main production circuit
- `api_credit_proof_simple.circom` - Simplified version
- `api_credit_proof_test.circom` - Test harness

**Simplification Option: Parameterized Single Circuit**

```circom
component main {public [...]} = ApiCreditProof(
  MERKLE_DEPTH,     // 10, 15, or 20
  MAX_REFUNDS,      // 10, 50, or 100
  ENABLE_SOLVENCY   // true/false for testing
);
```

**Benefits**:
- Single source of truth
- Compile different versions from same code
- Easier maintenance
- Test and production use same logic

**Priority**: 🟢 Low - Quality of life improvement

---

## Summary by Impact

### Biggest Code Reduction
1. **Extract non-core features** → 40% codebase reduction
2. **Homomorphic refunds** → 60-70% constraint reduction
3. **Service consolidation** → 40% fewer service files

### Biggest Performance Gain
1. **Homomorphic refunds** → 50% faster proving
2. **Smaller Merkle tree** → 25-50% faster proving (MVP)
3. **Remove EdDSA verification** → Additional 20-30% speedup

### Easiest to Implement
1. **Service consolidation** → Refactoring only
2. **Fixed price oracle** → Remove external dependency
3. **Circuit consolidation** → Code organization

### Architecture Decisions

The core innovation (RLN + ZK-SNARKs for anonymous API access) is elegant and minimal. Most complexity comes from:
1. **Refund management** (100 signature verifications in circuit)
2. **Auxiliary features** (SIWE, ML-KEM, TEE - valuable but orthogonal)
3. **Production readiness** (price oracle, multiple services)

**Recommendation**: A minimal MVP could be 60% smaller while retaining full privacy guarantees by:
- Using homomorphic refunds (v2 spec)
- Extracting non-ZK features to plugins
- Starting with smaller Merkle tree
- Using fixed price updates

This would make the system easier to:
- Understand and audit
- Deploy and maintain
- Extend and customize
- Prove secure

## Implementation Priority

### Phase 1 (Quick Wins)
- [ ] Consolidate services
- [ ] Extract non-core features to separate packages
- [ ] Document core vs optional features

### Phase 2 (Performance)
- [ ] Implement graduated Merkle tree depth
- [ ] Simplify price oracle
- [ ] Optimize circuit parameters

### Phase 3 (Architecture)
- [ ] Research homomorphic refund implementation
- [ ] Evaluate pure commitment-based approach
- [ ] Design migration path from v1 to v2

## References

- [MISSING_FEATURES.md](MISSING_FEATURES.md) - Production TODOs and known issues
- [OVERVIEW.md](OVERVIEW.md) - Current system architecture
- [v2 spec with homomorphic refunds](https://hackmd.io/3da7PaYmTqmNTTwqxVidRg)
- [@omarespejel's linkability concerns](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104)
