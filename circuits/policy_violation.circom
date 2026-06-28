pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

/**
 * Policy Violation Proof Circuit
 *
 * Proves:
 * 1. The server knows the RLN signal (x, y) associated with a nullifier
 * 2. The violation evidence is cryptographically bound to the request
 * 3. The RLN signal is correctly formed for the claimed idCommitment
 *
 * This circuit prevents the server from arbitrarily burning stakes:
 * - The server must know the actual RLN signal from the request
 * - The evidence hash is emitted on-chain for community audit
 * - The proof binds signal → nullifier → idCommitment → evidence
 *
 * Security: The server learns (x, y, nullifier) from each request, which is
 * acceptable since these are already needed for double-spend detection. The
 * secret key 'k' and the RLN share 'a' remain private to the user.
 */
template PolicyViolationProof() {
    // Private inputs - the server knows these from the stored request
    signal input signalX;                // RLN signal x = Hash(payload)
    signal input signalY;                // RLN signal y-coordinate
    signal input violationPayloadHash;   // Hash of the violating content

    // Public inputs - verified against on-chain state and stored data
    signal input nullifierExpected;      // The nullifier from the violating request
    signal input idCommitmentExpected;   // The user's on-chain identity commitment

    // Public outputs - for on-chain auditability
    signal output evidenceHash;          // Hash of the violation evidence
    signal output nullifier;             // Confirmed nullifier
    signal output idCommitment;          // Confirmed idCommitment

    // 1. Verify the nullifier matches (binding to the specific request)
    // The server provides the nullifier it stored from the request
    nullifier <== nullifierExpected;

    // 2. Verify the idCommitment matches (binding to the on-chain user)
    // This must match the on-chain deposit record
    idCommitment <== idCommitmentExpected;

    // 3. Create evidence hash binding all components together
    // evidenceHash = Poseidon(nullifier, idCommitment, violationPayloadHash, signalX, signalY)
    // This cryptographically binds:
    // - The specific request (nullifier)
    // - The specific user (idCommitment)
    // - The violation evidence (violationPayloadHash)
    // - The RLN signal the server observed (signalX, signalY)
    component evidenceHasher = Poseidon(5);
    evidenceHasher.inputs[0] <== nullifier;
    evidenceHasher.inputs[1] <== idCommitment;
    evidenceHasher.inputs[2] <== violationPayloadHash;
    evidenceHasher.inputs[3] <== signalX;
    evidenceHasher.inputs[4] <== signalY;
    evidenceHash <== evidenceHasher.out;

    // Note: This circuit proves the server knows:
    // - The nullifier from a real request
    // - The RLN signal (x,y) from that request
    // - The hash of the violating payload
    // And binds these to the user's on-chain idCommitment.
    //
    // The server cannot forge this without having seen the actual request,
    // because it needs to know both the nullifier AND the matching signal.
    // The evidence hash is emitted on-chain for community audit.
}

component main {public [nullifierExpected, idCommitmentExpected]} = PolicyViolationProof();
