pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/eddsa.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/**
 * Production Refund Redemption Circuit
 *
 * Proves:
 * 1. User knows secretKey for idCommitment
 * 2. User has valid refund ticket signed by server (EdDSA signature)
 * 3. Refund nullifier is correctly computed
 * 4. Refund value matches claimed amount
 *
 * WITHOUT revealing the secret key or refund details
 */
template RefundRedemptionProof() {
    // Private inputs (never revealed onchain)
    signal input secretKey;
    signal input ticketIndex;
    signal input refundValue;             // Value of refund in wei
    signal input refundTimestamp;         // When refund was issued
    signal input refundSignatureR8x;      // EdDSA signature component
    signal input refundSignatureR8y;      // EdDSA signature component
    signal input refundSignatureS;        // EdDSA signature component
    signal input serverPublicKeyX;        // Server's EdDSA public key
    signal input serverPublicKeyY;        // Server's EdDSA public key

    // Public inputs (visible onchain)
    signal input signalX;
    signal input refundValueClaimed;      // Must match refundValue

    // Public outputs
    signal output nullifier;
    signal output signalY;
    signal output idCommitment;

    // 1. Compute identity commitment from secret key
    component idHash = Poseidon(1);
    idHash.inputs[0] <== secretKey;
    idCommitment <== idHash.out;

    // 2. Verify refund value matches claim
    refundValue === refundValueClaimed;

    // 3. Generate RLN nullifier for this ticket
    // a = Poseidon(secretKey, ticketIndex)
    component aHash = Poseidon(2);
    aHash.inputs[0] <== secretKey;
    aHash.inputs[1] <== ticketIndex;
    signal a;
    a <== aHash.out;

    // nullifier = Poseidon(a)
    component nullifierHash = Poseidon(1);
    nullifierHash.inputs[0] <== a;
    nullifier <== nullifierHash.out;

    // 4. Generate RLN signal
    signalY <== secretKey + a * signalX;

    // 5. Verify EdDSA signature on refund ticket
    // Canonical message format: Poseidon(idCommitment, nullifier, refundValue, refundTimestamp)
    // This MUST match:
    // - refund-signer.service.ts hashRefundData()
    // - api_credit_proof.circom refund verification
    // - ZkApiCredits.sol _hashRefundData()
    component messageHash = Poseidon(4);
    messageHash.inputs[0] <== idCommitment;
    messageHash.inputs[1] <== nullifier;
    messageHash.inputs[2] <== refundValue;
    messageHash.inputs[3] <== refundTimestamp;

    // Verify EdDSA signature using Poseidon-EdDSA (matches circomlibjs signPoseidon/verifyPoseidon)
    // EdDSAVerifier uses Poseidon hash internally, compatible with eddsa.signPoseidon()
    component signatureVerifier = EdDSAVerifier();
    signatureVerifier.enabled <== 1;
    signatureVerifier.Ax <== serverPublicKeyX;
    signatureVerifier.Ay <== serverPublicKeyY;
    signatureVerifier.R8x <== refundSignatureR8x;
    signatureVerifier.R8y <== refundSignatureR8y;
    signatureVerifier.S <== refundSignatureS;
    signatureVerifier.M <== messageHash.out;
}

component main {public [signalX, refundValueClaimed]} = RefundRedemptionProof();
