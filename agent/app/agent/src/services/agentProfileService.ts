/**
 * NairaTag Agent Profile Service
 *
 * Implements structured agent profiles, capability taxonomy, and multi-tier
 * identity verification for the NairaTag Open Agent Economy.
 *
 * ARCHITECTURAL PRINCIPLES:
 * 1. Identity is not Authority: An agent's profile and credentials verify trust tier;
 *    they do NOT grant automated execution or spending authority.
 * 2. Separation of Concerns:
 *    - Tag Owner: The sovereign owner registered in NairaTagRegistry.
 *    - Designated Identity Address: The wallet holding the Binance Agent ID (SPACE ID BEP-721).
 *    - Execution Address: The wallet executing operations or receiving payouts.
 * 3. Anti-Spoofing: If the designated identity address differs from the tag owner,
 *    dual-sided verification ensures the identity holder explicitly consented to the tag binding.
 */

import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseAbi,
  stringToBytes,
  type PublicClient,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";
import {
  verifyAgentId,
  type AgentIdVerificationResult,
  type AgentIdVerificationTier,
  type SupportedAgentIdNetwork,
} from "./agentIdVerifier.js";

// ==========================================
// Types & Interfaces
// ==========================================

export type AgentKind = "orchestrator" | "specialist";

export type AgentAvailabilityStatus = "active" | "degraded" | "offline";

export type PricingModel =
  | "free"
  | "fixed_per_request"
  | "hourly"
  | "escrow_bounty";

export interface CapabilityPricing {
  model: PricingModel;
  amount?: string; // e.g. "0.01"
  currency?: string; // e.g. "USDC", "BNB"
}

export interface CapabilityMethod {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface SpecialistCapability {
  id: string; // e.g. "settlement.usdc", "defi.tvl_feed", "weather.logistics"
  category: "defi" | "payments" | "data" | "logistics" | "security" | "general";
  name: string;
  description: string;
  tags: string[];
  methods?: CapabilityMethod[];
  pricing?: CapabilityPricing;
  estimatedLatencyMs?: number;
}

export interface AgentEndpoints {
  a2a?: string; // JSON-RPC 2.0 A2A endpoint
  mcp?: string; // Model Context Protocol HTTP endpoint
  x402?: string; // HTTP 402 payment gateway
  web?: string; // Profile / documentation URL
}

export interface AgentAvailability {
  status: AgentAvailabilityStatus;
  lastSeen: string;
  uptimePercent: number;
}

export interface DualSidedConsent {
  signedBy: string; // Must match designatedIdentityAddress
  signature?: string; // EIP-191 / EIP-712 signature over canonical consent payload
  consentMessage?: string;
  timestamp: string;
}

export interface AgentProfile {
  tag: string; // Canonical display tag: ₦TAG (e.g. "₦BLOOM")
  canonicalName: string; // Normalized lowercase string (e.g. "bloom")
  node: `0x${string}`; // keccak256(canonicalName)
  kind: AgentKind;

  // Layered Entities
  owner: string; // Registered owner in NairaTagRegistry
  designatedIdentityAddress: string; // Address holding Binance Agent ID
  executionAddress: string; // Payout / signing EVM address (from resolver)

  // Profile Details
  name: string;
  description: string;
  version: string;
  author: string;

  // Capabilities & Protocols
  capabilities: SpecialistCapability[];
  endpoints: AgentEndpoints;
  availability: AgentAvailability;

  // Verification Credentials
  agentIdVerification?: AgentIdVerificationResult;
  isTagOwnerVerified: boolean;
  isDualSidedVerified: boolean;
  registeredAt: string;
  updatedAt: string;
}

export interface AgentRegistrationManifest {
  tag: string; // e.g. "₦BLOOM" or "bloom"
  kind?: AgentKind;
  name: string;
  description: string;
  version?: string;
  author?: string;

  owner: string;
  designatedIdentityAddress?: string;
  executionAddress?: string;

  capabilities: SpecialistCapability[];
  endpoints: AgentEndpoints;

  availability?: Partial<AgentAvailability>;
  dualSidedConsent?: DualSidedConsent;
}

// ==========================================
// Canonical On-Chain Contract Addresses
// ==========================================

export const DEPLOYED_CONTRACTS = {
  "bsc-testnet": {
    registry: "0x73434d121f46e188b7f12ef048062e79e5119cc3" as `0x${string}`,
    resolver: "0x2ce440b6c63dc5e1128ab75ddac4d5da850de869" as `0x${string}`,
    activation: (process.env.NAIRATAG_ACTIVATION_ADDRESS_TESTNET || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  },
  "bsc-mainnet": {
    // Space reserved for BSC Mainnet deployment
    registry: (process.env.NAIRATAG_REGISTRY_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
    resolver: (process.env.NAIRATAG_RESOLVER_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
    activation: (process.env.NAIRATAG_ACTIVATION_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  },
} as const;

export type TagActivationValidity =
  | "VALID"
  | "NOT_ACTIVATED"
  | "TAG_DOES_NOT_EXIST"
  | "TAG_OWNERSHIP_CHANGED"
  | "AGENT_ID_LOST"
  | "VOLUNTARILY_DEACTIVATED"
  | "CONTRACT_UNAVAILABLE"
  | "VERIFICATION_ERROR";

export interface OnChainActivationResult {
  node: `0x${string}`;
  tag: string;
  holder?: string;
  isActive: boolean;
  validityStatus: TagActivationValidity;
  activatedAt?: string;
  historicalCount?: number;
  contractAddress: string;
  network: SupportedAgentIdNetwork;
}

// ABIs
const REGISTRY_ABI = parseAbi([
  "function owner(bytes32 node) view returns (address)",
  "function resolver(bytes32 node) view returns (address)",
  "function normalize(string rawTag) pure returns (string)",
  "function namehash(string tag) pure returns (bytes32)",
]);

const RESOLVER_ABI = parseAbi([
  "function addr(bytes32 node) view returns (address payable)",
  "function text(bytes32 node, string key) view returns (string)",
  "function paymentEndpoint(bytes32 node) view returns (string)",
  "function name(bytes32 node) view returns (string)",
]);

const ACTIVATION_ABI = parseAbi([
  "function checkValidity(bytes32 node) view returns (uint8)",
  "function getActivation(bytes32 node) view returns (address holder, uint64 activatedAt, uint64 historicalCount, bool isActive, uint8 liveStatus, uint8 lastDeactivationReason)",
  "function primaryActivatedNodeOf(address holder) view returns (bytes32)",
  "function totalActiveActivations() view returns (uint256)",
]);

// ==========================================
// Canonical Tag Utilities
// ==========================================

/**
 * Normalizes a tag string in exact conformance with NairaTagRegistry rules:
 * - Strips leading '₦'
 * - Rejects '@'
 * - Lowercases ASCII [A-Z] -> [a-z]
 * - Validates length 3..32 and characters [a-z0-9_]
 * - Rejects leading/trailing/consecutive underscores
 */
export function normalizeTag(rawTag: string): string {
  if (!rawTag || typeof rawTag !== "string") {
    throw new Error("Invalid tag: Tag must be a non-empty string");
  }

  let str = rawTag.trim();

  // Strip leading '₦' (UTF-8 0xE2 0x82 0xA6)
  if (str.startsWith("₦")) {
    str = str.slice(1);
  }

  // Strict rejection of '@'
  if (str.includes("@")) {
    throw new Error("Invalid tag: '@' symbol is strictly prohibited in NairaTag identities");
  }

  const len = str.length;
  if (len < 3 || len > 32) {
    throw new Error(`Invalid tag length (${len}): NairaTag tags must be between 3 and 32 characters`);
  }

  // Character validation: lowercase letters, numbers, underscores
  const validPattern = /^[a-z0-9]+(_[a-z0-9]+)*$/;
  const lower = str.toLowerCase();

  if (!validPattern.test(lower)) {
    throw new Error(
      `Invalid tag format: "${rawTag}". Tags must contain only alphanumeric characters and non-consecutive internal underscores.`
    );
  }

  return lower;
}

/**
 * Formats a normalized tag into canonical display form: ₦UPPERCASE
 */
export function formatCanonicalTag(rawTag: string): string {
  const norm = normalizeTag(rawTag);
  return `₦${norm.toUpperCase()}`;
}

/**
 * Computes canonical 32-byte node hash for a tag: keccak256(normalize(tag))
 */
export function computeTagNode(rawTag: string): `0x${string}` {
  const norm = normalizeTag(rawTag);
  return keccak256(stringToBytes(norm));
}

// ==========================================
// Agent Profile Service
// ==========================================

export class AgentProfileService {
  /**
   * Constructs and validates a standardized AgentProfile from a registration manifest.
   */
  public static async createProfileFromManifest(
    manifest: AgentRegistrationManifest,
    options?: {
      network?: SupportedAgentIdNetwork;
      client?: PublicClient;
      verifyAgentIdOnChain?: boolean;
    }
  ): Promise<AgentProfile> {
    const canonicalName = normalizeTag(manifest.tag);
    const tag = `₦${canonicalName.toUpperCase()}`;
    const node = computeTagNode(canonicalName);

    // Validate owner address
    if (!manifest.owner || !isAddress(manifest.owner, { strict: false })) {
      throw new Error(`Invalid owner address: "${manifest.owner}"`);
    }
    const owner = getAddress(manifest.owner);

    // Validate designated identity address (defaults to owner if omitted)
    const designatedIdentityAddress = manifest.designatedIdentityAddress
      ? getAddress(manifest.designatedIdentityAddress)
      : owner;

    // Validate execution address (defaults to owner if omitted)
    const executionAddress = manifest.executionAddress
      ? getAddress(manifest.executionAddress)
      : owner;

    // Anti-Spoofing Dual-Sided Check:
    // If designatedIdentityAddress != owner, ensure explicit consent exists
    let isDualSidedVerified = false;
    if (designatedIdentityAddress.toLowerCase() === owner.toLowerCase()) {
      isDualSidedVerified = true;
    } else if (manifest.dualSidedConsent) {
      const consentSigner = manifest.dualSidedConsent.signedBy?.toLowerCase();
      if (consentSigner === designatedIdentityAddress.toLowerCase()) {
        isDualSidedVerified = true;
      }
    }

    // Verify Agent ID via official verifier (always checked against BSC Mainnet for credentials)
    let agentIdVerification: AgentIdVerificationResult | undefined = undefined;
    if (options?.verifyAgentIdOnChain !== false) {
      agentIdVerification = await verifyAgentId({
        address: designatedIdentityAddress,
        network: "bsc-mainnet",
        client: options?.client,
      });
    }

    const now = new Date().toISOString();

    return {
      tag,
      canonicalName,
      node,
      kind: manifest.kind ?? "specialist",
      owner,
      designatedIdentityAddress,
      executionAddress,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version ?? "1.0.0",
      author: manifest.author ?? "Unknown",
      capabilities: manifest.capabilities ?? [],
      endpoints: manifest.endpoints ?? {},
      availability: {
        status: manifest.availability?.status ?? "active",
        lastSeen: manifest.availability?.lastSeen ?? now,
        uptimePercent: manifest.availability?.uptimePercent ?? 100.0,
      },
      agentIdVerification,
      isTagOwnerVerified: false, // Updated when confirmed on-chain
      isDualSidedVerified,
      registeredAt: now,
      updatedAt: now,
    };
  }

  /**
   * Resolves on-chain profile metadata for a tag from NairaTagRegistry and NairaTagResolver.
   */
  public static async resolveOnChainProfile(
    rawTag: string,
    network: SupportedAgentIdNetwork = "bsc-testnet",
    client?: PublicClient
  ): Promise<Partial<AgentProfile> | null> {
    const canonicalName = normalizeTag(rawTag);
    const node = computeTagNode(canonicalName);
    const tag = `₦${canonicalName.toUpperCase()}`;

    const contracts = DEPLOYED_CONTRACTS[network];
    if (!contracts || contracts.registry === "0x0000000000000000000000000000000000000000") {
      return null;
    }

    const pubClient =
      client ??
      createPublicClient({
        chain: network === "bsc-mainnet" ? bsc : bscTestnet,
        transport: http(
          network === "bsc-mainnet"
            ? "https://bsc-dataseed.binance.org"
            : "https://bsc-testnet-dataseed.bnbchain.org",
          { timeout: 8000 }
        ),
      });

    try {
      // 1. Query Registry owner
      const ownerAddress = await pubClient.readContract({
        address: contracts.registry,
        abi: REGISTRY_ABI,
        functionName: "owner",
        args: [node],
      });

      if (!ownerAddress || ownerAddress === "0x0000000000000000000000000000000000000000") {
        return null; // Tag is not registered on-chain
      }

      // 2. Query Resolver address and text records
      const [executionAddr, identityAddrText, capabilitiesText, endpointText, kindText] =
        await Promise.all([
          pubClient.readContract({
            address: contracts.resolver,
            abi: RESOLVER_ABI,
            functionName: "addr",
            args: [node],
          }).catch(() => "0x0000000000000000000000000000000000000000" as `0x${string}`),
          pubClient.readContract({
            address: contracts.resolver,
            abi: RESOLVER_ABI,
            functionName: "text",
            args: [node, "agent.identity_address"],
          }).catch(() => ""),
          pubClient.readContract({
            address: contracts.resolver,
            abi: RESOLVER_ABI,
            functionName: "text",
            args: [node, "agent.capabilities"],
          }).catch(() => ""),
          pubClient.readContract({
            address: contracts.resolver,
            abi: RESOLVER_ABI,
            functionName: "text",
            args: [node, "agent.endpoint"],
          }).catch(() => ""),
          pubClient.readContract({
            address: contracts.resolver,
            abi: RESOLVER_ABI,
            functionName: "text",
            args: [node, "agent.kind"],
          }).catch(() => ""),
        ]);

      const normalizedOwner = getAddress(ownerAddress);
      const executionAddress =
        executionAddr && executionAddr !== "0x0000000000000000000000000000000000000000"
          ? getAddress(executionAddr)
          : normalizedOwner;

      const designatedIdentityAddress =
        identityAddrText && isAddress(identityAddrText, { strict: false })
          ? getAddress(identityAddrText)
          : normalizedOwner;

      return {
        tag,
        canonicalName,
        node,
        owner: normalizedOwner,
        designatedIdentityAddress,
        executionAddress,
        kind: kindText === "orchestrator" ? "orchestrator" : "specialist",
        endpoints: endpointText ? { a2a: endpointText } : {},
        isTagOwnerVerified: true,
      };
    } catch {
      return null;
    }
  }

  /**
   * Verifies the live on-chain activation status of a sovereign tag in
   * NairaTagAgentIDActivation.sol.
   */
  public static async verifyTagActivationOnChain(
    rawTag: string,
    network: SupportedAgentIdNetwork = "bsc-mainnet",
    client?: PublicClient
  ): Promise<OnChainActivationResult> {
    const canonicalName = normalizeTag(rawTag);
    const tag = formatCanonicalTag(canonicalName);
    const node = computeTagNode(canonicalName);

    const contracts = DEPLOYED_CONTRACTS[network];
    const activationAddr = contracts?.activation;

    if (!activationAddr || activationAddr === "0x0000000000000000000000000000000000000000") {
      return {
        node,
        tag,
        isActive: false,
        validityStatus: "CONTRACT_UNAVAILABLE",
        contractAddress: activationAddr || "0x0000000000000000000000000000000000000000",
        network,
      };
    }

    const pubClient =
      client ??
      createPublicClient({
        chain: network === "bsc-mainnet" ? bsc : bscTestnet,
        transport: http(),
      });

    try {
      const bytecode = await pubClient.getBytecode({ address: activationAddr });
      if (!bytecode || bytecode === "0x") {
        return {
          node,
          tag,
          isActive: false,
          validityStatus: "CONTRACT_UNAVAILABLE",
          contractAddress: activationAddr,
          network,
        };
      }

      const [validityNum, actData] = await Promise.all([
        pubClient.readContract({
          address: activationAddr,
          abi: ACTIVATION_ABI,
          functionName: "checkValidity",
          args: [node],
        }) as Promise<number>,
        pubClient.readContract({
          address: activationAddr,
          abi: ACTIVATION_ABI,
          functionName: "getActivation",
          args: [node],
        }) as Promise<[string, bigint, bigint, boolean, number, number]>,
      ]);

      const validityMap: TagActivationValidity[] = [
        "VALID",
        "NOT_ACTIVATED",
        "TAG_DOES_NOT_EXIST",
        "TAG_OWNERSHIP_CHANGED",
        "AGENT_ID_LOST",
        "VOLUNTARILY_DEACTIVATED",
      ];

      const validityStatus = validityMap[validityNum] ?? "NOT_ACTIVATED";
      const [holder, activatedAtBig, countBig, isActive] = actData;

      return {
        node,
        tag,
        holder: holder !== "0x0000000000000000000000000000000000000000" ? getAddress(holder) : undefined,
        isActive,
        validityStatus,
        activatedAt: activatedAtBig > 0n ? new Date(Number(activatedAtBig) * 1000).toISOString() : undefined,
        historicalCount: Number(countBig),
        contractAddress: activationAddr,
        network,
      };
    } catch {
      return {
        node,
        tag,
        isActive: false,
        validityStatus: "VERIFICATION_ERROR",
        contractAddress: activationAddr,
        network,
      };
    }
  }
}
