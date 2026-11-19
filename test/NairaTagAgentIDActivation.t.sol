// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {NairaTagRegistry} from "../src/NairaTagRegistry.sol";
import {NairaTagAgentIDActivation} from "../src/NairaTagAgentIDActivation.sol";
import {INairaTagAgentIDActivation} from "../src/interfaces/INairaTagAgentIDActivation.sol";
import {IBinanceAgentID} from "../src/interfaces/IBinanceAgentID.sol";

interface Vm {
    function prank(address sender) external;
    function etch(address target, bytes calldata bytecode) external;
    function chainId(uint256 newChainId) external;
    function warp(uint256 newTimestamp) external;
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

    function assertEq(string memory actual, string memory expected) internal pure {
        require(keccak256(bytes(actual)) == keccak256(bytes(expected)), "string mismatch");
    }
}

contract MockSPACEIDAgentID is IBinanceAgentID {
    mapping(address => uint256) private _balances;

    function balanceOf(address owner) external view override returns (uint256) {
        return _balances[owner];
    }

    function setBalance(address owner, uint256 balance) external {
        _balances[owner] = balance;
    }
}

contract NairaTagAgentIDActivationTest is TestBase {
    address public constant OFFICIAL_AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    NairaTagRegistry private registry;
    MockSPACEIDAgentID private mockAgentID;
    NairaTagAgentIDActivation private activationContract;

    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    address private constant CHARLIE = address(0xC0C);

    function setUp() public {
        // Ensure chain ID is 56 (BNB Mainnet)
        vm.chainId(56);

        // 1. Deploy core Registry
        registry = new NairaTagRegistry();

        // 2. Deploy Mock Agent ID and etch directly at the official mainnet address
        MockSPACEIDAgentID impl = new MockSPACEIDAgentID();
        vm.etch(OFFICIAL_AGENT_ID, address(impl).code);
        mockAgentID = MockSPACEIDAgentID(OFFICIAL_AGENT_ID);

        // 3. Deploy Activation Contract
        activationContract = new NairaTagAgentIDActivation(
            address(registry),
            OFFICIAL_AGENT_ID
        );
    }

    // ==========================================
    // 1. Constructor Validation
    // ==========================================

    function test_ConstructorValidation_ChainId() public {
        vm.chainId(1); // Ethereum Mainnet (Invalid)
        (bool success,) = address(this).call(
            abi.encodeCall(this._deployActivation, (address(registry), OFFICIAL_AGENT_ID))
        );
        assertFalse(success);

        vm.chainId(97); // BSC Testnet (Must use 56)
        (bool testnetSuccess,) = address(this).call(
            abi.encodeCall(this._deployActivation, (address(registry), OFFICIAL_AGENT_ID))
        );
        assertFalse(testnetSuccess);

        vm.chainId(56); // BSC Mainnet (Valid)
        NairaTagAgentIDActivation validContract = new NairaTagAgentIDActivation(
            address(registry),
            OFFICIAL_AGENT_ID
        );
        assertEq(address(validContract.registry()), address(registry));
    }

    function test_ConstructorValidation_OfficialAgentIdEnforced() public {
        address fakeAgentId = address(0xFA7E);
        (bool success,) = address(this).call(
            abi.encodeCall(this._deployActivation, (address(registry), fakeAgentId))
        );
        assertFalse(success);
    }

    function test_ConstructorValidation_EmptyRegistry() public {
        (bool success,) = address(this).call(
            abi.encodeCall(this._deployActivation, (address(0), OFFICIAL_AGENT_ID))
        );
        assertFalse(success);
    }

    function _deployActivation(address reg, address agentId) external returns (address) {
        return address(new NairaTagAgentIDActivation(reg, agentId));
    }

    // ==========================================
    // 2. Standard Activation Lifecycle
    // ==========================================

    function test_SuccessfulActivation() public {
        // Alice claims ₦ALICE in Registry
        vm.prank(ALICE);
        bytes32 node = registry.claim("alice");

        // Grant Alice an official Agent ID
        mockAgentID.setBalance(ALICE, 1);

        // Alice activates
        vm.prank(ALICE);
        uint256 actId = activationContract.activate(node);

        assertEq(actId, 1);
        assertEq(activationContract.totalActiveActivations(), 1);
        assertEq(activationContract.totalHistoricalActivations(), 1);
        assertEq(activationContract.totalUniqueHolders(), 1);
        assertTrue(activationContract.hasEverActivated(ALICE));
        assertEq(activationContract.primaryActivatedNodeOf(ALICE), node);

        // Verify state inspection
        (
            address holder,
            uint64 activatedAt,
            uint64 historicalCount,
            bool isActive,
            INairaTagAgentIDActivation.ValidityStatus liveStatus,
            INairaTagAgentIDActivation.ValidityStatus lastReason
        ) = activationContract.getActivation(node);

        assertEq(holder, ALICE);
        assertTrue(activatedAt > 0);
        assertEq(historicalCount, 1);
        assertTrue(isActive);
        assertTrue(liveStatus == INairaTagAgentIDActivation.ValidityStatus.VALID);
        assertTrue(lastReason == INairaTagAgentIDActivation.ValidityStatus.VALID);
    }

    function test_ActivateWithTag_ConvenienceMethod() public {
        vm.prank(BOB);
        registry.claim("bob_agent");
        mockAgentID.setBalance(BOB, 1);

        vm.prank(BOB);
        (bytes32 node, uint256 actId) = activationContract.activateWithTag(unicode"₦BOB_AGENT");

        assertEq(node, registry.namehash("bob_agent"));
        assertEq(actId, 1);
        assertEq(activationContract.primaryActivatedNodeOf(BOB), node);
    }

    function test_RevertIf_TagDoesNotExist() public {
        mockAgentID.setBalance(ALICE, 1);
        bytes32 unclaimedNode = registry.namehash("unclaimed");

        vm.prank(ALICE);
        (bool success,) = address(activationContract).call(
            abi.encodeCall(NairaTagAgentIDActivation.activate, (unclaimedNode))
        );
        assertFalse(success);
    }

    function test_RevertIf_CallerNotTagOwner() public {
        vm.prank(ALICE);
        bytes32 node = registry.claim("alice");

        mockAgentID.setBalance(BOB, 1);

        // Bob attempts to activate Alice's tag
        vm.prank(BOB);
        (bool success,) = address(activationContract).call(
            abi.encodeCall(NairaTagAgentIDActivation.activate, (node))
        );
        assertFalse(success);
    }

    function test_RevertIf_CallerLacksAgentID() public {
        vm.prank(ALICE);
        bytes32 node = registry.claim("alice");

        // Alice has 0 Agent ID balance
        mockAgentID.setBalance(ALICE, 0);

        vm.prank(ALICE);
        (bool success,) = address(activationContract).call(
            abi.encodeCall(NairaTagAgentIDActivation.activate, (node))
        );
        assertFalse(success);
    }

    function test_RevertIf_AlreadyActive() public {
        vm.prank(ALICE);
        bytes32 node = registry.claim("alice");
        mockAgentID.setBalance(ALICE, 1);

        vm.prank(ALICE);
        activationContract.activate(node);

        // Re-activating active node reverts
        vm.prank(ALICE);
        (bool secondCall,) = address(activationContract).call(
            abi.encodeCall(NairaTagAgentIDActivation.activate, (node))
        );
        assertFalse(secondCall);
    }

    // ==========================================
    // 3. One Active Activation Per Holder Rule
    // ==========================================

    function test_OneActiveActivationPerHolderEnforced() public {
        vm.prank(ALICE);
        bytes32 nodeOne = registry.claim("alice_one");
        mockAgentID.setBalance(ALICE, 1);

        vm.prank(ALICE);
        activationContract.activate(nodeOne);

        // Alice claims second tag (after releasing first in registry or via secondary wallet)
        // If Alice transfers tag to an actor, claims another tag, and attempts second active activation:
        vm.prank(ALICE);
        registry.release(nodeOne);

        vm.prank(ALICE);
        bytes32 nodeTwo = registry.claim("alice_two");

        // Attempting to activate nodeTwo while nodeOne is still recorded as Alice's active node
        // Wait, nodeOne is now invalid because tag was released, but Alice has not deactivated nodeOne yet
        vm.prank(ALICE);
        (bool secondActivationSucceeded,) = address(activationContract).call(
            abi.encodeCall(NairaTagAgentIDActivation.activate, (nodeTwo))
        );
        assertFalse(secondActivationSucceeded);

        // Now Alice cleans up or deactivates nodeOne
        vm.prank(ALICE);
        activationContract.cleanupStaleActivation(nodeOne);
        assertEq(activationContract.primaryActivatedNodeOf(ALICE), bytes32(0));

        // Now Alice can activate nodeTwo!
        vm.prank(ALICE);
        activationContract.activate(nodeTwo);
        assertEq(activationContract.primaryActivatedNodeOf(ALICE), nodeTwo);
        assertEq(activationContract.totalActiveActivations(), 1);
        assertEq(activationContract.totalUniqueHolders(), 1); // Still 1 unique holder
    }

    function test_MultipleDifferentHolders() public {
        vm.prank(ALICE);
        bytes32 nodeA = registry.claim("alice");
        mockAgentID.setBalance(ALICE, 1);

        vm.prank(BOB);
        bytes32 nodeB = registry.claim("bob");
        mockAgentID.setBalance(BOB, 1);

        vm.prank(ALICE);
        activationContract.activate(nodeA);

        vm.prank(BOB);
        activationContract.activate(nodeB);

        assertEq(activationContract.totalActiveActivations(), 2);
        assertEq(activationContract.totalHistoricalActivations(), 2);
        assertEq(activationContract.totalUniqueHolders(), 2);
    }

    // ==========================================
    // 4. Voluntary Deactivation & Reactivation
    // ==========================================

    function test_VoluntaryDeactivationAndReactivation() public {
        vm.prank(ALICE);
        bytes32 node = registry.claim("alice");
        mockAgentID.setBalance(ALICE, 1);

        vm.prank(ALICE);
        activationContract.activate(node);

        // Voluntary deactivation
        vm.prank(ALICE);
        activationContract.deactivate(node);

        assertEq(activationContract.totalActiveActivations(), 0);
        assertEq(activationContract.primaryActivatedNodeOf(ALICE), bytes32(0));
        assertTrue(activationContract.checkValidity(node) == INairaTagAgentIDActivation.ValidityStatus.VOLUNTARILY_DEACTIVATED);

        // Reactivation by same owner
        vm.prank(ALICE);
        uint256 secondActId = activationContract.activate(node);

        assertEq(secondActId, 2);
        assertEq(activationContract.totalActiveActivations(), 1);
        assertEq(activationContract.totalHistoricalActivations(), 2);
        assertEq(activationContract.totalUniqueHolders(), 1); // Alice was already counted

        (,, uint64 historicalCount, bool isActive, INairaTagAgentIDActivation.ValidityStatus liveStatus,) =
            activationContract.getActivation(node);
        assertEq(historicalCount, 2);
        assertTrue(isActive);
        assertTrue(liveStatus == INairaTagAgentIDActivation.ValidityStatus.VALID);
    }

    function test_RevertIf_UnauthorizedVoluntaryDeactivation() public {
        vm.prank(ALICE);
        bytes32 node = registry.claim("alice");
        mockAgentID.setBalance(ALICE, 1);

        vm.prank(ALICE);
        activationContract.activate(node);

        // Bob tries to voluntarily deactivate Alice's activation
        vm.prank(BOB);
        (bool success,) = address(activationContract).call(
            abi.encodeCall(NairaTagAgentIDActivation.deactivate, (node))
        );
        assertFalse(success);
    }

    // ==========================================
    // 5. Invalidation & Cleanup Scenarios
    // ==========================================

    function test_TagTransferAndCleanup() public {
        vm.prank(ALICE);
        bytes32 node = registry.claim("alice");
        mockAgentID.setBalance(ALICE, 1);

        vm.prank(ALICE);
        activationContract.activate(node);

        // Alice transfers tag to Bob
        vm.prank(ALICE);
        registry.transfer(node, BOB);

        // Status is now TAG_OWNERSHIP_CHANGED
        assertTrue(activationContract.checkValidity(node) == INairaTagAgentIDActivation.ValidityStatus.TAG_OWNERSHIP_CHANGED);

        // Anyone (e.g. Charlie) can clean up
        vm.prank(CHARLIE);
        activationContract.cleanupStaleActivation(node);

        assertEq(activationContract.totalActiveActivations(), 0);
        assertEq(activationContract.primaryActivatedNodeOf(ALICE), bytes32(0));
        assertTrue(activationContract.checkValidity(node) == INairaTagAgentIDActivation.ValidityStatus.TAG_OWNERSHIP_CHANGED);

        // Now Bob (new owner) with an Agent ID can activate the tag!
        mockAgentID.setBalance(BOB, 1);
        vm.prank(BOB);
        activationContract.activate(node);

        assertEq(activationContract.totalActiveActivations(), 1);
        assertEq(activationContract.primaryActivatedNodeOf(BOB), node);
        assertEq(activationContract.totalUniqueHolders(), 2);
    }

    function test_TagReleaseAndCleanup() public {
        vm.prank(ALICE);
        bytes32 node = registry.claim("alice");
        mockAgentID.setBalance(ALICE, 1);

        vm.prank(ALICE);
        activationContract.activate(node);

        // Alice releases tag in registry
        vm.prank(ALICE);
        registry.release(node);

        assertTrue(activationContract.checkValidity(node) == INairaTagAgentIDActivation.ValidityStatus.TAG_DOES_NOT_EXIST);

        vm.prank(CHARLIE);
        activationContract.cleanupStaleActivation(node);

        assertEq(activationContract.totalActiveActivations(), 0);
        assertTrue(activationContract.checkValidity(node) == INairaTagAgentIDActivation.ValidityStatus.TAG_DOES_NOT_EXIST);
    }

    function test_AgentIDLossAndCleanup() public {
        vm.prank(ALICE);
        bytes32 node = registry.claim("alice");
        mockAgentID.setBalance(ALICE, 1);

        vm.prank(ALICE);
        activationContract.activate(node);

        // Alice's Agent ID balance drops to 0 (lost/burned)
        mockAgentID.setBalance(ALICE, 0);

        assertTrue(activationContract.checkValidity(node) == INairaTagAgentIDActivation.ValidityStatus.AGENT_ID_LOST);

        vm.prank(CHARLIE);
        activationContract.cleanupStaleActivation(node);

        assertEq(activationContract.totalActiveActivations(), 0);
        assertTrue(activationContract.checkValidity(node) == INairaTagAgentIDActivation.ValidityStatus.AGENT_ID_LOST);
    }

    function test_RevertIf_CleanupOnValidActivation() public {
        vm.prank(ALICE);
        bytes32 node = registry.claim("alice");
        mockAgentID.setBalance(ALICE, 1);

        vm.prank(ALICE);
        activationContract.activate(node);

        // Charlie tries to clean up a valid activation -> reverts
        vm.prank(CHARLIE);
        (bool success,) = address(activationContract).call(
            abi.encodeCall(NairaTagAgentIDActivation.cleanupStaleActivation, (node))
        );
        assertFalse(success);
    }
}
