/**
 * NairaTag Orchestrator Core (₦NAIRATAG)
 *
 * Implements the core orchestration, natural language intent classification,
 * specialist discovery, and workflow planning for the NairaTag Open Agent Economy.
 *
 * ARCHITECTURAL PRINCIPLES:
 * 1. "Your tag is your agent": Every user and specialist operates under a sovereign
 *    NairaTag (₦TAG) bound to an on-chain address and external credentials.
 * 2. "Identity is not Authority": Caller identity and Binance Agent ID verification
 *    establish trust tier, priority, and reputation—they NEVER bypass explicit
 *    user authorization for fund transfers, escrow locks, or state mutations.
 * 3. Open Specialist Discovery: The Orchestrator delegates tasks to specialized
 *    autonomous agents discovered via the Specialist Agent Directory (both seeded
 *    reference agents and third-party registered specialists).
 * 4. Transparent Workflow Planning: Produces a structured OrchestrationPlan detailing
 *    the parsed intent, chosen specialist, estimated cost/latency, and clear
 *    authorization gates before any action is executed.
 */

import { randomUUID } from "node:crypto";
import { isAddress, getAddress, type PublicClient } from "viem";
import { z } from "zod";
import {
  AgentProfileService,
  formatCanonicalTag,
  normalizeTag,
  type AgentProfile,
  type OnChainActivationResult,
  type SpecialistCapability,
  type TagActivationValidity,
} from "./agentProfileService.js";
import {
  verifyAgentId,
  type AgentIdVerificationResult,
  type AgentIdVerificationTier,
  type SupportedAgentIdNetwork,
} from "./agentIdVerifier.js";
import {
  globalSpecialistDirectory,
  SpecialistAgentDirectory,
  type AgentDiscoveryMatch,
} from "./specialistDirectory.js";

// ==========================================
// Intent Categories & Types
// ==========================================

export type IntentCategory =
  | "payments.settlement"
  | "payments.escrow"
  | "defi.tvl"
  | "market.price"
  | "logistics.weather"
  | "security.audit"
  | "identity.lookup"
  | "agent.discovery"
  | "general.task"
  | "ambiguous"
  | "unsupported";

export interface ExtractedEntities {
  recipientTag?: string;
  recipientAddress?: string;
  amount?: string;
  token?: string;
  protocol?: string;
  chain?: string;
  location?: string;
  targetTag?: string;
  targetAddress?: string;
  capabilityKeyword?: string;
  bountyId?: string;
}

export interface ParsedIntent {
  category: IntentCategory;
  action: string;
  confidence: number; // 0.0 - 1.0
  rawPrompt: string;
  entities: ExtractedEntities;
  requiresSpecialist: boolean;
  requiresFinancialAuthorization: boolean;
}

// ==========================================
// Caller Context & Identity
// ==========================================

export interface OrchestratorCaller {
  address?: string;
  tag?: string;
  canonicalName?: string;
  agentIdTier: AgentIdVerificationTier;
  isAgentIdHolder: boolean;
  verificationDetails?: AgentIdVerificationResult;
  isTagActivated?: boolean;
  activationStatus?: TagActivationValidity;
  activationDetails?: OnChainActivationResult;
}

// ==========================================
// Plan Structure
// ==========================================

export interface PlanDelegationTarget {
  tag: string;
  name: string;
  ownerAddress: string;
  executionAddress: string;
  capability: SpecialistCapability;
  pricing?: {
    model: string;
    amount?: string;
    currency?: string;
  };
  estimatedLatencyMs: number;
  relevanceScore: number;
  isAgentIdVerified: boolean;
  endpoint?: string;
}

export interface PlanAuthorizationRequirement {
  requiresUserAuthorization: boolean;
  isAuthorized: boolean;
  reason: string;
  spendingLimit?: {
    amount: string;
    currency: string;
  };
  warning?: string;
}

export interface OrchestrationPlan {
  planId: string;
  timestamp: string;
  status: "ready_for_review" | "ready_for_execution" | "needs_clarification" | "no_specialist_found" | "unsupported";
  caller: OrchestratorCaller;
  intent: ParsedIntent;
  matchedSpecialist?: PlanDelegationTarget;
  alternativeSpecialists?: PlanDelegationTarget[];
  preparedTaskPayload?: Record<string, unknown>;
  authorization: PlanAuthorizationRequirement;
  summary: string;
  clarificationPrompt?: string;
}

// ==========================================
// Strict Zod Schemas for Plan Validation (SEC-03)
// ==========================================

export const ExtractedEntitiesSchema = z.object({
  recipientTag: z.string().optional(),
  recipientAddress: z.string().optional(),
  amount: z.string().optional(),
  token: z.string().optional(),
  protocol: z.string().optional(),
  chain: z.string().optional(),
  location: z.string().optional(),
  targetTag: z.string().optional(),
  targetAddress: z.string().optional(),
  capabilityKeyword: z.string().optional(),
  bountyId: z.string().optional(),
});

export const ParsedIntentSchema = z.object({
  category: z.string(),
  action: z.string(),
  confidence: z.number(),
  rawPrompt: z.string(),
  entities: ExtractedEntitiesSchema,
  requiresSpecialist: z.boolean(),
  requiresFinancialAuthorization: z.boolean(),
});

export const PlanDelegationTargetSchema = z.object({
  tag: z.string(),
  name: z.string(),
  ownerAddress: z.string(),
  executionAddress: z.string(),
  capability: z.object({
    id: z.string(),
    category: z.string(),
    name: z.string(),
    description: z.string(),
  }).passthrough(),
  pricing: z.object({
    model: z.string(),
    amount: z.string().optional(),
    currency: z.string().optional(),
  }).optional(),
  estimatedLatencyMs: z.number(),
  relevanceScore: z.number(),
  isAgentIdVerified: z.boolean(),
  endpoint: z.string().optional(),
});

export const PlanAuthorizationRequirementSchema = z.object({
  requiresUserAuthorization: z.boolean(),
  isAuthorized: z.boolean(),
  reason: z.string(),
  spendingLimit: z.object({
    amount: z.string(),
    currency: z.string(),
  }).optional(),
  warning: z.string().optional(),
});

export const OrchestrationPlanSchema = z.object({
  planId: z.string().min(1, "planId must not be empty"),
  timestamp: z.string(),
  status: z.enum([
    "ready_for_review",
    "ready_for_execution",
    "needs_clarification",
    "no_specialist_found",
    "unsupported",
  ]),
  caller: z.object({
    address: z.string().optional(),
    tag: z.string().optional(),
    canonicalName: z.string().optional(),
    agentIdTier: z.string(),
    isAgentIdHolder: z.boolean(),
    isTagActivated: z.boolean().optional(),
    activationStatus: z.string().optional(),
  }).passthrough(),
  intent: ParsedIntentSchema,
  matchedSpecialist: PlanDelegationTargetSchema.optional(),
  alternativeSpecialists: z.array(PlanDelegationTargetSchema).optional(),
  preparedTaskPayload: z.record(z.unknown()).optional(),
  authorization: PlanAuthorizationRequirementSchema,
  summary: z.string(),
  clarificationPrompt: z.string().optional(),
});

// ==========================================
// Orchestrator Core Implementation
// ==========================================

export class NairaTagOrchestrator {
  private directory: SpecialistAgentDirectory;

  constructor(directory: SpecialistAgentDirectory = globalSpecialistDirectory) {
    this.directory = directory;
  }

  /**
   * Resolves the caller's identity and checks their Binance Agent ID verification status.
   * "Identity is not Authority": this informs trust tier and routing, not spending rights.
   */
  public async resolveCaller(
    callerInput?: { address?: string; tag?: string },
    opts: { network?: SupportedAgentIdNetwork; client?: PublicClient } = {}
  ): Promise<OrchestratorCaller> {
    let address = callerInput?.address;
    let tag = callerInput?.tag;
    let canonicalName: string | undefined;

    if (tag) {
      try {
        canonicalName = normalizeTag(tag);
        tag = formatCanonicalTag(canonicalName);
        const agent = await this.directory.getAgentByTag(canonicalName);
        if (agent) {
          address = address ?? agent.designatedIdentityAddress ?? agent.owner;
        }
      } catch {
        // keep raw tag if normalization fails
      }
    }

    if (address && !tag) {
      try {
        const agent = await this.directory.getAgentByAddress(address);
        if (agent) {
          tag = agent.tag;
          canonicalName = agent.canonicalName;
        }
      } catch {
        // address lookup error fallback
      }
    }

    if (!address && !tag) {
      return {
        agentIdTier: "unverified",
        isAgentIdHolder: false,
      };
    }

    // Verify Agent ID on BNB Mainnet
    let verification: AgentIdVerificationResult | undefined;
    if (address && isAddress(address)) {
      verification = await verifyAgentId({
        address: getAddress(address),
        network: "bsc-mainnet",
        client: opts.client,
      });
    }

    let tier = verification?.tier ?? "unverified";
    let isHolder = verification?.isHolder ?? false;

    // Verify On-Chain Activation in NairaTagAgentIDActivation.sol
    let isTagActivated = false;
    let activationStatus: TagActivationValidity = "NOT_ACTIVATED";
    let activationDetails: OnChainActivationResult | undefined;

    if (tag) {
      try {
        activationDetails = await AgentProfileService.verifyTagActivationOnChain(
          tag,
          opts.network ?? "bsc-mainnet",
          opts.client
        );
        activationStatus = activationDetails.validityStatus;
        isTagActivated = activationDetails.validityStatus === "VALID";

        // If tag was activated but Agent ID was subsequently lost, downgrade trust tier
        if (activationStatus === "AGENT_ID_LOST") {
          tier = "unverified";
          isHolder = false;
        }
      } catch {
        activationStatus = "VERIFICATION_ERROR";
        isTagActivated = false;
      }
    }

    return {
      address: address ? getAddress(address) : undefined,
      tag,
      canonicalName,
      agentIdTier: tier,
      isAgentIdHolder: isHolder,
      verificationDetails: verification,
      isTagActivated,
      activationStatus,
      activationDetails,
    };
  }

  /**
   * Parses natural language input to extract intent and relevant parameters.
   */
  public parseIntents(prompt: string): ParsedIntent {
    const clean = prompt.trim();
    const lower = clean.toLowerCase();

    // 1. Settlement / Direct Payment Intent
    // e.g. "Send 5 USDC to ₦ALICE", "Transfer 0.01 BNB to 0x123...", "Pay ₦BLOOM 2 USDC"
    const paymentRegex = /\b(send|transfer|pay|route|settle)\b/i;
    const isPayment = paymentRegex.test(lower);

    // 2. Escrow Intent
    // e.g. "Lock 10 USDC escrow for deliverable", "Release bounty 2 to ₦BLOOM", "Create task escrow"
    const escrowRegex = /\b(escrow|bounty|lock bounty|release bounty|release escrow|deposit bounty)\b/i;
    const isEscrow = escrowRegex.test(lower);

    // 3. DeFi TVL / Analytics Intent
    // e.g. "What is PancakeSwap TVL?", "Check Venus liquidity on BNB", "Show DeFi TVL"
    const defiRegex = /\b(tvl|defi|liquidity|protocol analytics|yield|apy|pancakeswap|venus|biswap)\b/i;
    const isDefi = defiRegex.test(lower);

    // 4. Market / Token Price Intent
    // e.g. "What is the price of BNB?", "Check BTC price in USDC", "Market stats for ETH"
    const priceRegex = /\b(price|market cap|quote|rate of|cost of|ticker|coingecko)\b/i;
    const isPrice = priceRegex.test(lower);

    // 6. Logistics / Weather Intent
    // e.g. "Check weather in Lagos for delivery", "Forecast in London", "Transit weather risk"
    const weatherRegex = /\b(weather|temperature|forecast|rain|climate|transit weather|delivery conditions)\b/i;
    const isWeather = weatherRegex.test(lower);

    // 7. Security & Contract Audit Intent
    // e.g. "Run a security audit", "Check contract vulnerability", "Audit bytecode"
    const securityRegex = /\b(security|audit|vulnerability|bytecode|reentrancy|penetration)\b/i;
    const isSecurity = securityRegex.test(lower);

    // 8. Identity / Tag Lookup Intent
    // e.g. "Who owns ₦BLOOM?", "Resolve ₦ALICE", "Verify Agent ID for 0x123..."
    const identityRegex = /\b(who owns|resolve tag|lookup tag|check tag|verify agent id|inspect tag)\b/i;
    const isIdentity = identityRegex.test(lower);

    // 9. Agent Discovery Intent
    // e.g. "Find agents for payments", "Discover DeFi agents", "Who can process weather data?"
    const discoveryRegex = /\b(find agents|discover agents|list specialists|who can|which agent)\b/i;
    const isDiscovery = discoveryRegex.test(lower);

    // Extract Entities
    const entities: ExtractedEntities = {};

    // Match NairaTags (₦TAG or NTAG)
    const tagMatch = clean.match(/(?:₦|[nN]aira[tT]ag:?)([a-zA-Z0-9_-]{3,32})\b/);
    if (tagMatch) {
      try {
        entities.recipientTag = formatCanonicalTag(normalizeTag(tagMatch[1]));
        entities.targetTag = entities.recipientTag;
      } catch {
        // ignore invalid tags
      }
    }

    // Match EVM Address
    const addrMatch = clean.match(/\b(0x[a-fA-F0-9]{40})\b/);
    if (addrMatch) {
      entities.recipientAddress = getAddress(addrMatch[1]);
      entities.targetAddress = entities.recipientAddress;
    }

    // Match Amount & Token
    const amountMatch = clean.match(/(\d+(?:\.\d+)?)\s*(usdc|usdt|bnb|busd|dai|usd)?\b/i);
    if (amountMatch) {
      entities.amount = amountMatch[1];
      if (amountMatch[2]) {
        entities.token = amountMatch[2].toUpperCase();
      }
    }

    // Match Location for Weather
    if (isWeather) {
      const locMatch = clean.match(/\b(?:in|for|at)\s+([A-Za-z\s]+?)(?:\s+(?:for|today|tomorrow|now)|$|\.|\?)/i);
      if (locMatch) {
        entities.location = locMatch[1].trim();
      }
    }

    // Match Protocol for DeFi
    if (isDefi) {
      const protoMatch = clean.match(/\b(pancakeswap|venus|biswap|uniswap|aave|curve|alpaca)\b/i);
      if (protoMatch) {
        entities.protocol = protoMatch[1].toLowerCase();
      }
    }

    // Classification Decision Tree
    if (isEscrow) {
      return {
        category: "payments.escrow",
        action: lower.includes("release") ? "release_bounty" : "lock_escrow",
        confidence: 0.95,
        rawPrompt: clean,
        entities,
        requiresSpecialist: true,
        requiresFinancialAuthorization: true,
      };
    }

    if (isPayment) {
      return {
        category: "payments.settlement",
        action: "send_payment",
        confidence: 0.92,
        rawPrompt: clean,
        entities,
        requiresSpecialist: true,
        requiresFinancialAuthorization: true,
      };
    }

    if (isDefi) {
      return {
        category: "defi.tvl",
        action: "query_tvl",
        confidence: 0.90,
        rawPrompt: clean,
        entities,
        requiresSpecialist: true,
        requiresFinancialAuthorization: false,
      };
    }

    if (isPrice) {
      return {
        category: "market.price",
        action: "query_price",
        confidence: 0.88,
        rawPrompt: clean,
        entities,
        requiresSpecialist: true,
        requiresFinancialAuthorization: false,
      };
    }

    if (isWeather) {
      return {
        category: "logistics.weather",
        action: "query_weather",
        confidence: 0.92,
        rawPrompt: clean,
        entities,
        requiresSpecialist: true,
        requiresFinancialAuthorization: false,
      };
    }

    if (isSecurity) {
      return {
        category: "security.audit",
        action: "audit_contract",
        confidence: 0.92,
        rawPrompt: clean,
        entities,
        requiresSpecialist: true,
        requiresFinancialAuthorization: true,
      };
    }

    if (isIdentity) {
      return {
        category: "identity.lookup",
        action: "inspect_identity",
        confidence: 0.85,
        rawPrompt: clean,
        entities,
        requiresSpecialist: false,
        requiresFinancialAuthorization: false,
      };
    }

    if (isDiscovery) {
      return {
        category: "agent.discovery",
        action: "discover_agents",
        confidence: 0.85,
        rawPrompt: clean,
        entities,
        requiresSpecialist: false,
        requiresFinancialAuthorization: false,
      };
    }

    // Ambiguous queries
    if (lower.length < 5) {
      return {
        category: "ambiguous",
        action: "clarify",
        confidence: 0.2,
        rawPrompt: clean,
        entities,
        requiresSpecialist: false,
        requiresFinancialAuthorization: false,
      };
    }

    // General specialist delegation task
    return {
      category: "general.task",
      action: "delegate_task",
      confidence: 0.7,
      rawPrompt: clean,
      entities,
      requiresSpecialist: true,
      requiresFinancialAuthorization: false,
    };
  }

  /**
   * Plans an orchestration workflow for the given user prompt.
   * Discovers matching specialist agents, structures the delegation payload,
   * and enforces strict "Identity is not Authority" boundaries.
   */
  public async planTask(
    prompt: string,
    callerInput?: { address?: string; tag?: string },
    opts: { network?: SupportedAgentIdNetwork; client?: PublicClient } = {}
  ): Promise<OrchestrationPlan> {
    const planId = `plan_${randomUUID()}`;
    const timestamp = new Date().toISOString();

    // 1. Resolve Caller Identity & Agent ID Tier
    const caller = await this.resolveCaller(callerInput, opts);

    // 2. Parse Intent
    const intent = this.parseIntents(prompt);

    // If ambiguous or unsupported
    if (intent.category === "ambiguous") {
      return {
        planId,
        timestamp,
        status: "needs_clarification",
        caller,
        intent,
        authorization: {
          requiresUserAuthorization: false,
          isAuthorized: false,
          reason: "No actions can be taken without a clear user objective.",
        },
        summary: "I could not clearly understand your request.",
        clarificationPrompt:
          "Could you please specify what task you'd like me to orchestrate? For example: 'Send 5 USDC to ₦ALICE', 'What is PancakeSwap TVL?', or 'Check weather in Lagos for delivery'.",
      };
    }

    if (intent.category === "unsupported") {
      return {
        planId,
        timestamp,
        status: "unsupported",
        caller,
        intent,
        authorization: {
          requiresUserAuthorization: false,
          isAuthorized: false,
          reason: "Requested capability is outside the current specialist agent network.",
        },
        summary: `I understood your prompt ("${prompt}"), but no active specialist agent currently supports this action.`,
        clarificationPrompt:
          "You can discover available specialists by asking 'Who can process payments?' or 'Find DeFi agents'.",
      };
    }

    // Handle internal Orchestrator capabilities (Identity & Discovery)
    if (intent.category === "identity.lookup" || intent.category === "agent.discovery") {
      return this.planInternalQuery(planId, timestamp, caller, intent);
    }

    // 3. Discover Specialist Agents
    const queryMap: Record<string, { category?: string; capability?: string; keyword?: string }> = {
      "payments.settlement": { category: "payments", capability: "settlement.usdc" },
      "payments.escrow": { category: "payments", capability: "escrow.release" },
      "defi.tvl": { category: "defi", capability: "defi.tvl_feed", keyword: intent.entities.protocol },
      "market.price": { capability: "market.spot_price", keyword: "price" },
      "logistics.weather": { category: "logistics", capability: "weather.logistics", keyword: intent.entities.location },
      "security.audit": { category: "security", keyword: "audit" },
      "general.task": { keyword: prompt },
    };

    const targetQuery = queryMap[intent.category] || { keyword: prompt };
    const discoveryResult = await this.directory.discoverAgents({
      category: targetQuery.category,
      capability: targetQuery.capability,
      keyword: targetQuery.keyword,
      status: "active",
      limit: 5,
    });

    if (discoveryResult.totalMatches === 0) {
      const isUnsupported = intent.category === "general.task" || intent.category === "unsupported";
      return {
        planId,
        timestamp,
        status: isUnsupported ? "unsupported" : "no_specialist_found",
        caller,
        intent,
        authorization: {
          requiresUserAuthorization: false,
          isAuthorized: false,
          reason: "No registered specialist matches this capability.",
        },
        summary: `Could not find an active specialist agent for ${intent.category} ("${prompt}").`,
        clarificationPrompt:
          "You can discover available specialists by asking 'Who can process payments?' or 'Find DeFi agents'.",
      };
    }

    // 4. Select Primary Specialist & Alternatives
    const topMatch = discoveryResult.results[0];
    const targetCapability = topMatch.matchedCapabilities[0] || topMatch.agent.capabilities[0];

    const matchedSpecialist: PlanDelegationTarget = {
      tag: topMatch.agent.tag,
      name: topMatch.agent.name,
      ownerAddress: topMatch.agent.owner,
      executionAddress: topMatch.agent.executionAddress,
      capability: targetCapability,
      pricing: targetCapability.pricing,
      estimatedLatencyMs: targetCapability.estimatedLatencyMs ?? 500,
      relevanceScore: topMatch.relevanceScore,
      isAgentIdVerified: topMatch.agent.agentIdVerification?.isHolder ?? false,
      endpoint: topMatch.agent.endpoints.a2a || topMatch.agent.endpoints.mcp,
    };

    const alternativeSpecialists: PlanDelegationTarget[] = discoveryResult.results.slice(1).map((m) => {
      const cap = m.matchedCapabilities[0] || m.agent.capabilities[0];
      return {
        tag: m.agent.tag,
        name: m.agent.name,
        ownerAddress: m.agent.owner,
        executionAddress: m.agent.executionAddress,
        capability: cap,
        pricing: cap.pricing,
        estimatedLatencyMs: cap.estimatedLatencyMs ?? 500,
        relevanceScore: m.relevanceScore,
        isAgentIdVerified: m.agent.agentIdVerification?.isHolder ?? false,
        endpoint: m.agent.endpoints.a2a || m.agent.endpoints.mcp,
      };
    });

    // 5. Structure Task Payload
    const preparedTaskPayload: Record<string, unknown> = {
      action: intent.action,
      capabilityId: targetCapability.id,
      callerTag: caller.tag,
      callerAddress: caller.address,
      callerAgentIdTier: caller.agentIdTier,
      entities: intent.entities,
      requestedAt: timestamp,
    };

    // 6. Enforce "Identity is not Authority"
    const requiresFinancialAuth = intent.requiresFinancialAuthorization;
    let authReason = "Read-only query: no financial authorization required.";
    let spendingLimit: { amount: string; currency: string } | undefined;

    if (requiresFinancialAuth) {
      const amt = intent.entities.amount ?? "0";
      const tok = intent.entities.token ?? "USDC";
      spendingLimit = { amount: amt, currency: tok };
      authReason = `Financial transaction requires your explicit authorization. Maximum spend: ${amt} ${tok}.`;
    }

    const summary = this.buildSummaryText(intent, matchedSpecialist, caller, requiresFinancialAuth);

    return {
      planId,
      timestamp,
      status: "ready_for_review",
      caller,
      intent,
      matchedSpecialist,
      alternativeSpecialists: alternativeSpecialists.length > 0 ? alternativeSpecialists : undefined,
      preparedTaskPayload,
      authorization: {
        requiresUserAuthorization: requiresFinancialAuth,
        isAuthorized: false, // NEVER automatically true!
        reason: authReason,
        spendingLimit,
        warning: requiresFinancialAuth
          ? "CRITICAL RULE: Neither NairaTag identity nor Binance Agent ID credentials bypass user authorization."
          : undefined,
      },
      summary,
    };
  }

  /**
   * Plans internal queries such as tag lookup or agent discovery.
   */
  private planInternalQuery(
    planId: string,
    timestamp: string,
    caller: OrchestratorCaller,
    intent: ParsedIntent
  ): OrchestrationPlan {
    const isLookup = intent.category === "identity.lookup";
    return {
      planId,
      timestamp,
      status: "ready_for_review",
      caller,
      intent,
      preparedTaskPayload: {
        action: intent.action,
        entities: intent.entities,
      },
      authorization: {
        requiresUserAuthorization: false,
        isAuthorized: false,
        reason: "Read-only lookup: no financial authorization needed.",
      },
      summary: isLookup
        ? `Resolving on-chain identity for ${intent.entities.targetTag ?? intent.entities.targetAddress ?? "target"}.`
        : "Discovering active specialist agents across the NairaTag Network.",
    };
  }

  /**
   * Builds a human-readable summary of the orchestration plan.
   */
  private buildSummaryText(
    intent: ParsedIntent,
    specialist: PlanDelegationTarget,
    caller: OrchestratorCaller,
    requiresAuth: boolean
  ): string {
    const callerTierBadge = caller.isAgentIdHolder ? " [Verified Agent ID Holder]" : "";
    const specialistBadge = specialist.isAgentIdVerified ? " [Verified Agent ID]" : "";

    let lines = [
      `🎯 **Orchestration Plan Formulated**`,
      `- **Caller:** ${caller.tag ?? caller.address ?? "Anonymous"}${callerTierBadge}`,
      `- **Intent:** ${intent.category} (${intent.action})`,
      `- **Selected Specialist:** ${specialist.tag} (${specialist.name})${specialistBadge}`,
      `- **Capability:** \`${specialist.capability.id}\` — ${specialist.capability.description}`,
      `- **Estimated Latency:** ~${specialist.estimatedLatencyMs}ms`,
    ];

    if (specialist.pricing && specialist.pricing.model !== "free") {
      lines.push(
        `- **Specialist Fee:** ${specialist.pricing.amount ?? "dynamic"} ${specialist.pricing.currency ?? "USDC"} (${specialist.pricing.model})`
      );
    }

    if (requiresAuth) {
      lines.push(
        `\n⚠️ **Action Required: Explicit User Consent**`,
        `Moving funds or locking escrow requires your manual approval. "Identity is not Authority": holding an Agent ID does not grant automated spending authority.`
      );
    } else {
      lines.push(`\n✅ **Read-only task:** Safe to execute directly.`);
    }

    return lines.join("\n");
  }
}

// Global Singleton Instance
export const globalNairaTagOrchestrator = new NairaTagOrchestrator();
