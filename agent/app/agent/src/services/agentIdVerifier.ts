/**
 * Binance / SPACE ID Agent ID Verification Service
 *
 * Checks whether an address holds an official SPACE ID Agent ID (BEP-721 Soulbound Token).
 *
 * Official Mainnet Contract: 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
 * Standard: ERC-721 Non-transferable / Soulbound
 * Method: balanceOf(address) > 0
 *
 * ARCHITECTURAL RULE: Identity is not Authority.
 * Holding an Agent ID verifies identity tier; it does NOT grant unrestricted execution
 * permissions, asset transfer authority, or escrow bypass privileges.
 */

import { createPublicClient, getAddress, http, isAddress, parseAbi, type PublicClient } from "viem";
import { bsc, bscTestnet } from "viem/chains";

export const OFFICIAL_AGENT_ID_CONTRACT = "0x60b9262456de011f7d15a54cdd8c48baaa8b022f" as const;

export type SupportedAgentIdNetwork = "bsc-mainnet" | "bsc-testnet";

export type AgentIdVerificationTier =
  | "verified"
  | "unverified"
  | "not_deployed"
  | "verification_error";

export interface AgentIdVerificationResult {
  address: string;
  hasAgentId: boolean;
  balance: string;
  network: SupportedAgentIdNetwork;
  chainId: number;
  contractAddress: string;
  contractAvailable: boolean;
  verificationTier: AgentIdVerificationTier;
  timestamp: string;
  error?: string;
}

export interface VerifyAgentIdOptions {
  address: string;
  network?: SupportedAgentIdNetwork;
  client?: PublicClient; // Injectable for deterministic mocking and tests
  timeoutMs?: number;
}

const AGENT_ID_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

/**
 * Returns a viem public client for the target network with configurable RPC endpoints.
 */
export function getPublicClientForNetwork(
  network: SupportedAgentIdNetwork,
  timeoutMs = 10000
): PublicClient {
  if (network === "bsc-mainnet") {
    const rpcUrl =
      process.env.BSC_MAINNET_RPC_URL || "https://bsc-dataseed.binance.org";
    return createPublicClient({
      chain: bsc,
      transport: http(rpcUrl, { timeout: timeoutMs }),
    });
  }

  const rpcUrl =
    process.env.BSC_TESTNET_RPC_URL ||
    "https://bsc-testnet-dataseed.bnbchain.org";
  return createPublicClient({
    chain: bscTestnet,
    transport: http(rpcUrl, { timeout: timeoutMs }),
  });
}

/**
 * Verifies whether a given address holds a Binance/SPACE ID Agent ID.
 *
 * Rules:
 * 1. Validates address format prior to any RPC interaction.
 * 2. On BSC Mainnet (56), verifies contract bytecode exists and calls balanceOf(address).
 * 3. On BSC Testnet (97), recognizes contract is not officially deployed and returns tier 'not_deployed'.
 * 4. Never substitutes unofficial contracts.
 * 5. Handles RPC network failures gracefully without false positives or negatives.
 */
export async function verifyAgentId(
  opts: VerifyAgentIdOptions
): Promise<AgentIdVerificationResult> {
  const timestamp = new Date().toISOString();
  const network = opts.network ?? "bsc-mainnet";
  const chainId = network === "bsc-mainnet" ? 56 : 97;
  const contractAddress = OFFICIAL_AGENT_ID_CONTRACT;

  // 1. Validate target address
  if (!opts.address || typeof opts.address !== "string" || !isAddress(opts.address.trim(), { strict: false })) {
    return {
      address: opts.address ?? "",
      hasAgentId: false,
      balance: "0",
      network,
      chainId,
      contractAddress,
      contractAvailable: false,
      verificationTier: "verification_error",
      error: `Invalid EVM address format: "${opts.address}"`,
      timestamp,
    };
  }

  const normalizedAddress = getAddress(opts.address.trim());

  // 2. BSC Testnet: Contract is not deployed
  if (network === "bsc-testnet") {
    return {
      address: normalizedAddress,
      hasAgentId: false,
      balance: "0",
      network,
      chainId,
      contractAddress,
      contractAvailable: false,
      verificationTier: "not_deployed",
      error: "Binance/SPACE ID Agent ID is not deployed on BSC Testnet (Chain ID 97). Official contract exists on BSC Mainnet.",
      timestamp,
    };
  }

  // 3. BSC Mainnet Verification
  try {
    const client = opts.client ?? getPublicClientForNetwork(network, opts.timeoutMs);

    // Verify contract bytecode exists on-chain
    const bytecode = await client.getBytecode({
      address: contractAddress,
    });

    if (!bytecode || bytecode === "0x") {
      return {
        address: normalizedAddress,
        hasAgentId: false,
        balance: "0",
        network,
        chainId,
        contractAddress,
        contractAvailable: false,
        verificationTier: "not_deployed",
        error: `Contract bytecode not found at ${contractAddress} on ${network}`,
        timestamp,
      };
    }

    // Call balanceOf(address)
    const balance = await client.readContract({
      address: contractAddress,
      abi: AGENT_ID_ABI,
      functionName: "balanceOf",
      args: [normalizedAddress as `0x${string}`],
    });

    const hasAgentId = balance > 0n;

    return {
      address: normalizedAddress,
      hasAgentId,
      balance: balance.toString(),
      network,
      chainId,
      contractAddress,
      contractAvailable: true,
      verificationTier: hasAgentId ? "verified" : "unverified",
      timestamp,
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      address: normalizedAddress,
      hasAgentId: false,
      balance: "0",
      network,
      chainId,
      contractAddress,
      contractAvailable: true,
      verificationTier: "verification_error",
      error: `RPC call failed during Agent ID verification: ${errorMessage}`,
      timestamp,
    };
  }
}
