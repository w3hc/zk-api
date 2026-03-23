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

When implementing the trusted setup ceremony for this zk-api project:

1. **Development**: Use test parameters with `snarkjs` for rapid iteration
2. **Testnet**: Perform small ceremony (3-5 participants) to validate process
3. **Mainnet**: Organize public ceremony with 50+ participants for maximum security
4. **Maintenance**: Plan for re-ceremonies if circuits are upgraded

See [ZK_IMPLEMENTATION_SUMMARY.md](../ZK_IMPLEMENTATION_SUMMARY.md) for integration with the broader system architecture.
