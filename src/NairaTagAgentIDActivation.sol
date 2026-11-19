// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/INairaTagAgentIDActivation.sol";

/**
 * @title NairaTagAgentIDActivation
 * @notice Permissionless, immutable identity activation ledger for NairaTag Network on BNB Smart Chain.
 * @dev Verifies official SPACE ID Agent ID (0x60b9262456de011f7d15a54cdd8c48baaa8b022f on Chain 56)
 *      and binds verified credentials to sovereign NairaTags.
 *
 * ARCHITECTURAL LAW: Identity is not Authority.
 * Holding an Agent ID verifies trust tier; it does NOT grant authorization to spend funds,
 * approve token allowances, or bypass smart contract escrow.
 */
contract NairaTagAgentIDActivation is INairaTagAgentIDActivation {
    uint256 public constant BNB_MAINNET_CHAIN_ID = 56;
    uint256 public constant FORK_TEST_CHAIN_ID = 31337;

    /// @notice The official SPACE ID Agent ID contract on BNB Smart Chain Mainnet
    address public constant override OFFICIAL_AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    INairaTagRegistry public immutable override registry;
    IBinanceAgentID public immutable override agentIdContract;

    uint256 public override totalActiveActivations;
    uint256 public override totalHistoricalActivations;
    uint256 public override totalUniqueHolders;

    // Node => ActivationRecord
    mapping(bytes32 => ActivationRecord) private _activations;

    // Holder address => currently active primary tag node (Enforces 1 active tag per holder)
    mapping(address => bytes32) public override primaryActivatedNodeOf;

    // Holder address => has ever activated a tag (Tracks unique hackathon participants)
    mapping(address => bool) private _hasEverActivated;

    constructor(address _registry, address _agentIdContract) {
        if (block.chainid != BNB_MAINNET_CHAIN_ID && block.chainid != FORK_TEST_CHAIN_ID) {
            revert InvalidChainId(BNB_MAINNET_CHAIN_ID, block.chainid);
        }
        if (_registry == address(0) || _registry.code.length == 0) {
            revert InvalidRegistryAddress(_registry);
        }
        if (_agentIdContract != OFFICIAL_AGENT_ID) {
            revert InvalidAgentIDAddress(_agentIdContract, OFFICIAL_AGENT_ID);
        }
        if (_agentIdContract.code.length == 0) {
            revert InvalidAgentIDAddress(_agentIdContract, OFFICIAL_AGENT_ID);
        }

        registry = INairaTagRegistry(_registry);
        agentIdContract = IBinanceAgentID(_agentIdContract);
    }

    /**
     * @notice Checks the live validity of an activation record against on-chain state.
     * @param node The tag node to inspect.
     * @return status The live ValidityStatus enum value.
     */
    function checkValidity(bytes32 node) public view override returns (ValidityStatus) {
        ActivationRecord storage rec = _activations[node];
        if (!rec.isActive) {
            return rec.activatedAt == 0 ? ValidityStatus.NOT_ACTIVATED : rec.lastDeactivationReason;
        }

        address currentOwner = registry.owner(node);
        if (currentOwner == address(0)) {
            return ValidityStatus.TAG_DOES_NOT_EXIST;
        }
        if (currentOwner != rec.holder) {
            return ValidityStatus.TAG_OWNERSHIP_CHANGED;
        }
        if (agentIdContract.balanceOf(rec.holder) == 0) {
            return ValidityStatus.AGENT_ID_LOST;
        }

        return ValidityStatus.VALID;
    }

    /**
     * @notice Activates a claimed NairaTag with the caller's verified Agent ID.
     * @param node The tag node hash.
     * @return activationId Monotonically increasing activation event identifier.
     */
    function activate(bytes32 node) public override returns (uint256 activationId) {
        address tagOwner = registry.owner(node);
        if (tagOwner == address(0)) revert TagDoesNotExist(node);
        if (tagOwner != msg.sender) revert UnauthorizedCaller(msg.sender, tagOwner);

        if (agentIdContract.balanceOf(msg.sender) == 0) {
            revert NoAgentIDCredential(msg.sender);
        }

        ActivationRecord storage rec = _activations[node];
        if (rec.isActive) revert AlreadyActive(node);

        bytes32 currentActiveNode = primaryActivatedNodeOf[msg.sender];
        if (currentActiveNode != bytes32(0)) {
            revert HolderAlreadyHasActiveTag(msg.sender, currentActiveNode);
        }

        rec.holder = msg.sender;
        rec.node = node;
        rec.activatedAt = uint64(block.timestamp);
        rec.historicalCount += 1;
        rec.isActive = true;
        rec.lastDeactivationReason = ValidityStatus.VALID;

        primaryActivatedNodeOf[msg.sender] = node;

        if (!_hasEverActivated[msg.sender]) {
            _hasEverActivated[msg.sender] = true;
            totalUniqueHolders += 1;
        }

        totalActiveActivations += 1;
        totalHistoricalActivations += 1;
        activationId = totalHistoricalActivations;

        emit AgentIDActivated(msg.sender, node, activationId, block.timestamp);
    }

    /**
     * @notice Convenience activation method accepting raw tag string (e.g. "₦BLOOM" or "bloom").
     * @param rawTag The tag string to normalize, hash, and activate.
     */
    function activateWithTag(string calldata rawTag) external override returns (bytes32 node, uint256 activationId) {
        node = registry.namehash(rawTag);
        activationId = activate(node);
    }

    /**
     * @notice Voluntarily deactivates a previously activated tag. Only callable by original holder.
     * @param node The tag node to deactivate.
     */
    function deactivate(bytes32 node) external override {
        ActivationRecord storage rec = _activations[node];
        if (!rec.isActive) revert NotActive(node);
        if (rec.holder != msg.sender) revert UnauthorizedCaller(msg.sender, rec.holder);

        rec.isActive = false;
        rec.lastDeactivationReason = ValidityStatus.VOLUNTARILY_DEACTIVATED;

        if (primaryActivatedNodeOf[msg.sender] == node) {
            delete primaryActivatedNodeOf[msg.sender];
        }

        totalActiveActivations -= 1;

        emit AgentIDDeactivated(msg.sender, node, ValidityStatus.VOLUNTARILY_DEACTIVATED, block.timestamp);
    }

    /**
     * @notice Permissionlessly prunes a stale activation when it has verifiably become invalid.
     * @dev Reverts with CannotCleanupValidActivation if the record is still valid.
     * @param node The tag node to clean up.
     */
    function cleanupStaleActivation(bytes32 node) external override {
        ActivationRecord storage rec = _activations[node];
        if (!rec.isActive) revert NotActive(node);

        ValidityStatus status = checkValidity(node);
        if (status == ValidityStatus.VALID) {
            revert CannotCleanupValidActivation(node);
        }

        address priorHolder = rec.holder;
        rec.isActive = false;
        rec.lastDeactivationReason = status;

        if (primaryActivatedNodeOf[priorHolder] == node) {
            delete primaryActivatedNodeOf[priorHolder];
        }

        totalActiveActivations -= 1;

        emit AgentIDDeactivated(priorHolder, node, status, block.timestamp);
    }

    /**
     * @notice Returns complete activation metadata for a node.
     */
    function getActivation(bytes32 node) external view override returns (
        address holder,
        uint64 activatedAt,
        uint64 historicalCount,
        bool isActive,
        ValidityStatus liveStatus,
        ValidityStatus lastDeactivationReason
    ) {
        ActivationRecord storage rec = _activations[node];
        return (
            rec.holder,
            rec.activatedAt,
            rec.historicalCount,
            rec.isActive,
            checkValidity(node),
            rec.lastDeactivationReason
        );
    }

    /**
     * @notice Returns true if the account has ever activated an Agent ID tag.
     */
    function hasEverActivated(address account) external view override returns (bool) {
        return _hasEverActivated[account];
    }
}
