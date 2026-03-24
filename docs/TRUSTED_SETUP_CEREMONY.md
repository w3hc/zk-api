# Trusted Setup Ceremony

## Overview

A trusted setup ceremony is a critical cryptographic process required for certain zero-knowledge proof systems, particularly those using zk-SNARKs with pairing-based cryptography. This ceremony generates public parameters (Common Reference String or CRS) that are used for proof generation and verification.

## Purpose

The trusted setup ceremony produces:
- **Proving Key**: Used by provers to generate zero-knowledge proofs
- **Verification Key**: Used by verifiers to validate proofs

These keys are derived from secret random values (toxic waste) that must be destroyed after the ceremony to ensure system security.

## Security Requirements

### Toxic Waste
The ceremony involves generating random values (τ, α, β, γ, δ) that must be:
- Generated with high entropy
- Used only once during parameter generation
- Permanently destroyed after use
- Never reconstructed or recovered

### Multi-Party Computation (MPC)
To enhance security, ceremonies typically use MPC where:
- Multiple participants contribute randomness
- Only one honest participant is needed for security
- Each participant adds their contribution sequentially
- Previous contributions are combined with new randomness

## Ceremony Types

### Powers of Tau
A universal ceremony that can be reused across multiple circuits:
- Generates parameters for a maximum circuit size
- Independent of specific circuit logic
- Can be performed once and shared
- More efficient for multiple applications

### Circuit-Specific Setup
Parameters generated for a specific circuit:
- Tied to the exact circuit implementation
- Must be regenerated if circuit changes
- Smaller parameter size
- Required for final deployment

## Process Workflow

### 1. Initialization
```
- Define circuit constraints
- Determine parameter size requirements
- Select ceremony coordinator
- Recruit participants
```

### 2. Contribution Phase
```
For each participant:
  1. Download previous parameters
  2. Generate random entropy
  3. Compute new parameters
  4. Upload contribution
  5. Destroy random values
  6. Provide attestation
```

### 3. Verification Phase
```
- Verify each contribution is valid
- Check cryptographic relationships
- Confirm randomness was added
- Validate participant attestations
```

### 4. Finalization
```
- Generate final proving/verification keys
- Publish parameters publicly
- Create ceremony transcript
- Archive attestations
```

## Implementation Considerations

### For Circuit Developers
- Use established ceremony tools (snarkjs, phase2-bn254)
- Consider using existing universal ceremonies
- Plan for ceremony before mainnet deployment
- Budget sufficient time (weeks to months)

### Security Best Practices
- Use hardware security modules (HSMs) when possible
- Perform ceremony on air-gapped machines
- Use multiple sources of entropy
- Document all steps and participants
- Enable community verification

### Transparency
- Make ceremony transcripts public
- Allow independent verification of contributions
- Document participant identities and attestations
- Enable anyone to verify the final parameters

## Tools and Libraries

### snarkjs
```bash
# Phase 1: Powers of Tau
snarkjs powersoftau new bn128 12 pot12_0000.ptau
snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau

# Phase 2: Circuit-specific
snarkjs powersoftau prepare phase2 pot12_final.ptau pot12_final.ptau
snarkjs groth16 setup circuit.r1cs pot12_final.ptau circuit_0000.zkey
snarkjs zkey contribute circuit_0000.zkey circuit_0001.zkey
snarkjs zkey export verificationkey circuit_final.zkey verification_key.json
```

### Circom Ecosystem
- **circom**: Circuit compiler
- **snarkjs**: Ceremony execution and proof generation
- **phase2-bn254**: Distributed ceremony coordination

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Single compromised participant | None (if others honest) | Use many participants |
| Parameter tampering | Invalid proofs | Cryptographic verification |
| Toxic waste retention | System compromise | Secure destruction process |
| Circuit changes | Parameters invalid | Version control and regeneration |

## Attestation Example

Participants typically provide signed attestations:

```
I, [Name], participated in the trusted setup ceremony on [Date].

Contribution hash: 0x[hash]
Random beacon: [beacon_value]

I certify that:
- I generated random entropy using [method]
- I destroyed all random values after computation
- I performed the ceremony on [environment]
- I did not retain any toxic waste

Signature: [digital_signature]
```

## Alternatives

### Transparent SNARKs (No Trusted Setup)
- **STARKs**: Uses hash functions, no setup needed
- **Bulletproofs**: No setup, but larger proofs
- **PLONK with Universal Setup**: Single ceremony for all circuits

### Trade-offs
- Trusted setup systems often have smaller proofs
- Setup-free systems may have higher verification costs
- Universal setups reduce ceremony burden

## References

- [Zcash Powers of Tau](https://zfnd.org/conclusion-of-the-powers-of-tau-ceremony/)
- [snarkjs Documentation](https://github.com/iden3/snarkjs)
- [Vitalik's Introduction to zk-SNARKs](https://vitalik.ca/general/2021/01/26/snarks.html)
- [Phase 2 Ceremony Guide](https://github.com/kobigurk/phase2-bn254)

## For This Project

### Current Implementation Status: ✅ Development Setup Complete

The project now includes an automated trusted setup for development and testing:

**Script:** `npm run setup:circuit`

This automated script ([scripts/setup-trusted-setup.ts](../scripts/setup-trusted-setup.ts)):
1. Compiles the test circuit
2. Generates Powers of Tau (2^12 constraints)
3. Performs single-party contribution
4. Generates proving and verification keys
5. Verifies the final parameters

**Generated Files** (in `circuits/build/`):
- `api_credit_proof_test_final.zkey` - Proving key
- `verification_key.json` - Verification key
- `pot12_final.ptau` - Powers of Tau parameters

**Current Status:**
- ✅ Development setup: Automated single-contributor ceremony
- ✅ Test circuit: Minimal circuit for fast iteration (~676 constraints)
- ⚠️ **NOT secure for production** - single participant only
- ⚠️ Automated entropy (not airgapped)

### Production Deployment Roadmap

When implementing the trusted setup ceremony for production:

1. **Development** (Current):
   - ✅ Automated test setup with `npm run setup:circuit`
   - ✅ Test circuit with fast proving/verification
   - ✅ Falls back to mock mode if setup missing

2. **Testnet** (Next):
   - Small ceremony (3-5 participants) to validate process
   - Use test circuit or simplified production circuit
   - Practice ceremony coordination and verification
   - Document ceremony process

3. **Mainnet** (Production):
   - Organize public ceremony with 50+ participants for maximum security
   - Use full production circuit ([api_credit_proof.circom](../circuits/api_credit_proof.circom))
   - Generate larger Powers of Tau (2^16 or higher)
   - Multiple rounds of contributions
   - At least 1 airgapped contributor
   - Publish ceremony transcript and final parameter hashes

4. **Maintenance**:
   - Plan for re-ceremonies if circuits are upgraded
   - Version control for all ceremony artifacts
   - Keep historical verification keys for old proofs

### Quick Start (Development)

```bash
# Complete automated setup
npm run setup:circuit

# Verify setup completed
ls circuits/build/*.zkey
ls circuits/build/verification_key.json

# Build and run server (will use real verification if setup complete)
npm run build
npm run start
```

### Migration to Production Circuit

To migrate from test circuit to production:

1. Update `scripts/setup-trusted-setup.ts`:
   ```typescript
   const CIRCUIT_NAME = 'api_credit_proof'; // was 'api_credit_proof_test'
   ```

2. Generate larger Powers of Tau:
   ```bash
   npx snarkjs powersoftau new bn128 16 pot16_0000.ptau
   # ... (takes ~30min on modern hardware)
   ```

3. Run multi-party ceremony (see ceremony coordination section above)

4. Update [SnarkjsProofService](../src/zk-api/snarkjs-proof.service.ts) paths

5. Update public signals extraction to match full circuit outputs

See [ZK.md](./ZK.md) for integration with the broader system architecture.
