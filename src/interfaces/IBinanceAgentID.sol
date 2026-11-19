// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IBinanceAgentID
 * @notice Standard interface for checking Binance / SPACE ID Agent ID ownership on BNB Chain.
 * @dev The official mainnet contract is 0x60b9262456de011f7d15a54cdd8c48baaa8b022f (BEP-721 Soulbound Token).
 *      A balance > 0 indicates that the address holds a verified Agent ID.
 *
 * Architecture Rule: Identity is not Authority.
 * Holding an Agent ID verifies the identity tier of an agent or account, but does
 * not grant unrestricted contract execution rights or payment authority.
 */
interface IBinanceAgentID {
    /**
     * @notice Returns the number of Agent IDs owned by `owner`.
     * @param owner The address to query for Agent ID balance.
     * @return balance The number of Agent IDs held (typically 1 for holders, 0 otherwise).
     */
    function balanceOf(address owner) external view returns (uint256 balance);
}
