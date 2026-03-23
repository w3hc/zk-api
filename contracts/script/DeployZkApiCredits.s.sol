// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/ZkApiCredits.sol";

contract DeployZkApiCredits is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address serverAddress = vm.envOr("SERVER_ADDRESS", address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266));

        // Min stakes: 0.1 ETH for RLN, 0.1 ETH for policy (0.2 ETH total minimum deposit)
        uint256 minRlnStake = 0.1 ether;
        uint256 minPolicyStake = 0.1 ether;

        vm.startBroadcast(deployerPrivateKey);

        ZkApiCredits zkApi = new ZkApiCredits(
            serverAddress,
            minRlnStake,
            minPolicyStake
        );

        console.log("ZkApiCredits deployed at:", address(zkApi));
        console.log("Server address:", serverAddress);
        console.log("Min RLN stake:", minRlnStake);
        console.log("Min Policy stake:", minPolicyStake);

        vm.stopBroadcast();
    }
}
