// SPDX-License-Identifier: LGPL-3.0
pragma solidity 0.8.35;

/**
 * @title MockWithdrawalVerifier
 * @notice Mock verifier for testing withdrawal proof verification
 * @dev Returns true for valid mock proofs, false for invalid ones
 */
contract MockWithdrawalVerifier {
    /**
     * @notice Verify a withdrawal proof
     * @param proof The Groth16 proof components [pA, pB, pC]
     * @return bool True if the proof is valid (non-zero first element)
     */
    function verifyWithdrawalProof(
        uint[8] calldata proof,
        uint[6] calldata /* publicSignals */
    ) public pure returns (bool) {
        // Simple mock: valid if first proof element is non-zero
        // This allows tests to distinguish between valid and invalid proofs
        return proof[0] != 0;
    }
}
