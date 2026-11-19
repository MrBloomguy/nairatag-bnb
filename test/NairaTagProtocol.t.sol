// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NairaTagRegistry} from "../src/NairaTagRegistry.sol";
import {NairaTagResolver} from "../src/NairaTagResolver.sol";

interface Vm {
    function prank(address sender) external;
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertTrue(bool condition) internal pure {
        require(condition, "assertTrue failed");
    }

    function assertEq(address actual, address expected) internal pure {
        require(actual == expected, "address mismatch");
    }

    function assertEq(bytes32 actual, bytes32 expected) internal pure {
        require(actual == expected, "bytes32 mismatch");
    }

    function assertEq(bytes memory actual, bytes memory expected) internal pure {
        require(keccak256(actual) == keccak256(expected), "bytes mismatch");
    }

    function assertEq(string memory actual, string memory expected) internal pure {
        require(keccak256(bytes(actual)) == keccak256(bytes(expected)), "string mismatch");
    }
}

contract ContractWalletActor {
    function claim(NairaTagRegistry registry, string calldata tag) external returns (bytes32) {
        return registry.claim(tag);
    }
}

contract NairaTagProtocolTest is TestBase {
    NairaTagRegistry private registry;
    NairaTagResolver private resolver;

    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);

    function setUp() public {
        registry = new NairaTagRegistry();
        resolver = new NairaTagResolver(address(registry));
    }

    function testRegistryNormalizesAndResolvesTag() public {
        bytes32 node = registry.claim(unicode"₦BLOOM", address(resolver));

        assertEq(registry.normalize(unicode"₦BLOOM"), "bloom");
        assertEq(registry.namehash("BLOOM"), node);
        assertEq(registry.owner(node), address(this));
        assertEq(registry.resolve(unicode"₦bloom"), address(this));
        assertTrue(registry.exists(node));
        assertEq(address(resolver.registry()), address(registry));
    }

    function testOneTagLimitAppliesToContractWallets() public {
        ContractWalletActor wallet = new ContractWalletActor();
        bytes32 first = wallet.claim(registry, "agent_one");
        (bool secondClaimSucceeded,) = address(wallet).call(
            abi.encodeCall(ContractWalletActor.claim, (registry, "agent_two"))
        );

        assertTrue(!secondClaimSucceeded);
        assertEq(registry.primaryTagOf(address(wallet)), first);
    }

    function testOneTagLimitAndReleaseForExternallyOwnedWallet() public {
        vm.prank(ALICE);
        bytes32 first = registry.claim("alice_one");

        vm.prank(ALICE);
        (bool secondClaimSucceeded,) = address(registry).call(
            abi.encodeWithSignature("claim(string)", "alice_two")
        );
        assertTrue(!secondClaimSucceeded);

        vm.prank(ALICE);
        registry.release(first);
        assertEq(registry.primaryTagOf(ALICE), bytes32(0));

        vm.prank(ALICE);
        bytes32 second = registry.claim("alice_two");
        assertEq(registry.primaryTagOf(ALICE), second);
    }

    function testTransferMovesPrimaryTagAndPreventsDuplicate() public {
        bytes32 node = registry.claim("bloom");
        vm.prank(BOB);
        bytes32 bobNode = registry.claim("bobby");

        (bool transferToClaimedOwnerSucceeded,) = address(registry).call(
            abi.encodeCall(NairaTagRegistry.transfer, (node, BOB))
        );
        assertTrue(!transferToClaimedOwnerSucceeded);

        registry.transfer(node, address(0xCAFE));
        assertEq(registry.owner(node), address(0xCAFE));
        assertEq(registry.primaryTagOf(address(this)), bytes32(0));
        assertEq(registry.primaryTagOf(BOB), bobNode);
    }

    function testResolverStoresForwardReverseAndTextRecords() public {
        bytes32 node = registry.claim("bloom", address(resolver));
        resolver.setAddr(node, ALICE);
        resolver.setAddr(node, 60, abi.encodePacked(ALICE));
        resolver.setText(node, "description", "NairaTag identity");
        resolver.setPaymentEndpoint(node, "https://nairatag.ng/pay/bloom");
        resolver.setNameForAddr(address(this), "bloom");

        assertEq(resolver.addr(node), ALICE);
        assertEq(resolver.addr(node, 60), abi.encodePacked(ALICE));
        assertEq(resolver.text(node, "description"), "NairaTag identity");
        assertEq(resolver.paymentEndpoint(node), "https://nairatag.ng/pay/bloom");
        assertEq(resolver.name(resolver.reverseNode(address(this))), "bloom");
    }

    function testResolverRejectsUnownedReverseTag() public {
        registry.claim("bloom");
        vm.prank(ALICE);
        registry.claim("alice");

        (bool setNameSucceeded,) = address(resolver).call(
            abi.encodeCall(NairaTagResolver.setNameForAddr, (ALICE, "bloom"))
        );
        assertTrue(!setNameSucceeded);
    }
}
