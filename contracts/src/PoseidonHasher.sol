// SPDX-License-Identifier: LGPL-3.0
pragma solidity 0.8.35;

import {PoseidonT2} from 'poseidon-solidity/PoseidonT2.sol';
import {PoseidonT3} from 'poseidon-solidity/PoseidonT3.sol';

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

    /**
     * @notice Hash three field elements using Poseidon
     * @dev Uses iterative PoseidonT3: Poseidon(Poseidon(a, b), c)
     * @param a First uint256 value
     * @param b Second uint256 value
     * @param c Third uint256 value
     * @return Poseidon hash output as uint256
     */
    function hash3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256) {
        uint256 h = hash(a, b);
        return hash(h, c);
    }

    /**
     * @notice Hash four field elements using Poseidon
     * @dev Uses iterative PoseidonT3 to avoid large contract size of PoseidonT5
     * @dev Computes: Poseidon(Poseidon(Poseidon(a, b), c), d)
     * @param a First uint256 value
     * @param b Second uint256 value
     * @param c Third uint256 value
     * @param d Fourth uint256 value
     * @return Poseidon hash output as uint256
     */
    function hash4(uint256 a, uint256 b, uint256 c, uint256 d) internal pure returns (uint256) {
        uint256 h = hash(a, b);
        h = hash(h, c);
        return hash(h, d);
    }

    /**
     * @notice Hash five field elements using Poseidon
     * @dev Uses iterative PoseidonT3 to avoid large contract size of PoseidonT6
     * @dev Computes: Poseidon(Poseidon(Poseidon(Poseidon(inputs[0], inputs[1]), inputs[2]), inputs[3]), inputs[4])
     * @param inputs Array of 5 uint256 values to hash
     * @return Poseidon hash output as uint256
     */
    function hash5(uint256[5] memory inputs) internal pure returns (uint256) {
        // Iteratively hash pairs to avoid large Poseidon contracts
        uint256 h = hash(inputs[0], inputs[1]);
        h = hash(h, inputs[2]);
        h = hash(h, inputs[3]);
        h = hash(h, inputs[4]);
        return h;
    }
}
