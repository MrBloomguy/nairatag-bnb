// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {NairaTagRegistry} from "../src/NairaTagRegistry.sol";
import {NairaTagResolver} from "../src/NairaTagResolver.sol";
import {NairaTagAgentIDActivation} from "../src/NairaTagAgentIDActivation.sol";

interface Vm {
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/**
 * @title DeployNairaTagMainnet
 * @notice Deterministic, atomic deployment script for NairaTag Network on BNB Smart Chain Mainnet (Chain ID 56).
 * @dev Enforces strict constructor dependency ordering:
 *      1. NairaTagRegistry
 *      2. NairaTagResolver (references Registry)
 *      3. NairaTagAgentIDActivation (references Registry + official SPACE ID Agent ID contract)
 */
contract DeployNairaTagMainnet {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 public constant BSC_MAINNET_CHAIN_ID = 56;
    uint256 public constant FORK_TEST_CHAIN_ID = 31337;

    address public constant OFFICIAL_AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    error WrongNetwork(uint256 actualChainId, uint256 expectedChainId);
    error MissingBytecode(address target);

    function run() external returns (
        NairaTagRegistry registry,
        NairaTagResolver resolver,
        NairaTagAgentIDActivation activation
    ) {
        if (block.chainid != BSC_MAINNET_CHAIN_ID && block.chainid != FORK_TEST_CHAIN_ID) {
            revert WrongNetwork(block.chainid, BSC_MAINNET_CHAIN_ID);
        }

        // Verify the official Agent ID contract exists on-chain before deploying
        if (OFFICIAL_AGENT_ID.code.length == 0) {
            revert MissingBytecode(OFFICIAL_AGENT_ID);
        }

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Registry (Namespace Authority)
        registry = new NairaTagRegistry();

        // 2. Deploy Resolver (Forward/Reverse Metadata)
        resolver = new NairaTagResolver(address(registry));

        // 3. Deploy Agent ID Activation (Permissionless Identity Ledger)
        activation = new NairaTagAgentIDActivation(address(registry), OFFICIAL_AGENT_ID);

        vm.stopBroadcast();
    }
}
