// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NairaTagRegistry} from "../src/NairaTagRegistry.sol";
import {NairaTagResolver} from "../src/NairaTagResolver.sol";

interface Vm {
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployNairaTag {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant BSC_TESTNET_CHAIN_ID = 97;

    error WrongNetwork(uint256 actualChainId, uint256 expectedChainId);

    function run() external returns (NairaTagRegistry registry, NairaTagResolver resolver) {
        if (block.chainid != BSC_TESTNET_CHAIN_ID) {
            revert WrongNetwork(block.chainid, BSC_TESTNET_CHAIN_ID);
        }

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        registry = new NairaTagRegistry();
        resolver = new NairaTagResolver(address(registry));
        vm.stopBroadcast();
    }
}
