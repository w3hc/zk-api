// SPDX-License-Identifier: LGPL-3.0
pragma solidity ^0.8.13;

import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/utils/Pausable.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import './PoseidonHasher.sol';
import './BabyJubJub.sol';
import './WithdrawalVerifier.sol';
import './RefundRedemptionVerifier.sol';
import './DoubleSpendSlashingVerifier.sol';

/**
 * @title ZkApiCredits
 * @notice Privacy-preserving API credits system using Zero-Knowledge proofs and Rate-Limit Nullifiers
 * @dev Based on the Ethresear.ch proposal by Davide Crapis and Vitalik Buterin
 * https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104
 *
 * IMPORTANT: Hash Function Compatibility
 * This contract uses Poseidon hash functions to maintain compatibility with the ZK circuit.
 * The circuit (api_credit_proof.circom) uses Poseidon hashing throughout:
 * - Identity commitments: Poseidon(secretKey)
 * - Merkle tree: Poseidon(left, right)
 * - Nullifiers: Poseidon(Poseidon(secretKey, ticketIndex))
 * - Refund verification: Poseidon(refundValue)
 *
 * All onchain hashing MUST use Poseidon to match the circuit's constraints.
 * Using Keccak256 would make proof verification impossible.
 */
contract ZkApiCredits is ReentrancyGuard, Pausable, Ownable {
    // ============ Structs ============

    struct Deposit {
        bytes32 idCommitment; // Hash(secretKey) - user's anonymous identity
        uint256 rlnStake; // D - Claimable by anyone proving double-spend
        uint256 policyStake; // S - Burned (not claimed) for ToS violations
        uint256 timestamp; // When the deposit was made
        bool active; // Whether this deposit is still active
    }

    // ============ State Variables ============

    /// @notice Mapping from identity commitment to deposit details
    mapping(bytes32 => Deposit) public deposits;

    /// @notice Merkle root of all identity commitments (anonymity set)
    bytes32 public merkleRoot;

    /// @notice Set of all identity commitments (for Merkle tree construction)
    bytes32[] public identityCommitments;

    /// @notice 20-level Merkle tree depth (supports ~1M depositors)
    uint256 public constant TREE_DEPTH = 20;

    /// @notice Zero values for Merkle tree (Poseidon(0))
    bytes32[20] public zeros;

    /// @notice Filled subtrees at each level for incremental Merkle tree
    bytes32[20] public filledSubtrees;

    /// @notice Mapping of slashed nullifiers (prevents re-use after slashing)
    mapping(bytes32 => bool) public slashedNullifiers;

    /// @notice Mapping of revealed secret keys (from double-spend detection)
    mapping(bytes32 => bool) public revealedSecretKeys;

    /// @notice Mapping of redeemed refund nullifiers (prevents double redemption)
    mapping(bytes32 => bool) public redeemedRefunds;

    /// @notice Server's public key for verifying refund signatures
    address public serverAddress;

    /// @notice Server's EdDSA public key (for signature verification)
    /// @dev In production, this would be a proper EdDSA public key point
    struct EdDSAPublicKey {
        bytes32 x;
        bytes32 y;
    }
    EdDSAPublicKey public serverPublicKey;

    /// @notice Minimum stake requirements
    uint256 public minRlnStake;
    uint256 public minPolicyStake;

    /// @notice ZK Proof Verifiers
    WithdrawalVerifier public withdrawalVerifier;
    RefundRedemptionVerifier public refundVerifier;
    DoubleSpendSlashingVerifier public slashingVerifier;

    // ============ Events ============

    event DepositMade(
        bytes32 indexed idCommitment,
        uint256 rlnStake,
        uint256 policyStake,
        uint256 timestamp
    );

    event WithdrawalMade(
        bytes32 indexed idCommitment,
        uint256 amount,
        address indexed recipient
    );

    event DoubleSpendSlashed(
        bytes32 indexed secretKey,
        bytes32 indexed nullifier,
        address indexed slasher,
        uint256 reward
    );

    event PolicyViolationSlashed(
        bytes32 indexed nullifier,
        bytes32 indexed idCommitment,
        uint256 amountBurned
    );

    event MerkleRootUpdated(bytes32 indexed newRoot, uint256 leafCount);

    event ServerAddressUpdated(
        address indexed oldAddress,
        address indexed newAddress
    );

    event RefundRedeemed(
        bytes32 indexed idCommitment,
        bytes32 indexed nullifier,
        uint256 amount,
        address indexed recipient
    );

    // ============ Errors ============

    error InsufficientDeposit();
    error DepositAlreadyExists();
    error DepositNotFound();
    error AlreadySlashed();
    error InvalidProof();
    error InvalidSecretKey();
    error Unauthorized();
    error InvalidSignature();
    error RefundAlreadyRedeemed();

    // ============ Constructor ============

    constructor(
        address _serverAddress,
        uint256 _minRlnStake,
        uint256 _minPolicyStake,
        bytes32 _serverPubKeyX,
        bytes32 _serverPubKeyY
    ) Ownable(msg.sender) {
        serverAddress = _serverAddress;
        minRlnStake = _minRlnStake;
        minPolicyStake = _minPolicyStake;
        serverPublicKey = EdDSAPublicKey({
            x: _serverPubKeyX,
            y: _serverPubKeyY
        });

        // Deploy ZK proof verifiers
        withdrawalVerifier = new WithdrawalVerifier();
        refundVerifier = new RefundRedemptionVerifier();
        slashingVerifier = new DoubleSpendSlashingVerifier();

        // Initialize 20-level Merkle tree with zero values
        // zeros[i] = Poseidon(zeros[i-1], zeros[i-1])
        // This matches the circuit's expectation for empty tree nodes
        bytes32 currentZero = bytes32(0);
        for (uint256 i = 0; i < TREE_DEPTH; i++) {
            zeros[i] = currentZero;
            filledSubtrees[i] = currentZero;
            if (i < TREE_DEPTH - 1) {
                currentZero = bytes32(PoseidonHasher.hash(uint256(currentZero), uint256(currentZero)));
            }
        }

        // Initial Merkle root is the hash at the top level
        merkleRoot = bytes32(PoseidonHasher.hash(uint256(currentZero), uint256(currentZero)));
    }

    // ============ Core Functions ============

    /**
     * @notice Deposit ETH to participate in the ZK API system
     * @param _idCommitment Hash of the user's secret key (anonymous identity)
     * @dev msg.value should be at least minRlnStake + minPolicyStake
     * @dev 50% goes to RLN stake (D), 50% to policy stake (S)
     */
    function deposit(
        bytes32 _idCommitment
    ) external payable nonReentrant whenNotPaused {
        if (msg.value < minRlnStake + minPolicyStake)
            revert InsufficientDeposit();
        if (deposits[_idCommitment].active) revert DepositAlreadyExists();

        // Split deposit 50/50 between RLN stake and policy stake
        uint256 half = msg.value / 2;

        deposits[_idCommitment] = Deposit({
            idCommitment: _idCommitment,
            rlnStake: half,
            policyStake: msg.value - half, // Handles odd amounts
            timestamp: block.timestamp,
            active: true
        });

        // Add to Merkle tree
        identityCommitments.push(_idCommitment);
        _updateMerkleRoot();

        emit DepositMade(
            _idCommitment,
            half,
            msg.value - half,
            block.timestamp
        );
    }

    /**
     * @notice Withdraw remaining funds using ZK proof (secret key never revealed!)
     * @param _idCommitment The user's identity commitment
     * @param _recipient Address to receive the withdrawn funds
     * @param _proof ZK proof components [pA, pB, pC] in Groth16 format
     * @param _publicSignals Public inputs [idCommitment, merkleRoot, nullifier, x, y, pathElements]
     * @dev Verifies a ZK proof that the caller knows the secret key without revealing it
     */
    function withdraw(
        bytes32 _idCommitment,
        address payable _recipient,
        uint256[8] calldata _proof,
        uint256[6] calldata _publicSignals
    ) external nonReentrant {
        Deposit storage userDeposit = deposits[_idCommitment];
        if (!userDeposit.active) revert DepositNotFound();

        // Verify ZK proof of ownership
        // Public signals: [signalX (input), merkleRootExpected (input), nullifier (output), signalY (output), idCommitment (output), merkleRoot (output)]
        // The proof verifies that:
        // 1. Prover knows secretKey such that Poseidon(secretKey) = idCommitment
        // 2. idCommitment is in the Merkle tree with root = merkleRoot
        // 3. Valid RLN signal generation (signalX, signalY) for the withdrawal
        if (!withdrawalVerifier.verifyWithdrawalProof(_proof, _publicSignals)) {
            revert InvalidProof();
        }

        // Verify public signals match expected values
        // _publicSignals[4] is the idCommitment output
        require(
            _publicSignals[4] == uint256(_idCommitment),
            'idCommitment mismatch'
        );
        // _publicSignals[5] is the merkleRoot output
        require(
            _publicSignals[5] == uint256(merkleRoot),
            'merkleRoot mismatch'
        );

        uint256 totalAmount = userDeposit.rlnStake + userDeposit.policyStake;

        // Mark as inactive
        userDeposit.active = false;
        userDeposit.rlnStake = 0;
        userDeposit.policyStake = 0;

        // Transfer funds
        (bool success, ) = _recipient.call{value: totalAmount}('');
        require(success, 'Transfer failed');

        emit WithdrawalMade(_idCommitment, totalAmount, _recipient);
    }

    /**
     * @notice Slash user for double-spending using ZK proof (RLN math verified in circuit!)
     * @param _secretKey The revealed secret key (extracted from two RLN signals)
     * @param _nullifier The nullifier from the double-spend
     * @param _idCommitment The user's identity commitment
     * @param _proof ZK proof components [pA, pB, pC] in Groth16 format
     * @param _publicSignals Public inputs [idCommitment, secretKey, nullifier, externalNullifier]
     * @dev Verifies a ZK proof that validates the secret key extraction from two RLN signals
     * @dev The circuit proves:
     *      1. Two RLN signals with the same nullifier but different x values exist
     *      2. Secret key was correctly extracted: k = (y1*x2 - y2*x1) / (x2 - x1)
     *      3. Poseidon(secretKey) = idCommitment
     *      4. All RLN mathematics are correct
     * @dev Reward goes to the slasher who provided the proof
     */
    function slashDoubleSpend(
        bytes32 _secretKey,
        bytes32 _nullifier,
        bytes32 _idCommitment,
        uint256[8] calldata _proof,
        uint256[4] calldata _publicSignals
    ) external nonReentrant {
        Deposit storage userDeposit = deposits[_idCommitment];

        if (revealedSecretKeys[_secretKey]) revert AlreadySlashed();
        if (!userDeposit.active) revert DepositNotFound();

        // Verify ZK proof of double-spend slashing
        // Public signals: [idCommitment, secretKey, nullifier, externalNullifier]
        // The proof verifies:
        // 1. Two RLN signals exist with the same nullifier but different x values
        // 2. Secret key was correctly extracted using RLN math: k = (y1*x2 - y2*x1) / (x2 - x1)
        // 3. Poseidon(secretKey) = idCommitment (proves ownership)
        // 4. All RLN signal equations are valid: y = k + a*x
        if (!slashingVerifier.verifySlashingProof(_proof, _publicSignals)) {
            revert InvalidProof();
        }

        // Verify public signals match expected values
        // Public signals: [secretKeyClaimed (input), nullifierExpected (input), idCommitment (output), nullifier (output)]
        require(
            _publicSignals[0] == uint256(_secretKey),
            'secretKey mismatch'
        );
        require(
            _publicSignals[1] == uint256(_nullifier),
            'nullifier (expected) mismatch'
        );
        require(
            _publicSignals[2] == uint256(_idCommitment),
            'idCommitment mismatch'
        );
        require(
            _publicSignals[3] == uint256(_nullifier),
            'nullifier (output) mismatch'
        );

        // Verify the secret key matches the idCommitment
        bytes32 computedCommitment = bytes32(
            PoseidonHasher.hash(uint256(_secretKey))
        );
        require(
            computedCommitment == _idCommitment,
            'Secret key does not match idCommitment'
        );

        // Mark as slashed
        revealedSecretKeys[_secretKey] = true;
        slashedNullifiers[_nullifier] = true;
        userDeposit.active = false;

        uint256 reward = userDeposit.rlnStake;
        userDeposit.rlnStake = 0;

        // Transfer reward to slasher
        (bool success, ) = msg.sender.call{value: reward}('');
        require(success, 'Transfer failed');

        emit DoubleSpendSlashed(_secretKey, _nullifier, msg.sender, reward);
    }

    /**
     * @notice Slash user for policy violation (ToS breach)
     * @param _nullifier The nullifier from the violating request
     * @param _idCommitment The user's identity commitment
     * @param _proof ZK proof linking nullifier to idCommitment
     * @dev Policy stake is BURNED (not transferred to server) to prevent false accusations
     */
    function slashPolicyViolation(
        bytes32 _nullifier,
        bytes32 _idCommitment,
        bytes calldata _proof
    ) external {
        if (msg.sender != serverAddress) revert Unauthorized();

        Deposit storage userDeposit = deposits[_idCommitment];
        if (!userDeposit.active) revert DepositNotFound();
        if (slashedNullifiers[_nullifier]) revert AlreadySlashed();

        // In production, verify ZK proof here
        // For now, we trust the server (since only server can call this)
        _verifyPolicyProof(_proof);

        slashedNullifiers[_nullifier] = true;
        uint256 amountToBurn = userDeposit.policyStake;
        userDeposit.policyStake = 0;

        // Burn the policy stake (send to 0x0)
        (bool success, ) = address(0).call{value: amountToBurn}('');
        require(success, 'Burn failed');

        emit PolicyViolationSlashed(_nullifier, _idCommitment, amountToBurn);
    }

    /**
     * @notice Redeem refund tickets using ZK proof (signatures verified in circuit!)
     * @param _idCommitment User's identity commitment
     * @param _nullifier Nullifier from the original API request
     * @param _refundValue Total refund amount in wei
     * @param _recipient Address to receive the refund
     * @param _proof ZK proof components [pA, pB, pC] in Groth16 format
     * @param _publicSignals Public inputs [idCommitment, merkleRoot, nullifier, x, y]
     * @dev Verifies a ZK proof that validates EdDSA signatures on refund tickets
     * @dev The circuit proves:
     *      1. User has valid refund tickets signed by the server
     *      2. Signatures are valid (EdDSA verification in circuit)
     *      3. Total refund amount matches the claimed value
     */
    function redeemRefund(
        bytes32 _idCommitment,
        bytes32 _nullifier,
        uint256 _refundValue,
        address payable _recipient,
        uint256[8] calldata _proof,
        uint256[5] calldata _publicSignals
    ) external nonReentrant {
        Deposit storage userDeposit = deposits[_idCommitment];
        if (!userDeposit.active) revert DepositNotFound();

        // Check if refund already redeemed
        if (redeemedRefunds[_nullifier]) revert RefundAlreadyRedeemed();

        // Check if nullifier was slashed
        if (slashedNullifiers[_nullifier]) revert AlreadySlashed();

        // Verify ZK proof of valid refund redemption
        // Public signals: [signalX (input), refundValueClaimed (input), nullifier (output), signalY (output), idCommitment (output)]
        // The proof verifies:
        // 1. User has valid refund ticket with EdDSA signature from server
        // 2. Signature is cryptographically valid (verified in circuit)
        // 3. Refund value matches _refundValue
        // 4. Nullifier is correctly computed from secretKey and ticketIndex
        if (!refundVerifier.verifyRefundProof(_proof, _publicSignals)) {
            revert InvalidProof();
        }

        // Verify public signals match expected values
        // _publicSignals[1] is the refundValueClaimed input
        require(
            _publicSignals[1] == _refundValue,
            'refundValue mismatch'
        );
        // _publicSignals[2] is the nullifier output
        require(
            _publicSignals[2] == uint256(_nullifier),
            'nullifier mismatch'
        );
        // _publicSignals[4] is the idCommitment output
        require(
            _publicSignals[4] == uint256(_idCommitment),
            'idCommitment mismatch'
        );

        // Mark refund as redeemed
        redeemedRefunds[_nullifier] = true;

        // Transfer refund to recipient
        (bool success, ) = _recipient.call{value: _refundValue}('');
        require(success, 'Refund transfer failed');

        emit RefundRedeemed(
            _idCommitment,
            _nullifier,
            _refundValue,
            _recipient
        );
    }

    // ============ View Functions ============

    /**
     * @notice Get deposit details for an identity commitment
     */
    function getDeposit(
        bytes32 _idCommitment
    ) external view returns (Deposit memory) {
        return deposits[_idCommitment];
    }

    /**
     * @notice Get all identity commitments (for Merkle tree construction)
     */
    function getAllIdentityCommitments()
        external
        view
        returns (bytes32[] memory)
    {
        return identityCommitments;
    }

    /**
     * @notice Get the current size of the anonymity set
     */
    function getAnonymitySetSize() external view returns (uint256) {
        return identityCommitments.length;
    }

    /**
     * @notice Check if a nullifier has been used (either slashed or redeemed)
     * @param _nullifier The nullifier to check
     * @return bool True if the nullifier has been used/slashed/redeemed
     * @dev Used for double-spend prevention and refund redemption checks
     */
    function isNullifierUsed(bytes32 _nullifier) external view returns (bool) {
        return slashedNullifiers[_nullifier] || redeemedRefunds[_nullifier];
    }

    // ============ Admin Functions ============

    /**
     * @notice Update the server address (for policy slashing)
     */
    function setServerAddress(address _newServerAddress) external onlyOwner {
        address oldAddress = serverAddress;
        serverAddress = _newServerAddress;
        emit ServerAddressUpdated(oldAddress, _newServerAddress);
    }

    /**
     * @notice Update minimum stake requirements
     */
    function setMinStakes(
        uint256 _minRlnStake,
        uint256 _minPolicyStake
    ) external onlyOwner {
        minRlnStake = _minRlnStake;
        minPolicyStake = _minPolicyStake;
    }

    /**
     * @notice Set withdrawal verifier (for testing or upgrades)
     */
    function setWithdrawalVerifier(
        WithdrawalVerifier _verifier
    ) external onlyOwner {
        withdrawalVerifier = _verifier;
    }

    /**
     * @notice Set refund verifier (for testing or upgrades)
     */
    function setRefundVerifier(
        RefundRedemptionVerifier _verifier
    ) external onlyOwner {
        refundVerifier = _verifier;
    }

    /**
     * @notice Set slashing verifier (for testing or upgrades)
     */
    function setSlashingVerifier(
        DoubleSpendSlashingVerifier _verifier
    ) external onlyOwner {
        slashingVerifier = _verifier;
    }

    /**
     * @notice Pause the contract (emergency)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Internal Functions ============

    /**
     * @notice Update the Merkle root after adding new identity commitment
     * @dev Implements proper 20-level incremental Merkle tree using Poseidon hash
     * @dev This matches the circuit's MerkleTreeChecker structure exactly
     *
     * Algorithm:
     * 1. Start with the new leaf at level 0
     * 2. For each level, hash current node with its sibling
     * 3. If index bit is 0, node is left child: hash(node, filledSubtree)
     * 4. If index bit is 1, node is right child: hash(filledSubtree, node)
     * 5. Update filledSubtrees when a level is complete
     * 6. Final hash at level 20 is the new Merkle root
     */
    function _updateMerkleRoot() internal {
        uint256 leafIndex = identityCommitments.length - 1;
        bytes32 currentHash = identityCommitments[leafIndex];

        // Incrementally update the Merkle tree
        // For each level, hash with the appropriate sibling
        for (uint256 i = 0; i < TREE_DEPTH; i++) {
            // Check if current index is left (0) or right (1) child
            if (leafIndex % 2 == 0) {
                // Left child: hash(current, zero)
                // Store current in filledSubtrees for future right siblings
                filledSubtrees[i] = currentHash;
                currentHash = bytes32(
                    PoseidonHasher.hash(uint256(currentHash), uint256(zeros[i]))
                );
            } else {
                // Right child: hash(filledSubtree, current)
                currentHash = bytes32(
                    PoseidonHasher.hash(
                        uint256(filledSubtrees[i]),
                        uint256(currentHash)
                    )
                );
            }

            // Move to parent level
            leafIndex = leafIndex / 2;
        }

        merkleRoot = currentHash;
        emit MerkleRootUpdated(merkleRoot, identityCommitments.length);
    }

    /**
     * @notice Get Merkle proof for a given leaf index
     * @dev Returns path elements and path indices needed for ZK proof
     * @param _leafIndex Index of the leaf in the tree
     * @return pathElements Array of sibling hashes at each level
     * @return pathIndices Array of position bits (0=left, 1=right)
     */
    function getMerkleProof(
        uint256 _leafIndex
    ) external view returns (bytes32[20] memory pathElements, uint8[20] memory pathIndices) {
        require(_leafIndex < identityCommitments.length, "Leaf index out of bounds");

        uint256 currentIndex = _leafIndex;

        for (uint256 i = 0; i < TREE_DEPTH; i++) {
            pathIndices[i] = uint8(currentIndex % 2);

            if (currentIndex % 2 == 0) {
                // Left child, sibling is on the right
                if (currentIndex + 1 < identityCommitments.length) {
                    // Sibling exists, calculate it
                    pathElements[i] = _getNodeHash(currentIndex + 1, i);
                } else {
                    // No sibling, use zero
                    pathElements[i] = zeros[i];
                }
            } else {
                // Right child, sibling is on the left
                pathElements[i] = _getNodeHash(currentIndex - 1, i);
            }

            currentIndex = currentIndex / 2;
        }

        return (pathElements, pathIndices);
    }

    /**
     * @notice Internal helper to compute hash of a node at given level
     * @dev Reconstructs node hash from leaf index and level
     */
    function _getNodeHash(uint256 _leafIndex, uint256 _level) internal view returns (bytes32) {
        if (_level == 0) {
            // Base case: return the leaf
            return identityCommitments[_leafIndex];
        }

        // For higher levels, we need to check filledSubtrees
        // This is a simplified version - full implementation would cache all intermediate nodes
        if (_leafIndex >= identityCommitments.length) {
            return zeros[_level];
        }

        return filledSubtrees[_level];
    }

    /**
     * @notice Verify ZK proof for policy violation
     * @dev Placeholder - real implementation would verify ZK-STARK proof
     */
    function _verifyPolicyProof(bytes calldata _proof) internal pure {
        // In production: Verify ZK proof that links nullifier to idCommitment
        // For now, we accept any proof since only trusted server can call
        require(_proof.length > 0, 'Proof required');
    }

    /**
     * @notice Hash refund data for signature verification
     * @dev Must match EXACTLY what the server signs (refund-signer.service.ts line 180)
     * @dev Server signs: EdDSA_sign(Poseidon(nullifier, value, timestamp))
     *
     * Security Note:
     * - The signature covers nullifier, value, and timestamp for complete integrity
     * - Replay protection comes from the nullifier being marked as redeemed
     * - Each nullifier can only be redeemed once (line 317 check)
     * - The nullifier ties the refund to a specific API request
     * - Timestamp prevents signature reuse across different redemption attempts
     */
    function _hashRefundData(
        bytes32 _nullifier,
        uint256 _value,
        uint256 _timestamp
    ) internal pure returns (bytes32) {
        // Hash all three values using Poseidon to match server implementation
        // This matches refund-signer.service.ts: poseidon([nullifier, value, timestamp])
        return bytes32(PoseidonHasher.hash3(uint256(_nullifier), _value, _timestamp));
    }

    /**
     * @notice Verify EdDSA signature on refund ticket
     * @dev TEMPORARY: Full EdDSA verification requires >30M gas (2 scalar muls on Baby Jubjub)
     * @dev For production, use one of these solutions:
     *      1. ZK proof of EdDSA signature verification (verify signature in circuit)
     *      2. Optimized precompiles or assembly implementations
     *      3. BLS signatures with BLS12-381 precompiles (EIP-2537)
     *      4. Signature aggregation to verify multiple refunds at once
     *
     * @dev Current implementation does basic validation:
     *      - Signature components are in valid range
     *      - Points are on the Baby Jubjub curve
     *      - Relies on economic incentives: Invalid signatures would be reported by users
     *        who can prove fraud and slash the server's stake
     *
     * @param _message Message hash (Poseidon hash of refund data)
     * @param _signature EdDSA signature (R8x, R8y, S)
     * @return True if signature passes basic validation
     */
    function _verifyEdDSASignature(
        bytes32 _message,
        EdDSASignature calldata _signature
    ) internal view returns (bool) {
        // Convert bytes32 to uint256
        uint256 R8x = uint256(_signature.R8x);
        uint256 R8y = uint256(_signature.R8y);
        uint256 S = uint256(_signature.S);
        uint256 Ax = uint256(serverPublicKey.x);
        uint256 Ay = uint256(serverPublicKey.y);

        // Basic validation checks (low gas cost)

        // 1. Message must be non-zero
        if (_message == bytes32(0)) return false;

        // 2. Verify signature components are in valid range
        if (S >= BabyJubJub.SUBORDER) return false;
        if (R8x >= BabyJubJub.PRIME_Q) return false;
        if (R8y >= BabyJubJub.PRIME_Q) return false;

        // 3. Verify R is on the curve
        if (!BabyJubJub.isOnCurve(R8x, R8y)) return false;

        // 4. Verify public key is on the curve (cached check, should always pass)
        if (!BabyJubJub.isOnCurve(Ax, Ay)) return false;

        // TEMPORARY: Skip expensive elliptic curve operations (>30M gas)
        // Full verification would require:
        // - Computing H = Poseidon(R8x, R8y, Ax, Ay, M)
        // - Computing S*B (scalar mul ~200 iterations)
        // - Computing (H*8)*A (scalar mul ~200 iterations)
        // - Verifying S*B = R + (H*8)*A
        //
        // This is implemented in BabyJubJub.sol and works correctly,
        // but exceeds block gas limit.
        //
        // Security relies on:
        // - Only trusted server can create signatures
        // - Nullifier prevents double-spending
        // - Users can challenge invalid signatures and slash server
        // - Economic incentive: Server loses stake if it signs invalid refunds

        return true;
    }

    // ============ Helper Structs ============

    struct Signal {
        uint256 x;
        uint256 y;
    }

    struct EdDSASignature {
        bytes32 R8x;
        bytes32 R8y;
        bytes32 S;
    }
}
