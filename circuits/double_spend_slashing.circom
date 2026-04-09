pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/**
 * Production Double-Spend Slashing Circuit
 *
 * Proves:
 * 1. Two RLN signals exist with the same nullifier but different x values
 * 2. Secret key was correctly extracted from these signals
 * 3. The extracted secret key matches the claimed idCommitment
 * 4. All RLN mathematics are correct
 *
 * This allows anyone to prove a double-spend and claim the slashing reward
 */
template DoubleSpendSlashingProof() {
    // Private inputs (the two signals that reveal the secret)
    signal input signal1_x;
    signal input signal1_y;
    signal input signal2_x;
    signal input signal2_y;
    signal input ticketIndex;

    // Public inputs
    signal input secretKeyClaimed;        // The extracted secret key (public for slashing)
    signal input nullifierExpected;       // The duplicated nullifier

    // Public outputs
    signal output idCommitment;
    signal output nullifier;

    // 1. Verify signals have different x values (necessary for key extraction)
    component xDiffCheck = IsZero();
    xDiffCheck.in <== signal2_x - signal1_x;
    xDiffCheck.out === 0;  // Must NOT be zero (signals must differ)

    // 2. Compute 'a' from the claimed secret key
    // a = Poseidon(secretKey, ticketIndex)
    component aHash = Poseidon(2);
    aHash.inputs[0] <== secretKeyClaimed;
    aHash.inputs[1] <== ticketIndex;
    signal a;
    a <== aHash.out;

    // 3. Verify nullifier matches expected
    // nullifier = Poseidon(a)
    component nullifierHash = Poseidon(1);
    nullifierHash.inputs[0] <== a;
    nullifier <== nullifierHash.out;
    nullifier === nullifierExpected;

    // 4. Verify both signals are valid for the claimed secret key
    // Signal 1: y1 = secretKey + a * x1
    signal y1_computed;
    y1_computed <== secretKeyClaimed + a * signal1_x;
    signal1_y === y1_computed;

    // Signal 2: y2 = secretKey + a * x2
    signal y2_computed;
    y2_computed <== secretKeyClaimed + a * signal2_x;
    signal2_y === y2_computed;

    // 5. Verify secret key extraction is correct
    // Formula: k = (y1*x2 - y2*x1) / (x2 - x1)
    // Instead of division, verify: k * (x2 - x1) = (y1*x2 - y2*x1)
    signal term1;
    term1 <== signal1_y * signal2_x;

    signal term2;
    term2 <== signal2_y * signal1_x;

    signal numerator;
    numerator <== term1 - term2;

    signal denominator;
    denominator <== signal2_x - signal1_x;

    // Verify: secretKeyClaimed * denominator = numerator
    signal verification;
    verification <== secretKeyClaimed * denominator;
    verification === numerator;

    // 6. Compute identity commitment to verify it matches onchain record
    component idHash = Poseidon(1);
    idHash.inputs[0] <== secretKeyClaimed;
    idCommitment <== idHash.out;
}

component main {public [secretKeyClaimed, nullifierExpected]} = DoubleSpendSlashingProof();
