/**
 * NairaTag Open Specialist Agent Directory
 *
 * Implements an open, decentralized discovery index for specialist agents
 * across the NairaTag Network.
 *
 * ARCHITECTURAL REQUIREMENTS:
 * 1. Open Registration: Any third-party developer or first-party service can
 *    register an agent, publish capabilities, and become discoverable.
 * 2. Resolution vs. Discovery:
 *    - Resolution: Tag -> Payout address & endpoint.
 *    - Discovery: Task / Capability -> List of capable, verified agents.
 * 3. Identity Credential Verification: Ties into Binance / SPACE ID Agent ID
 *    verification on BNB Mainnet, giving verified holders priority discovery ranking.
 * 4. Extensibility: Pre-seeds reference ecosystem agents (₦BLOOM, ₦DEFILLAMA,
 *    ₦METEO, ₦COINGECKO) via the open registration interface—demonstrating
 *    that reference agents follow the exact same standards as third-party agents.
 */

import { getAddress, isAddress, type PublicClient } from "viem";
import {
  AgentProfileService,
  computeTagNode,
  formatCanonicalTag,
  normalizeTag,
  type AgentAvailabilityStatus,
  type AgentProfile,
  type AgentRegistrationManifest,
  type SpecialistCapability,
} from "./agentProfileService.js";
import {
  verifyAgentId,
  type AgentIdVerificationResult,
  type AgentIdVerificationTier,
  type SupportedAgentIdNetwork,
} from "./agentIdVerifier.js";

// ==========================================
// Discovery Query & Result Interfaces
// ==========================================

export interface AgentDiscoveryQuery {
  category?: "defi" | "payments" | "data" | "logistics" | "security" | "general" | string;
  capability?: string; // e.g. "settlement.usdc" or "tvl_feed"
  keyword?: string; // Free-text search matching name, description, or tags
  minTier?: AgentIdVerificationTier;
  requireAgentId?: boolean; // Must hold official Binance Agent ID
  status?: AgentAvailabilityStatus | "all";
  maxLatencyMs?: number;
  maxPricePerRequest?: number;
  limit?: number;
  offset?: number;
}

export interface AgentDiscoveryMatch {
  agent: AgentProfile;
  relevanceScore: number; // 0 - 100
  matchedCapabilities: SpecialistCapability[];
  matchReasons: string[];
}

export interface AgentDiscoveryResult {
  totalMatches: number;
  results: AgentDiscoveryMatch[];
  query: AgentDiscoveryQuery;
  timestamp: string;
}

// ==========================================
// Seed Reference Ecosystem Agents
// ==========================================

export const REFERENCE_ECOSYSTEM_AGENTS: AgentRegistrationManifest[] = [
  {
    tag: "₦BLOOM",
    kind: "specialist",
    name: "Bloom Sub-Second Settlement Agent",
    description:
      "Autonomous high-speed settlement agent executing sub-second digital dollar and token transfers with programmatic escrow releases.",
    author: "Bloom Labs",
    version: "1.2.0",
    owner: "0x7c26B4E55b23eF5dE44a2b957cf395AcB4c2AF26",
    designatedIdentityAddress: "0x7c26B4E55b23eF5dE44a2b957cf395AcB4c2AF26",
    executionAddress: "0x7c26B4E55b23eF5dE44a2b957cf395AcB4c2AF26",
    capabilities: [
      {
        id: "settlement.usdc",
        category: "payments",
        name: "Sub-Second USDC Settlement",
        description: "Instant sub-second settlement and payment routing across BNB Chain and Arc Network.",
        tags: ["payment", "usdc", "settlement", "instant", "micro-payment", "escrow"],
        pricing: { model: "fixed_per_request", amount: "0.001", currency: "USDC" },
        estimatedLatencyMs: 450,
      },
      {
        id: "escrow.release",
        category: "payments",
        name: "Autonomous Escrow Release",
        description: "Cryptographically verifies deliverable proofs and triggers smart contract escrow release.",
        tags: ["escrow", "bounty", "release", "verification", "smart-contract"],
        pricing: { model: "fixed_per_request", amount: "0.002", currency: "USDC" },
        estimatedLatencyMs: 650,
      },
    ],
    endpoints: {
      a2a: "https://bloom.nairatag.ng/a2a",
      mcp: "https://bloom.nairatag.ng/mcp",
      x402: "https://bloom.nairatag.ng/x402",
      web: "https://bloom.nairatag.ng",
    },
    availability: { status: "active", uptimePercent: 99.95 },
  },
  {
    tag: "₦DEFILLAMA",
    kind: "specialist",
    name: "DeFiLlama Multi-Chain Telemetry Agent",
    description:
      "On-chain DeFi metrics, real-time protocol TVL feeds, DEX volumes, yield opportunities, and liquidation tracking.",
    author: "DeFi Intelligence Collective",
    version: "2.0.1",
    owner: "0xbfA1813A78b66f5C953b1b9e289547d32a0F6Ce6",
    designatedIdentityAddress: "0xbfA1813A78b66f5C953b1b9e289547d32a0F6Ce6",
    executionAddress: "0xbfA1813A78b66f5C953b1b9e289547d32a0F6Ce6",
    capabilities: [
      {
        id: "defi.tvl_feed",
        category: "defi",
        name: "Protocol TVL & Volume Feed",
        description: "Fetches live Total Value Locked (TVL) and 24h trading volume for protocols across BNB Chain.",
        tags: ["defi", "tvl", "analytics", "volume", "protocols", "yield"],
        pricing: { model: "free" },
        estimatedLatencyMs: 300,
      },
      {
        id: "defi.yield_oracle",
        category: "defi",
        name: "Yield & APY Comparison",
        description: "Scans active pools and vaults to identify optimal risk-adjusted APYs.",
        tags: ["yield", "apy", "staking", "lending", "pools"],
        pricing: { model: "free" },
        estimatedLatencyMs: 400,
      },
    ],
    endpoints: {
      a2a: "https://defillama-agent.nairatag.ng/a2a",
      mcp: "https://defillama-agent.nairatag.ng/mcp",
      web: "https://defillama.com",
    },
    availability: { status: "active", uptimePercent: 99.99 },
  },
  {
    tag: "₦METEO",
    kind: "specialist",
    name: "Meteo Weather & Environmental Telemetry Agent",
    description:
      "Real-time hyper-local weather conditions, climate hazard indexing, and agricultural logistics impact scoring.",
    author: "GeoTelemetry Network",
    version: "1.1.0",
    owner: "0x235d6C2DEE61536B8f0c97d6B00c2E299Cdfae36",
    designatedIdentityAddress: "0x235d6C2DEE61536B8f0c97d6B00c2E299Cdfae36",
    executionAddress: "0x235d6C2DEE61536B8f0c97d6B00c2E299Cdfae36",
    capabilities: [
      {
        id: "weather.logistics",
        category: "logistics",
        name: "Supply Chain Weather Risk Scoring",
        description: "Calculates route delay probability and perishable cargo risk based on localized radar telemetry.",
        tags: ["weather", "logistics", "supply-chain", "cargo", "risk", "freight"],
        pricing: { model: "fixed_per_request", amount: "0.0005", currency: "BNB" },
        estimatedLatencyMs: 500,
      },
      {
        id: "weather.forecast_telemetry",
        category: "data",
        name: "Hyper-Local Forecast Telemetry",
        description: "Hourly precipitation, wind gradient, and thermal data feeds for autonomous operational planning.",
        tags: ["forecast", "temperature", "precipitation", "wind", "telemetry"],
        pricing: { model: "free" },
        estimatedLatencyMs: 350,
      },
    ],
    endpoints: {
      a2a: "https://meteo.nairatag.ng/a2a",
      web: "https://meteo.nairatag.ng",
    },
    availability: { status: "active", uptimePercent: 99.85 },
  },
  {
    tag: "₦COINGECKO",
    kind: "specialist",
    name: "CoinGecko Market & Price Oracle Agent",
    description:
      "Authoritative cryptocurrency market capitalization, verified DEX/CEX spot pricing, depth oracles, and trending metrics.",
    author: "CoinGecko On-Chain Gateway",
    version: "2.1.0",
    owner: "0x1abf7d6a503aA834eC95cFE3f8E331481b2a0Ef8",
    designatedIdentityAddress: "0x1abf7d6a503aA834eC95cFE3f8E331481b2a0Ef8",
    executionAddress: "0x1abf7d6a503aA834eC95cFE3f8E331481b2a0Ef8",
    capabilities: [
      {
        id: "market.spot_price",
        category: "defi",
        name: "Verified Spot Price Oracle",
        description: "Returns multi-exchange volume-weighted average price (VWAP) for tokens on BNB Chain and major ecosystems.",
        tags: ["price", "market", "oracle", "spot", "quotes", "dex"],
        pricing: { model: "free" },
        estimatedLatencyMs: 250,
      },
      {
        id: "market.token_metrics",
        category: "data",
        name: "Token Market Metrics & Liquidity Depth",
        description: "24h trading volume, circulating supply, market capitalization, and all-time-high delta.",
        tags: ["market-cap", "liquidity", "volume", "token-metrics"],
        pricing: { model: "free" },
        estimatedLatencyMs: 300,
      },
    ],
    endpoints: {
      a2a: "https://coingecko-agent.nairatag.ng/a2a",
      mcp: "https://coingecko-agent.nairatag.ng/mcp",
      web: "https://www.coingecko.com",
    },
    availability: { status: "active", uptimePercent: 99.98 },
  },
];

// ==========================================
// Open Specialist Agent Directory Class
// ==========================================

export class SpecialistAgentDirectory {
  private _agentsByTag: Map<string, AgentProfile> = new Map();
  private _agentsByAddress: Map<string, AgentProfile> = new Map();
  private _agentsByNode: Map<string, AgentProfile> = new Map();
  private _initialized: boolean = false;

  constructor() {
    // Lazy initialized via init() or auto-initialized on first read
  }

  /**
   * Initializes the directory by registering seed reference agents.
   * Can be seeded synchronously or populated from an external index.
   */
  public async init(options?: {
    verifyOnChainAgentId?: boolean;
    client?: PublicClient;
  }): Promise<void> {
    if (this._initialized) return;

    for (const manifest of REFERENCE_ECOSYSTEM_AGENTS) {
      await this.registerAgent(manifest, {
        verifyAgentIdOnChain: options?.verifyOnChainAgentId ?? false,
        client: options?.client,
      });
    }

    this._initialized = true;
  }

  /**
   * Registers a new agent profile into the open directory.
   * Open to any developer or autonomous agent.
   */
  public async registerAgent(
    manifest: AgentRegistrationManifest,
    options?: {
      network?: SupportedAgentIdNetwork;
      client?: PublicClient;
      verifyAgentIdOnChain?: boolean;
    }
  ): Promise<AgentProfile> {
    const profile = await AgentProfileService.createProfileFromManifest(
      manifest,
      options
    );

    // Save into index maps
    this._agentsByTag.set(profile.canonicalName, profile);
    this._agentsByNode.set(profile.node.toLowerCase(), profile);

    // Map owner, designated identity address, and execution address
    this._agentsByAddress.set(profile.owner.toLowerCase(), profile);
    this._agentsByAddress.set(profile.designatedIdentityAddress.toLowerCase(), profile);
    this._agentsByAddress.set(profile.executionAddress.toLowerCase(), profile);

    return profile;
  }

  /**
   * Updates an existing registered agent profile.
   * Requires caller to be the verified owner of the tag.
   */
  public async updateAgent(
    rawTag: string,
    updates: Partial<AgentRegistrationManifest>,
    callerAddress: string
  ): Promise<AgentProfile> {
    const canonicalName = normalizeTag(rawTag);
    const existing = this._agentsByTag.get(canonicalName);

    if (!existing) {
      throw new Error(`Agent not found for tag: "${formatCanonicalTag(rawTag)}"`);
    }

    if (!callerAddress || !isAddress(callerAddress, { strict: false })) {
      throw new Error("Invalid caller address for update authorization");
    }

    if (existing.owner.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new Error(
        `Unauthorized: Only the sovereign tag owner (${existing.owner}) can update this agent profile`
      );
    }

    // Merge updates
    const mergedManifest: AgentRegistrationManifest = {
      tag: existing.tag,
      name: updates.name ?? existing.name,
      description: updates.description ?? existing.description,
      version: updates.version ?? existing.version,
      author: updates.author ?? existing.author,
      owner: existing.owner,
      designatedIdentityAddress:
        updates.designatedIdentityAddress ?? existing.designatedIdentityAddress,
      executionAddress: updates.executionAddress ?? existing.executionAddress,
      capabilities: updates.capabilities ?? existing.capabilities,
      endpoints: { ...existing.endpoints, ...updates.endpoints },
      availability: { ...existing.availability, ...updates.availability },
      dualSidedConsent: updates.dualSidedConsent,
    };

    const updatedProfile = await AgentProfileService.createProfileFromManifest(
      mergedManifest,
      { verifyAgentIdOnChain: false }
    );

    this._agentsByTag.set(canonicalName, updatedProfile);
    this._agentsByNode.set(updatedProfile.node.toLowerCase(), updatedProfile);
    this._agentsByAddress.set(updatedProfile.owner.toLowerCase(), updatedProfile);
    this._agentsByAddress.set(
      updatedProfile.designatedIdentityAddress.toLowerCase(),
      updatedProfile
    );
    this._agentsByAddress.set(
      updatedProfile.executionAddress.toLowerCase(),
      updatedProfile
    );

    return updatedProfile;
  }

  /**
   * Unregisters an agent from the directory.
   */
  public async unregisterAgent(
    rawTag: string,
    callerAddress: string
  ): Promise<boolean> {
    const canonicalName = normalizeTag(rawTag);
    const existing = this._agentsByTag.get(canonicalName);

    if (!existing) return false;

    if (existing.owner.toLowerCase() !== callerAddress.toLowerCase()) {
      throw new Error("Unauthorized: Only the tag owner can unregister this agent");
    }

    this._agentsByTag.delete(canonicalName);
    this._agentsByNode.delete(existing.node.toLowerCase());
    this._agentsByAddress.delete(existing.owner.toLowerCase());
    this._agentsByAddress.delete(existing.designatedIdentityAddress.toLowerCase());
    this._agentsByAddress.delete(existing.executionAddress.toLowerCase());

    return true;
  }

  /**
   * Retrieves an agent profile by tag (e.g. "₦BLOOM" or "bloom").
   */
  public async getAgentByTag(rawTag: string): Promise<AgentProfile | null> {
    if (!this._initialized) await this.init();
    try {
      const canonicalName = normalizeTag(rawTag);
      return this._agentsByTag.get(canonicalName) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves an agent profile by associated address (owner, designated identity, or execution address).
   */
  public async getAgentByAddress(rawAddress: string): Promise<AgentProfile | null> {
    if (!this._initialized) await this.init();
    if (!rawAddress || !isAddress(rawAddress, { strict: false })) {
      return null;
    }
    const normalized = rawAddress.toLowerCase();
    return this._agentsByAddress.get(normalized) ?? null;
  }

  /**
   * Lists all currently registered agent profiles.
   */
  public async listAllAgents(): Promise<AgentProfile[]> {
    if (!this._initialized) await this.init();
    return Array.from(this._agentsByTag.values());
  }

  /**
   * Core Agent Discovery Engine.
   * Matches, ranks, and filters agents according to semantic capabilities and criteria.
   */
  public async discoverAgents(
    query: AgentDiscoveryQuery
  ): Promise<AgentDiscoveryResult> {
    if (!this._initialized) await this.init();

    const timestamp = new Date().toISOString();
    const allAgents = Array.from(this._agentsByTag.values());
    const matches: AgentDiscoveryMatch[] = [];

    const normKeyword = query.keyword?.trim().toLowerCase();
    const normCapability = query.capability?.trim().toLowerCase();
    const normCategory = query.category?.trim().toLowerCase();

    for (const agent of allAgents) {
      let score = 0;
      const matchReasons: string[] = [];
      const matchedCapabilities: SpecialistCapability[] = [];

      // 1. Availability filter
      if (query.status && query.status !== "all") {
        if (agent.availability.status !== query.status) {
          continue;
        }
      }

      // 2. Agent ID verification filter
      if (query.requireAgentId) {
        if (!agent.agentIdVerification?.hasAgentId) {
          continue;
        }
      }

      // 3. Category matching
      if (normCategory) {
        const catCaps = agent.capabilities.filter(
          (c) => c.category.toLowerCase() === normCategory
        );
        if (catCaps.length > 0) {
          score += 35;
          matchReasons.push(`Matches requested category "${normCategory}"`);
          matchedCapabilities.push(...catCaps);
        } else {
          // If category specified and no match, skip
          continue;
        }
      }

      // 4. Specific capability matching
      if (normCapability) {
        const directCaps = agent.capabilities.filter(
          (c) =>
            c.id.toLowerCase() === normCapability ||
            c.name.toLowerCase().includes(normCapability) ||
            c.tags.some((t) => t.toLowerCase() === normCapability)
        );

        if (directCaps.length > 0) {
          score += 45;
          matchReasons.push(`Matches capability requirement "${normCapability}"`);
          for (const cap of directCaps) {
            if (!matchedCapabilities.some((c) => c.id === cap.id)) {
              matchedCapabilities.push(cap);
            }
          }
        } else if (!normCategory && !normKeyword) {
          // If only capability specified and no match, skip
          continue;
        }
      }

      // 5. Keyword search across name, description, tags
      if (normKeyword) {
        let keywordHit = false;
        if (agent.name.toLowerCase().includes(normKeyword)) {
          score += 25;
          keywordHit = true;
          matchReasons.push(`Agent name matches keyword "${normKeyword}"`);
        }
        if (agent.description.toLowerCase().includes(normKeyword)) {
          score += 20;
          keywordHit = true;
          matchReasons.push(`Description matches keyword "${normKeyword}"`);
        }
        if (agent.tag.toLowerCase().includes(normKeyword)) {
          score += 30;
          keywordHit = true;
          matchReasons.push(`Tag matches keyword "${normKeyword}"`);
        }

        // Search capability tags and names
        for (const cap of agent.capabilities) {
          const tagHit = cap.tags.some((t) => t.toLowerCase().includes(normKeyword));
          const nameHit = cap.name.toLowerCase().includes(normKeyword);
          const descHit = cap.description.toLowerCase().includes(normKeyword);
          if (tagHit || nameHit || descHit) {
            score += 15;
            keywordHit = true;
            if (!matchedCapabilities.some((c) => c.id === cap.id)) {
              matchedCapabilities.push(cap);
            }
          }
        }

        if (!keywordHit && !normCategory && !normCapability) {
          continue;
        }
      }

      // If no query parameters were specified, return all agents
      if (!normCategory && !normCapability && !normKeyword) {
        score = 50;
        matchReasons.push("Active registered agent");
        matchedCapabilities.push(...agent.capabilities);
      }

      // 6. Bonus scoring for trust credentials
      if (agent.agentIdVerification?.hasAgentId) {
        score += 20;
        matchReasons.push("Holds verified Binance/SPACE ID Agent ID on BNB Mainnet");
      }
      if (agent.isDualSidedVerified) {
        score += 10;
        matchReasons.push("Dual-sided identity binding verified");
      }
      if (agent.availability.status === "active") {
        score += 5;
      }

      // Latency filter
      if (query.maxLatencyMs !== undefined) {
        const hasLowLatency = agent.capabilities.some(
          (c) =>
            c.estimatedLatencyMs !== undefined &&
            c.estimatedLatencyMs <= query.maxLatencyMs!
        );
        if (!hasLowLatency) {
          continue;
        }
      }

      matches.push({
        agent,
        relevanceScore: Math.min(score, 100),
        matchedCapabilities,
        matchReasons,
      });
    }

    // Sort by relevance score descending
    matches.sort((a, b) => b.relevanceScore - a.relevanceScore);

    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const paginated = matches.slice(offset, offset + limit);

    return {
      totalMatches: matches.length,
      results: paginated,
      query,
      timestamp,
    };
  }

  /**
   * Synchronizes an on-chain registered tag into the directory.
   * Pulls ownership, address, and text metadata from deployed contracts.
   */
  public async syncWithOnChain(
    rawTag: string,
    network: SupportedAgentIdNetwork = "bsc-testnet",
    client?: PublicClient
  ): Promise<AgentProfile | null> {
    const onChainData = await AgentProfileService.resolveOnChainProfile(
      rawTag,
      network,
      client
    );

    if (!onChainData || !onChainData.owner) {
      return null;
    }

    // Verify Agent ID on Mainnet for the on-chain designated address
    const agentIdRes = await verifyAgentId({
      address: onChainData.designatedIdentityAddress ?? onChainData.owner,
      network: "bsc-mainnet",
      client,
    });

    const manifest: AgentRegistrationManifest = {
      tag: onChainData.tag!,
      kind: onChainData.kind ?? "specialist",
      name: `${onChainData.tag} On-Chain Agent`,
      description: `Discovered and verified on-chain via NairaTag Resolver (${network}).`,
      owner: onChainData.owner,
      designatedIdentityAddress: onChainData.designatedIdentityAddress,
      executionAddress: onChainData.executionAddress,
      capabilities: [],
      endpoints: onChainData.endpoints ?? {},
    };

    const profile = await this.registerAgent(manifest, {
      network,
      client,
      verifyAgentIdOnChain: false,
    });

    profile.agentIdVerification = agentIdRes;
    profile.isTagOwnerVerified = true;

    return profile;
  }
}

// Global Singleton Instance
export const globalSpecialistDirectory = new SpecialistAgentDirectory();
