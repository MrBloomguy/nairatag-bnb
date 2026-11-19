// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {NairaTagRegistry} from "../src/NairaTagRegistry.sol";
import {NairaTagAgentIDActivation} from "../src/NairaTagAgentIDActivation.sol";
import {INairaTagAgentIDActivation} from "../src/interfaces/INairaTagAgentIDActivation.sol";
import {IBinanceAgentID} from "../src/interfaces/IBinanceAgentID.sol";

interface Vm {
    function prank(address sender) external;
    function deal(address who, uint256 newBalance) external;
    function createSelectFork(string calldata urlOrAlias) external returns (uint256);
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertTrue(bool condition) internal pure {
        require(condition, "assertTrue failed");
    }

    function assertFalse(bool condition) internal pure {
        require(!condition, "assertFalse failed");
    }

    function assertEq(address actual, address expected) internal pure {
        require(actual == expected, "address mismatch");
    }

    function assertEq(uint256 actual, uint256 expected) internal pure {
        require(actual == expected, "uint256 mismatch");
    }

    function assertEq(bytes32 actual, bytes32 expected) internal pure {
        require(actual == expected, "bytes32 mismatch");
    }
}

/**
 * @title NairaTagAgentIDActivationForkTest
 * @notice Tests NairaTagAgentIDActivation directly against live BNB Smart Chain Mainnet state (Chain ID 56).
 * @dev Verifies that the deployed contract interacts seamlessly with the official SPACE ID Agent ID contract,
 *      including impersonating a verified on-chain holder with balanceOf == 1.
 */
contract NairaTagAgentIDActivationForkTest is TestBase {
    address public constant OFFICIAL_AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    /// @notice A verified real-world wallet on BNB Mainnet holding the official SPACE ID Agent ID
    address public constant REAL_MAINNET_HOLDER = 0xE077ab2259170199d398ec8d70D44d7dde1C6e06;

    NairaTagRegistry private registry;
    NairaTagAgentIDActivation private activationContract;
    bool private forkActive;

    function setUp() public {
        if (block.chainid != 56) {
            try vm.createSelectFork("https://bsc-dataseed.binance.org") {
                forkActive = true;
            } catch {
                return;
            }
        } else {
            forkActive = true;
        }

        if (OFFICIAL_AGENT_ID.code.length == 0) {
            return;
        }

        registry = new NairaTagRegistry();
        activationContract = new NairaTagAgentIDActivation(address(registry), OFFICIAL_AGENT_ID);
    }

    function test_Fork_OfficialAgentIDBytecodeAndInterface() public view {
        if (!forkActive || OFFICIAL_AGENT_ID.code.length == 0) return;

        assertEq(address(activationContract.agentIdContract()), OFFICIAL_AGENT_ID);
        assertEq(activationContract.OFFICIAL_AGENT_ID(), OFFICIAL_AGENT_ID);
        assertTrue(OFFICIAL_AGENT_ID.code.length > 0);

        // Call balanceOf on our deployer address (non-holder) on the live fork
        address nonHolder = address(0x961d16fD035d0367DC4A08b6c0d41061901A14AA);
        uint256 bal = IBinanceAgentID(OFFICIAL_AGENT_ID).balanceOf(nonHolder);
        assertEq(bal, 0);
    }

    function test_Fork_RevertIfCallerLacksAgentIDOnMainnet() public {
        if (!forkActive || OFFICIAL_AGENT_ID.code.length == 0) return;

        address nonHolder = address(0x961d16fD035d0367DC4A08b6c0d41061901A14AA);
        vm.prank(nonHolder);
        bytes32 node = registry.claim("testtag");

        // Calling activate on live fork reverts because nonHolder has 0 Agent ID on BNB Mainnet
        vm.prank(nonHolder);
        (bool success,) = address(activationContract).call(
            abi.encodeCall(NairaTagAgentIDActivation.activate, (node))
        );
        assertFalse(success);
    }

    /// @notice Impersonates a real verified Agent ID holder on BNB Mainnet and activates a sovereign tag
    function test_Fork_SuccessfulActivationByRealAgentIDHolder() public {
        if (!forkActive || OFFICIAL_AGENT_ID.code.length == 0) return;

        // 1. Assert the live SPACE ID contract confirms realHolder holds Agent ID
        uint256 bal = IBinanceAgentID(OFFICIAL_AGENT_ID).balanceOf(REAL_MAINNET_HOLDER);
        assertEq(bal, 1);

        // 2. Impersonate realHolder and claim sovereign tag in Registry
        vm.prank(REAL_MAINNET_HOLDER);
        bytes32 node = registry.claim("real_agent");
        assertEq(registry.owner(node), REAL_MAINNET_HOLDER);

        // 3. Real holder activates tag in NairaTagAgentIDActivation
        vm.prank(REAL_MAINNET_HOLDER);
        uint256 actId = activationContract.activate(node);

        // 4. Assert activation state and live validity against the real contract
        assertEq(actId, 1);
        assertEq(activationContract.totalActiveActivations(), 1);
        assertEq(activationContract.totalHistoricalActivations(), 1);
        assertEq(activationContract.totalUniqueHolders(), 1);
        assertEq(activationContract.primaryActivatedNodeOf(REAL_MAINNET_HOLDER), node);
        assertTrue(activationContract.hasEverActivated(REAL_MAINNET_HOLDER));

        (
            address holder,
            uint64 activatedAt,
            uint64 historicalCount,
            bool isActive,
            INairaTagAgentIDActivation.ValidityStatus liveStatus,
            INairaTagAgentIDActivation.ValidityStatus lastReason
        ) = activationContract.getActivation(node);

        assertEq(holder, REAL_MAINNET_HOLDER);
        assertTrue(activatedAt > 0);
        assertEq(historicalCount, 1);
        assertTrue(isActive);
        assertTrue(liveStatus == INairaTagAgentIDActivation.ValidityStatus.VALID);
        assertTrue(lastReason == INairaTagAgentIDActivation.ValidityStatus.VALID);
    }
}
