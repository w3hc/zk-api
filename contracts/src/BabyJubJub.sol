// SPDX-License-Identifier: LGPL-3.0
pragma solidity ^0.8.13;

/**
 * @title BabyJubJub
 * @notice Baby Jubjub elliptic curve operations for EdDSA signature verification
 * @dev Based on ERC-2494 and iden3's circomlib implementation
 * https://eips.ethereum.org/EIPS/eip-2494
 * https://github.com/iden3/circomlib/blob/master/circuits/babyjub.circom
 *
 * Baby Jubjub is a twisted Edwards curve defined over the scalar field of bn128:
 * ax^2 + y^2 = 1 + dx^2y^2
 * where:
 * - a = 168700
 * - d = 168696
 * - Order (subgroup) = 2736030358979909402780800718157159386076813972158567259200215660948447373041
 */
library BabyJubJub {
    // Curve parameters
    uint256 constant PRIME_Q =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    // Subgroup order
    uint256 constant SUBORDER =
        2736030358979909402780800718157159386076813972158567259200215660948447373041;

    // Generator point
    uint256 constant GX =
        5299619240641551281634865583518297030282874472190772894086521144482721001553;
    uint256 constant GY =
        16950150798460657717958625567821834550301663161624707787222815936182638968203;

    // Curve coefficients for twisted Edwards: ax^2 + y^2 = 1 + dx^2y^2
    uint256 constant D =
        168696;
    uint256 constant A =
        168700;

    /**
     * @notice Add two points on the Baby Jubjub curve
     * @dev Twisted Edwards addition formula
     * @param x1 X coordinate of first point
     * @param y1 Y coordinate of first point
     * @param x2 X coordinate of second point
     * @param y2 Y coordinate of second point
     * @return x3 X coordinate of result
     * @return y3 Y coordinate of result
     */
    function pointAdd(
        uint256 x1,
        uint256 y1,
        uint256 x2,
        uint256 y2
    ) internal pure returns (uint256 x3, uint256 y3) {
        uint256 beta = mulmod(x1, y2, PRIME_Q);
        uint256 gamma = mulmod(y1, x2, PRIME_Q);

        // Compute (y1 - A*x1) mod PRIME_Q safely
        uint256 term1 = addmod(y1, PRIME_Q - mulmod(A, x1, PRIME_Q), PRIME_Q);
        // Compute (y2 + A*x2) mod PRIME_Q
        uint256 term2 = addmod(y2, mulmod(A, x2, PRIME_Q), PRIME_Q);
        uint256 delta = mulmod(term1, term2, PRIME_Q);

        uint256 tau = mulmod(beta, gamma, PRIME_Q);
        uint256 dtau = mulmod(D, tau, PRIME_Q);

        // x3 = (beta + gamma) / (1 + d*tau)
        x3 = mulmod(
            addmod(beta, gamma, PRIME_Q),
            invmod(addmod(1, dtau, PRIME_Q), PRIME_Q),
            PRIME_Q
        );

        // y3 = (delta + A*beta - A*gamma) / (1 - d*tau)
        // = (delta + A*(beta - gamma)) / (1 - d*tau)
        uint256 betaMinusGamma = addmod(beta, PRIME_Q - gamma, PRIME_Q);
        uint256 numerator = addmod(delta, mulmod(A, betaMinusGamma, PRIME_Q), PRIME_Q);
        uint256 denominator = addmod(1, PRIME_Q - dtau, PRIME_Q); // 1 - dtau

        y3 = mulmod(numerator, invmod(denominator, PRIME_Q), PRIME_Q);
    }

    /**
     * @notice Scalar multiplication on Baby Jubjub curve
     * @dev Uses optimized double-and-add algorithm (skip leading zeros)
     * @param x X coordinate of base point
     * @param y Y coordinate of base point
     * @param scalar Scalar to multiply by
     * @return rx X coordinate of result
     * @return ry Y coordinate of result
     */
    function pointMul(
        uint256 x,
        uint256 y,
        uint256 scalar
    ) internal pure returns (uint256 rx, uint256 ry) {
        // Return point at infinity for scalar = 0
        if (scalar == 0) {
            return (0, 1);
        }

        // Find the highest set bit to avoid unnecessary iterations
        uint256 remaining = scalar;
        uint256 px = x;
        uint256 py = y;

        // Initialize result with the base point (since we know scalar > 0)
        rx = 0;
        ry = 1;
        bool started = false;

        // Only iterate through significant bits (big-endian)
        for (uint256 i = 0; i < 256; i++) {
            if (!started) {
                // Skip leading zeros
                if ((scalar >> (255 - i)) & 1 == 1) {
                    started = true;
                    rx = px;
                    ry = py;
                }
                continue;
            }

            // Double the accumulator
            (rx, ry) = pointAdd(rx, ry, rx, ry);

            // Add base point if bit is set
            if ((scalar >> (255 - i)) & 1 == 1) {
                (rx, ry) = pointAdd(rx, ry, px, py);
            }
        }
    }

    /**
     * @notice Compute modular inverse using Fermat's little theorem
     * @dev a^(-1) = a^(p-2) mod p for prime p
     * @param a Number to invert
     * @param p Prime modulus
     * @return Modular inverse of a
     */
    function invmod(uint256 a, uint256 p) internal pure returns (uint256) {
        return expmod(a, p - 2, p);
    }

    /**
     * @notice Modular exponentiation
     * @param base Base
     * @param exponent Exponent
     * @param modulus Modulus
     * @return Result of base^exponent mod modulus
     */
    function expmod(
        uint256 base,
        uint256 exponent,
        uint256 modulus
    ) internal pure returns (uint256) {
        uint256 result = 1;
        base = base % modulus;
        while (exponent > 0) {
            if (exponent % 2 == 1) {
                result = mulmod(result, base, modulus);
            }
            exponent = exponent >> 1;
            base = mulmod(base, base, modulus);
        }
        return result;
    }

    /**
     * @notice Verify a point is on the Baby Jubjub curve
     * @dev Check: ax^2 + y^2 = 1 + dx^2y^2
     * @param x X coordinate
     * @param y Y coordinate
     * @return True if point is on curve
     */
    function isOnCurve(uint256 x, uint256 y) internal pure returns (bool) {
        uint256 x2 = mulmod(x, x, PRIME_Q);
        uint256 y2 = mulmod(y, y, PRIME_Q);
        uint256 lhs = addmod(mulmod(A, x2, PRIME_Q), y2, PRIME_Q);
        uint256 rhs = addmod(
            1,
            mulmod(mulmod(D, x2, PRIME_Q), y2, PRIME_Q),
            PRIME_Q
        );
        return lhs == rhs;
    }
}
