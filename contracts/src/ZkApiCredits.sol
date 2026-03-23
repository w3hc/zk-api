// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ZkApiCredits
 * @notice Privacy-preserving API credits system using Zero-Knowledge proofs and Rate-Limit Nullifiers
 * @dev Based on the Ethresear.ch proposal by Davide Crapis and Vitalik Buterin
 * https://ethresear.ch/t/zk-api-usage-credits-llms-and-beyond/24104
 */
contract ZkApiCredits is ReentrancyGuard, Pausable, Ownable {

    // ============ Structs ============

    struct Deposit {
        bytes32 idCommitment;      // Hash(secretKey) - user's anonymous identity
        uint256 rlnStake;          // D - Claimable by anyone proving double-spend
        uint256 policyStake;       // S - Burned (not claimed) for ToS violations
        uint256 timestamp;         // When the deposit was made
        bool active;               // Whether this deposit is still active
    }

    // ============ State Variables ============

    /// @notice Mapping from identity commitment to deposit details
    mapping(bytes32 => Deposit) public deposits;

    /// @notice Merkle root of all identity commitments (anonymity set)
    bytes32 public merkleRoot;

    /// @notice Set of all identity commitments (for Merkle tree construction)
    bytes32[] public identityCommitments;

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

    event ServerAddressUpdated(address indexed oldAddress, address indexed newAddress);

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
    }

    // ============ Core Functions ============

    /**
     * @notice Deposit ETH to participate in the ZK API system
     * @param _idCommitment Hash of the user's secret key (anonymous identity)
     * @dev msg.value should be at least minRlnStake + minPolicyStake
     * @dev 50% goes to RLN stake (D), 50% to policy stake (S)
     */
    function deposit(bytes32 _idCommitment) external payable nonReentrant whenNotPaused {
        if (msg.value < minRlnStake + minPolicyStake) revert InsufficientDeposit();
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

        emit DepositMade(_idCommitment, half, msg.value - half, block.timestamp);
    }

    /**
     * @notice Withdraw remaining funds (if not slashed)
     * @param _idCommitment The user's identity commitment
     * @param _recipient Address to receive the withdrawn funds
     * @param _secretKey The user's secret key (to prove ownership)
     */
    function withdraw(
        bytes32 _idCommitment,
        address payable _recipient,
        bytes32 _secretKey
    ) external nonReentrant {
        Deposit storage userDeposit = deposits[_idCommitment];
        if (!userDeposit.active) revert DepositNotFound();

        // Verify ownership: Hash(secretKey) should equal idCommitment
        if (keccak256(abi.encodePacked(_secretKey)) != _idCommitment) revert InvalidSecretKey();

        uint256 totalAmount = userDeposit.rlnStake + userDeposit.policyStake;

        // Mark as inactive
        userDeposit.active = false;
        userDeposit.rlnStake = 0;
        userDeposit.policyStake = 0;

        // Transfer funds
        (bool success, ) = _recipient.call{value: totalAmount}("");
        require(success, "Transfer failed");

        emit WithdrawalMade(_idCommitment, totalAmount, _recipient);
    }

    /**
     * @notice Slash user for double-spending (reusing same ticket index with different message)
     * @param _secretKey The revealed secret key (extracted from two RLN signals)
     * @param _nullifier1 First nullifier from double-spend
     * @param _nullifier2 Second nullifier from double-spend
     * @param _signal1 First RLN signal (x1, y1)
     * @param _signal2 Second RLN signal (x2, y2)
     * @dev Reward goes to the slasher who provided the proof
     */
    function slashDoubleSpend(
        bytes32 _secretKey,
        bytes32 _nullifier1,
        bytes32 _nullifier2,
        Signal calldata _signal1,
        Signal calldata _signal2
    ) external nonReentrant {
        bytes32 idCommitment = keccak256(abi.encodePacked(_secretKey));
        Deposit storage userDeposit = deposits[idCommitment];

        if (revealedSecretKeys[_secretKey]) revert AlreadySlashed();
        if (!userDeposit.active) revert DepositNotFound();

        // Verify the secret key was correctly extracted from two different signals
        // This is a simplified version - full implementation would verify RLN math
        require(_nullifier1 == _nullifier2, "Nullifiers must match");
        require(_signal1.x != _signal2.x, "Signals must differ");

        // Mark as slashed
        revealedSecretKeys[_secretKey] = true;
        slashedNullifiers[_nullifier1] = true;
        userDeposit.active = false;

        uint256 reward = userDeposit.rlnStake;
        userDeposit.rlnStake = 0;

        // Transfer reward to slasher
        (bool success, ) = msg.sender.call{value: reward}("");
        require(success, "Transfer failed");

        emit DoubleSpendSlashed(_secretKey, _nullifier1, msg.sender, reward);
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
        (bool success, ) = address(0).call{value: amountToBurn}("");
        require(success, "Burn failed");

        emit PolicyViolationSlashed(_nullifier, _idCommitment, amountToBurn);
    }

    /**
     * @notice Redeem a signed refund ticket from the server
     * @param _idCommitment User's identity commitment
     * @param _nullifier Nullifier from the original API request
     * @param _refundValue Refund amount in wei
     * @param _timestamp When the refund was issued
     * @param _signature Server's EdDSA signature on the refund data
     * @param _recipient Address to receive the refund
     * @dev Users submit signed refund tickets obtained from API responses
     */
    function redeemRefund(
        bytes32 _idCommitment,
        bytes32 _nullifier,
        uint256 _refundValue,
        uint256 _timestamp,
        EdDSASignature calldata _signature,
        address payable _recipient
    ) external nonReentrant {
        Deposit storage userDeposit = deposits[_idCommitment];
        if (!userDeposit.active) revert DepositNotFound();

        // Check if refund already redeemed
        if (redeemedRefunds[_nullifier]) revert RefundAlreadyRedeemed();

        // Check if nullifier was slashed
        if (slashedNullifiers[_nullifier]) revert AlreadySlashed();

        // Verify server signature on refund ticket
        bytes32 message = _hashRefundData(_nullifier, _refundValue, _timestamp);
        if (!_verifyEdDSASignature(message, _signature)) {
            revert InvalidSignature();
        }

        // Mark refund as redeemed
        redeemedRefunds[_nullifier] = true;

        // Transfer refund to recipient
        (bool success, ) = _recipient.call{value: _refundValue}("");
        require(success, "Refund transfer failed");

        emit RefundRedeemed(_idCommitment, _nullifier, _refundValue, _recipient);
    }

    // ============ View Functions ============

    /**
     * @notice Get deposit details for an identity commitment
     */
    function getDeposit(bytes32 _idCommitment) external view returns (Deposit memory) {
        return deposits[_idCommitment];
    }

    /**
     * @notice Get all identity commitments (for Merkle tree construction)
     */
    function getAllIdentityCommitments() external view returns (bytes32[] memory) {
        return identityCommitments;
    }

    /**
     * @notice Get the current size of the anonymity set
     */
    function getAnonymitySetSize() external view returns (uint256) {
        return identityCommitments.length;
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
    function setMinStakes(uint256 _minRlnStake, uint256 _minPolicyStake) external onlyOwner {
        minRlnStake = _minRlnStake;
        minPolicyStake = _minPolicyStake;
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
     * @dev Simplified implementation - production would use efficient incremental Merkle tree
     */
    function _updateMerkleRoot() internal {
        // Simple hash of all commitments (not a real Merkle tree)
        // In production, use proper Merkle tree library
        merkleRoot = keccak256(abi.encodePacked(identityCommitments));
        emit MerkleRootUpdated(merkleRoot, identityCommitments.length);
    }

    /**
     * @notice Verify ZK proof for policy violation
     * @dev Placeholder - real implementation would verify ZK-STARK proof
     */
    function _verifyPolicyProof(bytes calldata _proof) internal pure {
        // In production: Verify ZK proof that links nullifier to idCommitment
        // For now, we accept any proof since only trusted server can call
        require(_proof.length > 0, "Proof required");
    }

    /**
     * @notice Hash refund data for signature verification
     * @dev Matches the server-side hashing in RefundSignerService
     */
    function _hashRefundData(
        bytes32 _nullifier,
        uint256 _value,
        uint256 _timestamp
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_nullifier, _value, _timestamp));
    }

    /**
     * @notice Verify EdDSA signature on refund ticket
     * @dev Simplified verification for development - production would use proper EdDSA library
     * @dev This is a placeholder that checks signature structure
     */
    function _verifyEdDSASignature(
        bytes32 _message,
        EdDSASignature calldata _signature
    ) internal view returns (bool) {
        // In production, implement proper EdDSA signature verification using:
        // - circomlibjs for compatibility with ZK circuits
        // - or a Solidity EdDSA verification library

        // For now, we do basic validation:
        // 1. Signature components are non-zero
        // 2. Message is non-zero

        if (_message == bytes32(0)) return false;
        if (_signature.R8x == bytes32(0)) return false;
        if (_signature.R8y == bytes32(0)) return false;
        if (_signature.S == bytes32(0)) return false;

        // In production: Verify signature against serverPublicKey
        // EdDSA verification: s*B = R + H(R,A,M)*A
        // where A = serverPublicKey, R = (R8x, R8y), s = S

        return true; // Placeholder - accepts all non-zero signatures
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
