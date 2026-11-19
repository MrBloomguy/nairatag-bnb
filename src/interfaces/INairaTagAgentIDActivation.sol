// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./INairaTagRegistry.sol";
import "./IBinanceAgentID.sol";

/**
 * @title INairaTagAgentIDActivation
 * @notice Standard interface for NairaTag Agent ID on-chain activation on BNB Smart Chain.
 * @dev Enforces 1 active activation per holder, official SPACE ID contract verification,
 *      and dynamic live validity tracking.
 *
 * ARCHITECTURAL RULE: Identity is not Authority.
 * Activation records a verified identity credential event on-chain; it grants no automated
 * spending authority, token allowances, or escrow bypass privileges.
 */
interface INairaTagAgentIDActivation {
    /// @notice Validity status enum evaluating live on-chain conditions
    enum ValidityStatus {
        VALID,                   // Currently active and fully valid
        NOT_ACTIVATED,           // Node has never been activated
        TAG_DOES_NOT_EXIST,      // Node has no owner in NairaTagRegistry (or was released)
        TAG_OWNERSHIP_CHANGED,   // Current registry owner differs from activation holder
        AGENT_ID_LOST,           // Activation holder no longer holds Agent ID token
        VOLUNTARILY_DEACTIVATED  // Explicitly deactivated by the original holder
    }

    /// @notice Structured activation record
    struct ActivationRecord {
        address holder;                      // Wallet that activated the node
        bytes32 node;                        // Sovereign tag node hash
        uint64 activatedAt;                  // Timestamp of current activation
        uint64 historicalCount;              // Monotonic activation count for this node
        bool isActive;                       // Live activation status flag
        ValidityStatus lastDeactivationReason;// Historical reason for last deactivation (if inactive)
    }

    // --- Events ---

    event AgentIDActivated(
        address indexed holder,
        bytes32 indexed node,
        uint256 indexed activationId,
        uint256 timestamp
    );

    event AgentIDDeactivated(
        address indexed holder,
        bytes32 indexed node,
        ValidityStatus reason,
        uint256 timestamp
    );

    // --- Custom Errors ---

    error InvalidChainId(uint256 expected, uint256 actual);
    error InvalidRegistryAddress(address target);
    error InvalidAgentIDAddress(address target, address expected);
    error TagDoesNotExist(bytes32 node);
    error UnauthorizedCaller(address caller, address expected);
    error NoAgentIDCredential(address account);
    error AlreadyActive(bytes32 node);
    error NotActive(bytes32 node);
    error HolderAlreadyHasActiveTag(address holder, bytes32 activeNode);
    error CannotCleanupValidActivation(bytes32 node);

    // --- State Read Methods ---

    function OFFICIAL_AGENT_ID() external view returns (address);
    function registry() external view returns (INairaTagRegistry);
    function agentIdContract() external view returns (IBinanceAgentID);

    function totalActiveActivations() external view returns (uint256);
    function totalHistoricalActivations() external view returns (uint256);
    function totalUniqueHolders() external view returns (uint256);
    function hasEverActivated(address account) external view returns (bool);

    function getActivation(bytes32 node) external view returns (
        address holder,
        uint64 activatedAt,
        uint64 historicalCount,
        bool isActive,
        ValidityStatus liveStatus,
        ValidityStatus lastDeactivationReason
    );

    function checkValidity(bytes32 node) external view returns (ValidityStatus status);
    function primaryActivatedNodeOf(address holder) external view returns (bytes32);

    // --- State Mutation Methods ---

    function activate(bytes32 node) external returns (uint256 activationId);
    function activateWithTag(string calldata rawTag) external returns (bytes32 node, uint256 activationId);
    function deactivate(bytes32 node) external;
    function cleanupStaleActivation(bytes32 node) external;
}
