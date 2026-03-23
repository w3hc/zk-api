// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/ZkApiCredits.sol";

contract ZkApiCreditsTest is Test {
    ZkApiCredits public zkApi;

    address public owner;
    address public server;
    address public user1;
    address public user2;
    address public slasher;

    uint256 public constant MIN_RLN_STAKE = 0.005 ether;
    uint256 public constant MIN_POLICY_STAKE = 0.005 ether;
    uint256 public constant MIN_TOTAL_DEPOSIT = MIN_RLN_STAKE + MIN_POLICY_STAKE;

    // Test identity commitments (Hash of secret keys)
    bytes32 public idCommitment1;
    bytes32 public idCommitment2;
    bytes32 public secretKey1;
    bytes32 public secretKey2;

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

    function setUp() public {
        owner = address(this);
        server = makeAddr("server");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        slasher = makeAddr("slasher");

        // Deploy contract
        zkApi = new ZkApiCredits(server, MIN_RLN_STAKE, MIN_POLICY_STAKE);

        // Generate test identity commitments
        secretKey1 = keccak256(abi.encodePacked("secret1"));
        secretKey2 = keccak256(abi.encodePacked("secret2"));
        idCommitment1 = keccak256(abi.encodePacked(secretKey1));
        idCommitment2 = keccak256(abi.encodePacked(secretKey2));

        // Fund test users
        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);
        vm.deal(slasher, 1 ether);
    }

    // ============ Deposit Tests ============

    function test_Deposit_Success() public {
        uint256 depositAmount = 0.01 ether;

        vm.startPrank(user1);

        vm.expectEmit(true, false, false, true);
        emit DepositMade(idCommitment1, depositAmount / 2, depositAmount / 2, block.timestamp);

        zkApi.deposit{value: depositAmount}(idCommitment1);
        vm.stopPrank();

        // Verify deposit was recorded
        ZkApiCredits.Deposit memory dep = zkApi.getDeposit(idCommitment1);
        assertEq(dep.idCommitment, idCommitment1);
        assertEq(dep.rlnStake, depositAmount / 2);
        assertEq(dep.policyStake, depositAmount / 2);
        assertTrue(dep.active);
        assertEq(dep.timestamp, block.timestamp);

        // Verify anonymity set size increased
        assertEq(zkApi.getAnonymitySetSize(), 1);
    }

    function test_Deposit_InsufficientAmount() public {
        vm.startPrank(user1);

        vm.expectRevert(ZkApiCredits.InsufficientDeposit.selector);
        zkApi.deposit{value: 0.001 ether}(idCommitment1);

        vm.stopPrank();
    }

    function test_Deposit_AlreadyExists() public {
        vm.startPrank(user1);

        // First deposit succeeds
        zkApi.deposit{value: 0.01 ether}(idCommitment1);

        // Second deposit with same commitment fails
        vm.expectRevert(ZkApiCredits.DepositAlreadyExists.selector);
        zkApi.deposit{value: 0.01 ether}(idCommitment1);

        vm.stopPrank();
    }

    function test_Deposit_MultipleUsers() public {
        // User 1 deposits
        vm.prank(user1);
        zkApi.deposit{value: 0.01 ether}(idCommitment1);

        // User 2 deposits
        vm.prank(user2);
        zkApi.deposit{value: 0.02 ether}(idCommitment2);

        // Verify both deposits
        assertEq(zkApi.getAnonymitySetSize(), 2);
        assertTrue(zkApi.getDeposit(idCommitment1).active);
        assertTrue(zkApi.getDeposit(idCommitment2).active);
    }

    // ============ Withdrawal Tests ============

    function test_Withdraw_Success() public {
        uint256 depositAmount = 0.01 ether;

        // User deposits
        vm.prank(user1);
        zkApi.deposit{value: depositAmount}(idCommitment1);

        // User withdraws
        address payable recipient = payable(makeAddr("recipient"));
        uint256 balanceBefore = recipient.balance;

        vm.prank(user1);
        vm.expectEmit(true, true, false, true);
        emit WithdrawalMade(idCommitment1, depositAmount, recipient);

        zkApi.withdraw(idCommitment1, recipient, secretKey1);

        // Verify withdrawal
        assertEq(recipient.balance, balanceBefore + depositAmount);

        ZkApiCredits.Deposit memory dep = zkApi.getDeposit(idCommitment1);
        assertFalse(dep.active);
        assertEq(dep.rlnStake, 0);
        assertEq(dep.policyStake, 0);
    }

    function test_Withdraw_InvalidSecretKey() public {
        // User deposits
        vm.prank(user1);
        zkApi.deposit{value: 0.01 ether}(idCommitment1);

        // Try to withdraw with wrong secret key
        address payable recipient = payable(makeAddr("recipient"));
        bytes32 wrongSecret = keccak256(abi.encodePacked("wrong"));

        vm.prank(user1);
        vm.expectRevert(ZkApiCredits.InvalidSecretKey.selector);
        zkApi.withdraw(idCommitment1, recipient, wrongSecret);
    }

    function test_Withdraw_DepositNotFound() public {
        address payable recipient = payable(makeAddr("recipient"));

        vm.expectRevert(ZkApiCredits.DepositNotFound.selector);
        zkApi.withdraw(idCommitment1, recipient, secretKey1);
    }

    // ============ Double-Spend Slashing Tests ============

    function test_SlashDoubleSpend_Success() public {
        uint256 depositAmount = 0.01 ether;

        // User deposits
        vm.prank(user1);
        zkApi.deposit{value: depositAmount}(idCommitment1);

        // Simulate double-spend detection
        bytes32 nullifier = keccak256(abi.encodePacked("nullifier1"));
        ZkApiCredits.Signal memory signal1 = ZkApiCredits.Signal({x: 100, y: 200});
        ZkApiCredits.Signal memory signal2 = ZkApiCredits.Signal({x: 150, y: 250});

        uint256 slasherBalanceBefore = slasher.balance;

        // Slasher reports double-spend
        vm.prank(slasher);
        vm.expectEmit(true, true, true, true);
        emit DoubleSpendSlashed(secretKey1, nullifier, slasher, depositAmount / 2);

        zkApi.slashDoubleSpend(secretKey1, nullifier, nullifier, signal1, signal2);

        // Verify slashing
        assertTrue(zkApi.revealedSecretKeys(secretKey1));
        assertTrue(zkApi.slashedNullifiers(nullifier));
        assertEq(slasher.balance, slasherBalanceBefore + depositAmount / 2);

        ZkApiCredits.Deposit memory dep = zkApi.getDeposit(idCommitment1);
        assertFalse(dep.active);
        assertEq(dep.rlnStake, 0);
    }

    function test_SlashDoubleSpend_AlreadySlashed() public {
        // User deposits
        vm.prank(user1);
        zkApi.deposit{value: 0.01 ether}(idCommitment1);

        // First slash succeeds
        bytes32 nullifier = keccak256(abi.encodePacked("nullifier1"));
        ZkApiCredits.Signal memory signal1 = ZkApiCredits.Signal({x: 100, y: 200});
        ZkApiCredits.Signal memory signal2 = ZkApiCredits.Signal({x: 150, y: 250});

        vm.prank(slasher);
        zkApi.slashDoubleSpend(secretKey1, nullifier, nullifier, signal1, signal2);

        // Second slash fails
        vm.prank(slasher);
        vm.expectRevert(ZkApiCredits.AlreadySlashed.selector);
        zkApi.slashDoubleSpend(secretKey1, nullifier, nullifier, signal1, signal2);
    }

    // ============ Policy Violation Slashing Tests ============

    function test_SlashPolicyViolation_Success() public {
        uint256 depositAmount = 0.01 ether;

        // User deposits
        vm.prank(user1);
        zkApi.deposit{value: depositAmount}(idCommitment1);

        // Server slashes for policy violation
        bytes32 nullifier = keccak256(abi.encodePacked("violating_nullifier"));
        bytes memory proof = abi.encodePacked("zk_proof_data");

        vm.prank(server);
        vm.expectEmit(true, true, false, true);
        emit PolicyViolationSlashed(nullifier, idCommitment1, depositAmount / 2);

        zkApi.slashPolicyViolation(nullifier, idCommitment1, proof);

        // Verify policy stake was burned
        ZkApiCredits.Deposit memory dep = zkApi.getDeposit(idCommitment1);
        assertEq(dep.policyStake, 0);
        assertTrue(zkApi.slashedNullifiers(nullifier));
    }

    function test_SlashPolicyViolation_Unauthorized() public {
        // User deposits
        vm.prank(user1);
        zkApi.deposit{value: 0.01 ether}(idCommitment1);

        // Non-server tries to slash
        bytes32 nullifier = keccak256(abi.encodePacked("nullifier"));
        bytes memory proof = abi.encodePacked("proof");

        vm.prank(user2);
        vm.expectRevert(ZkApiCredits.Unauthorized.selector);
        zkApi.slashPolicyViolation(nullifier, idCommitment1, proof);
    }

    // ============ Admin Tests ============

    function test_SetServerAddress() public {
        address newServer = makeAddr("newServer");

        zkApi.setServerAddress(newServer);

        assertEq(zkApi.serverAddress(), newServer);
    }

    function test_SetMinStakes() public {
        uint256 newRlnStake = 0.01 ether;
        uint256 newPolicyStake = 0.02 ether;

        zkApi.setMinStakes(newRlnStake, newPolicyStake);

        assertEq(zkApi.minRlnStake(), newRlnStake);
        assertEq(zkApi.minPolicyStake(), newPolicyStake);
    }

    function test_PauseUnpause() public {
        // Pause
        zkApi.pause();

        // Deposits should fail when paused
        vm.prank(user1);
        vm.expectRevert();
        zkApi.deposit{value: 0.01 ether}(idCommitment1);

        // Unpause
        zkApi.unpause();

        // Deposits should work again
        vm.prank(user1);
        zkApi.deposit{value: 0.01 ether}(idCommitment1);
        assertTrue(zkApi.getDeposit(idCommitment1).active);
    }

    // ============ View Function Tests ============

    function test_GetAllIdentityCommitments() public {
        vm.prank(user1);
        zkApi.deposit{value: 0.01 ether}(idCommitment1);

        vm.prank(user2);
        zkApi.deposit{value: 0.01 ether}(idCommitment2);

        bytes32[] memory commitments = zkApi.getAllIdentityCommitments();
        assertEq(commitments.length, 2);
        assertEq(commitments[0], idCommitment1);
        assertEq(commitments[1], idCommitment2);
    }

    function test_MerkleRootUpdates() public {
        bytes32 rootBefore = zkApi.merkleRoot();

        vm.prank(user1);
        zkApi.deposit{value: 0.01 ether}(idCommitment1);

        bytes32 rootAfter = zkApi.merkleRoot();
        assertTrue(rootBefore != rootAfter);
    }
}
