# Missing Features & Improvements

Based on the [Ethresear.ch proposal](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) and community feedback, this document tracks features and improvements not yet implemented in the current zk-api codebase.

## Critical Issues

### 1. Server-Side Inference Metadata Leakage Protection

**Issue raised by**: [@omarespejel](https://ethresear.ch/u/omarespejel) (former ML engineer at Hugging Face)

**Problem**: Refund mechanism leaks more than just refund values. Production LLM inference exposes:
- Output token count
- Time-to-first-token (correlates with input length and KV cache state)
- Generation latency
- Draft-model acceptance rate for speculative decoding (varies by prompt domain)

Over N requests, clustering algorithms on these features can re-link anonymous requests to the same user.

**Status**: ❌ Not implemented

**Solution**: Implement noise injection or quantization on timing/cost metadata

---

### 2. Homomorphic Refund Accumulation (v2 Linkability Issue)

**Issue raised by**: [@omarespejel](https://ethresear.ch/u/omarespejel)

**Problem**: In the v2 homomorphic approach, `E(R)` (encrypted refund total) is sent to server at settlement. Server sees and signs `E(R)`, then can correlate it across requests. Full per-user chain recovery possible from settlement log alone.

**Status**: ⚠️ Partially documented, not implemented

**Solution**: Re-randomize `E(R)` before each submission and prove equivalence inside ZK proof. Pedersen commitments support re-randomization natively.

**Note**: Current implementation uses v1 (refund ticket list), not v2 (homomorphic).

---

### 3. Persistent Nullifier Store

**Current**: In-memory `NullifierStoreService` (lost on restart)

**Problem**:
- No persistence across server restarts
- Cannot scale horizontally
- Double-spend detection fails after restart

**Status**: ❌ Not implemented

**Solution**: Migrate to Redis or PostgreSQL with proper indexing

**Priority**: 🔴 Critical for production

---

### 4. HSM/KMS for EdDSA Signing Keys

**Current**: EdDSA private key stored in environment variable

**Problem**: Signing key compromise allows forging refund tickets

**Status**: ❌ Not implemented

**Solution**: Integrate with AWS KMS, Google Cloud KMS, or hardware security module

**Priority**: 🔴 Critical for production

---

### 5. On-Chain Event Monitoring

**Problem**: Off-chain Merkle tree doesn't automatically sync when users deposit

**Status**: ❌ Not implemented

**Solution**: Event listener for `Deposit` events to update Merkle tree in real-time

**Priority**: 🔴 Critical for production

---

## High Priority Features

### 6. Parallelization Support

**Proposal feature**: Users can generate multiple requests (tickets `i, i+1, i+2`) simultaneously

**Current**: Sequential ticket index processing only

**Trade-off**: Parallel requests require overprovisioning `(batch_size * C_max)` which reduces capital efficiency

**Status**: ⚠️ Noted as removed from v2 spec pending trade-off analysis

**Solution**: Design batch proof system with optimized provisioning

**Priority**: 🟡 Medium

---

### 7. Policy Stake Slashing Implementation

**Smart contract**: Dual staking (50% RLN + 50% policy) implemented

**Backend**: No logic to detect ToS violations or trigger `slashPolicy()`

**Status**: ⚠️ Contract ready, backend missing

**Solution**:
- Implement content moderation layer
- Define violation detection rules
- Build operator dashboard for policy slashing

**Priority**: 🟡 Medium

---

### 8. MEV Protection for Slashing Transactions

**Problem**: When double-spend detected, anyone can claim RLN stake. MEV bots can front-run legitimate reporters.

**Status**: ❌ Not implemented

**Solution**:
- Use Flashbots RPC for slashing transactions
- Implement MEV-resistant auction for reporter rewards
- Time-locked reveal mechanism

**Priority**: 🟡 Medium

---

### 9. Trusted Setup Ceremony Completion

**Current status**: Development/test parameters likely used

**Problem**: Production requires multi-party computation ceremony (Powers of Tau)

**Status**: ⚠️ Incomplete

**Solution**:
- Run or participate in Powers of Tau ceremony
- Generate production proving/verification keys
- Document ceremony participants and attestations

**Priority**: 🟡 Medium (before mainnet)

---

### 10. Rate Limiting Beyond Economic Model

**Issue raised by**: [@MicahZoltu](https://ethresear.ch/u/MicahZoltu)

**Problem**: Pay-per-request vs free-with-rate-limit are different use cases. Current model only has economic rate limiting.

**Status**: ❌ Not implemented

**Solution**: Add traditional rate limiting as defense-in-depth:
- Per IP address limits
- Per nullifier limits (even for paid requests)
- Adaptive rate limiting based on load

**Priority**: 🟡 Medium

---

## Medium Priority Features

### 11. Client SDK

**Current**: Users must manually implement proof generation, refund management, etc.

**Problem**: High barrier to entry for developers

**Status**: ❌ Not implemented

**Solution**: Build user-facing SDK with:
- Secret key generation and storage
- Automatic proof generation
- Refund ticket accumulation
- On-chain transaction helpers
- Examples in TypeScript, Python, Go

**Priority**: 🟢 Nice to have

---

### 12. Gas Optimization

**Current**: Smart contract not optimized for gas

**Opportunities**:
- Batch operations for multiple refund redemptions
- Optimized Merkle tree updates
- Storage packing
- Calldata compression

**Status**: ❌ Not implemented

**Priority**: 🟢 Nice to have

---

### 13. Anonymity Set Monitoring

**Privacy limitation**: Privacy scales with number of depositors

**Current**: No visibility into anonymity set size

**Solution**:
- Public dashboard showing anonymity set size
- Minimum deposit threshold before service activation
- Privacy guarantees documentation based on set size

**Status**: ❌ Not implemented

**Priority**: 🟢 Nice to have

---

### 14. Distributed Architecture

**Current**: Single-server backend

**Scaling needs**:
- Distributed nullifier store (Redis Cluster)
- Load balancer for multiple proof verifiers
- Horizontal scaling for API endpoints
- Shared Merkle tree cache

**Status**: ❌ Not implemented

**Priority**: 🟢 Nice to have

---

## Future Research

### 15. Post-Quantum Cryptography

**Proposal mention**: Lattice-based homomorphic encryption for post-quantum security

**Current**: Non-PQ primitives (EdDSA, Groth16, Poseidon)

**Status**: 🔬 Research

**Timeline**: Not prioritized (quantum computers not immediate threat)

---

### 16. Alternative Privacy Mechanisms

**Feedback**: [@JohnGuilding](https://ethresear.ch/u/JohnGuilding) suggests state channels

**Trade-off**: State channels are simpler but don't provide request unlinkability

**Current approach**: Full unlinkability via RLN

**Status**: 🔬 Design decision made (keeping RLN approach)

---

## Architectural Questions

### Should pay-per-request and rate-limiting be separate protocols?

**Raised by**: [@MicahZoltu](https://ethresear.ch/u/MicahZoltu)

**Question**: Most providers accept spam if paid. Free services need rate limiting. Why combine both?

**Current decision**: Keep combined for flexibility (some use cases need both)

**Status**: ✅ Design decision documented

---

### Market viability concerns

**Raised by**: [@kladkogex](https://ethresear.ch/u/kladkogex)

**Concerns**:
- People wanting privacy will use on-site compute
- Inference costs decreasing rapidly
- Limited market need

**Counter-arguments** ([@MicahZoltu](https://ethresear.ch/u/MicahZoltu)):
- On-site LLM requires $50k+ in VRAM for SOTA models
- Prefers metered over monthly billing
- Would choose ZK payment provider over regular provider

**Status**: ✅ Market validation ongoing

---

## References

- [Original Ethresear.ch proposal](https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104) by Davide Crapis & Vitalik Buterin
- [Updated v2 spec with homomorphic refunds](https://hackmd.io/3da7PaYmTqmNTTwqxVidRg)
- [Rate-Limit Nullifiers documentation](https://rate-limiting-nullifier.github.io/rln-docs/)
- [@omarespejel's linkability simulation](https://gist.github.com/omarespejel/c3f4f2aa12b1de10467601d77d0e6232)

---

## Priority Legend

- 🔴 **Critical for production** - Security or functionality blocker
- 🟡 **High priority** - Important for production launch
- 🟢 **Nice to have** - Improves UX or efficiency
- 🔬 **Research** - Requires design work or future consideration
