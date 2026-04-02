// SPDX-License-Identifier: LGPL-3.0
pragma solidity ^0.8.13;

import 'poseidon-solidity/PoseidonT2.sol';
import 'poseidon-solidity/PoseidonT3.sol';

/**
 * @title PoseidonHasher
 * @notice Poseidon hash function wrapper for ZK circuits compatibility
 * @dev Uses the poseidon-solidity library which provides optimized Poseidon implementations
 *      that match circomlib's Poseidon circuits exactly.
 *
 * This ensures complete compatibility between:
 * - Circuit constraints (circomlib Poseidon)
 * - Onchain verification (poseidon-solidity)
 * - Off-chain computations (circomlibjs)
 */
library PoseidonHasher {
    /**
     * @notice Hash a single field element using Poseidon
     * @dev Uses PoseidonT2 (t=2, meaning 1 input + 1 capacity)
     * @param input Single uint256 value to hash
     * @return Poseidon hash output as uint256
     */
    function hash(uint256 input) internal pure returns (uint256) {
        uint256[1] memory arr = [input];
        return PoseidonT2.hash(arr);
    }

    /**
     * @notice Hash two field elements using Poseidon
     * @dev Uses PoseidonT3 (t=3, meaning 2 inputs + 1 capacity)
     * @param left First uint256 value
     * @param right Second uint256 value
     * @return Poseidon hash output as uint256
     */
    function hash(uint256 left, uint256 right) internal pure returns (uint256) {
        uint256[2] memory arr = [left, right];
        return PoseidonT3.hash(arr);
    }

    /**
     * @notice Hash a bytes32 value by converting to uint256
     * @dev Converts bytes32 to uint256, hashes it, then converts back
     * @param input bytes32 value to hash
     * @return Poseidon hash output as bytes32
     */
    function hashBytes32(bytes32 input) internal pure returns (bytes32) {
        return bytes32(hash(uint256(input)));
    }

    /**
     * @notice Hash two bytes32 values
     * @dev Converts both inputs to uint256, hashes them, then converts result back
     * @param left First bytes32 value
     * @param right Second bytes32 value
     * @return Poseidon hash output as bytes32
     */
    function hashBytes32(
        bytes32 left,
        bytes32 right
    ) internal pure returns (bytes32) {
        return bytes32(hash(uint256(left), uint256(right)));
    }
}
