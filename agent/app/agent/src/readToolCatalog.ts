/** Shared descriptions and Zod input shapes for AI SDK and MCP read tools. */
import { z } from "zod";

const network = z
  .string()
  .optional()
  .describe("studio network name (defaults to the project's [network].default)");
const optionalAddress = z
  .string()
  .optional()
  .describe("0x address; omit for own wallet");

export const READ_TOOL_CATALOG = {
  wallet_info: {
    description:
      "Describe the agent's active wallet (address, kind, key location).",
    inputSchema: {},
  },
  wallet_list: {
    description: "List all local wallet addresses.",
    inputSchema: {},
  },
  wallet_address: {
    description: "Read the active wallet address.",
    inputSchema: {},
  },
  balance_native: {
    description:
      "Native BNB balance of an address (defaults to the agent's own wallet).",
    inputSchema: { address: optionalAddress, network },
  },
  balance_u: {
    description:
      "$U payment-token balance of an address (defaults to the agent's own wallet).",
    inputSchema: { address: optionalAddress, network },
  },
  network_info: {
    description: "Chain id, RPC, and token information for a Studio network.",
    inputSchema: { network },
  },
  tx_status: {
    description: "Status and receipt summary of a transaction hash.",
    inputSchema: {
      tx_hash: z.string().describe("0x transaction hash"),
      network,
    },
  },
  block_info: {
    description: "Read a block header summary.",
    inputSchema: { block: z.string().optional(), network },
  },
  contract_call_view: {
    description: "Call a read-only contract function by signature.",
    inputSchema: {
      address: z.string(),
      function_signature: z.string(),
      args: z.array(z.unknown()).optional(),
      output_types: z.array(z.string()).optional(),
      network,
    },
  },
  pieverse_usage: {
    description: "Pieverse LLM usage and credit summary for the last N days.",
    inputSchema: { days: z.number().int().optional() },
  },
  agent_info: {
    description: "ERC-8004 identity record for an agent id.",
    inputSchema: {
      agent_id: z.number().int().describe("ERC-8004 agent id"),
      network,
    },
  },
  agent_by_address: {
    description: "Look up an ERC-8004 registration by wallet address.",
    inputSchema: {
      address: z.string().describe("0x wallet address"),
      network,
    },
  },
  job_status: {
    description:
      "Read-only ERC-8183 job detail including the event-resolved deliverable URL.",
    inputSchema: {
      job_id: z.number().int().describe("on-chain job id"),
      network,
    },
  },
  job_list: {
    description: "List recent ERC-8183 jobs, optionally only this agent's.",
    inputSchema: {
      limit: z.number().int().optional(),
      mine: z.boolean().optional().describe("only jobs assigned to this agent"),
      network,
    },
  },
  job_count: {
    description: "Read the network-wide in-flight ERC-8183 job count.",
    inputSchema: { network },
  },
  verify_agent_id: {
    description:
      "Verify whether an address holds an official Binance/SPACE ID Agent ID (BEP-721 Soulbound Token). Defaults to the agent's own wallet.",
    inputSchema: {
      address: optionalAddress,
      network: z
        .enum(["bsc-mainnet", "bsc-testnet"])
        .optional()
        .describe("Target network ('bsc-mainnet' or 'bsc-testnet', defaults to 'bsc-mainnet' where official contract is deployed)"),
    },
  },
  discover_agents: {
    description:
      "Discover specialist agents in the open NairaTag directory by category, capability, or keyword.",
    inputSchema: {
      category: z.string().optional().describe("Category filter: 'defi', 'payments', 'data', 'logistics', 'security', 'general'"),
      capability: z.string().optional().describe("Specific capability id or name (e.g. 'settlement.usdc', 'tvl_feed')"),
      keyword: z.string().optional().describe("Keyword search across agent names, descriptions, and tags"),
      require_agent_id: z.boolean().optional().describe("Filter to agents holding verified Binance Agent ID on BNB Mainnet"),
    },
  },
  get_agent_profile: {
    description:
      "Retrieve the structured profile, verified trust tier, endpoints, and capabilities for a specific NairaTag (e.g. '₦BLOOM') or address.",
    inputSchema: {
      tag_or_address: z.string().describe("NairaTag (e.g. '₦BLOOM') or EVM address"),
    },
  },
  plan_orchestration: {
    description:
      "Formulate a structured orchestration plan for a user request: parses natural language intent, verifies caller identity tier, discovers matching specialist agents (₦BLOOM, ₦DEFILLAMA, ₦METEO, ₦COINGECKO, or registered third-parties), and sets explicit user authorization gates before any financial action.",
    inputSchema: {
      prompt: z.string().describe("Natural language task description (e.g. 'Send 5 USDC to ₦ALICE', 'What is PancakeSwap TVL on BNB?')"),
      caller_tag: z.string().optional().describe("Optional NairaTag of the caller (e.g. '₦USER')"),
      caller_address: optionalAddress.describe("Optional EVM address of the caller"),
    },
  },
  execute_orchestration_plan: {
    description:
      "Execute an orchestrated task plan by delegating to the matched specialist agent. Strictly enforces 'Identity is not Authority'—financial tasks (payments, escrow) require cryptographically verified EIP-712/EIP-191 authorization (approver address, signature, nonce, expiresAt). Prevents replay execution.",
    inputSchema: {
      plan_json: z.string().describe("The JSON-stringified OrchestrationPlan generated by plan_orchestration"),
      approver_address: optionalAddress.describe("EVM address of user authorizing the action (required for financial tasks)"),
      signature: z.string().optional().describe("REQUIRED for financial tasks: EIP-712 or EIP-191 cryptographic signature from approver"),
      nonce: z.number().int().positive().optional().describe("Monotonic per-approver integer nonce"),
      expires_at: z.number().int().positive().optional().describe("Unix timestamp in seconds when this authorization expires"),
      chain_id: z.number().int().positive().optional().describe("Chain ID where authorization applies (default 56)"),
      auth_type: z.enum(["eip712", "eip191"]).optional().describe("Signature type ('eip712' or 'eip191')"),
      user_affirmation: z.string().optional().describe("Optional text affirmation"),
    },
  },
  discover_binance_skills: {
    description:
      "Discover available skills from Binance Skills Hub (market data, orderbook depth, token security audit) and Binance Agentic Wallet (balances, transfers). Filter by category, access level, or search keyword.",
    inputSchema: {
      category: z
        .enum(["market", "security", "analytics", "wallet", "trade"])
        .optional()
        .describe("Filter by skill category"),
      access_level: z
        .enum(["read_only", "authenticated", "financial_execution"])
        .optional()
        .describe("Filter by access level ('read_only' vs 'financial_execution')"),
      query: z.string().optional().describe("Keyword search across skill IDs, names, and descriptions"),
    },
  },
  execute_binance_skill: {
    description:
      "Execute a skill from Binance Skills Hub or Binance Agentic Wallet. Read-only skills (e.g. 'binance.market.ticker', 'binance.token.security', 'binance.wallet.balance') execute immediately; financial skills (e.g. 'binance.wallet.transfer') strictly require user cryptographic consent (approver_address and signature).",
    inputSchema: {
      skill_id: z.string().describe("ID of skill to execute (e.g. 'binance.market.ticker', 'binance.token.security', 'binance.wallet.balance', 'binance.wallet.transfer')"),
      params_json: z.string().describe("JSON stringified parameters required by the skill"),
      approver_address: optionalAddress.describe("Authorizing wallet address (strictly required for financial execution skills)"),
      signature: z.string().optional().describe("Cryptographic signature (EIP-712 or EIP-191) from approver (required for financial execution)"),
      nonce: z.number().int().positive().optional().describe("Monotonic nonce for replay protection"),
      expires_at: z.number().int().positive().optional().describe("Expiration timestamp in seconds"),
      chain_id: z.number().int().positive().optional().describe("Chain ID where authorization applies (default 97 for bsc-testnet)"),
      auth_type: z.enum(["eip712", "eip191"]).optional().describe("Signature type ('eip712' or 'eip191')"),
    },
  },
} as const;

export type ReadToolName = keyof typeof READ_TOOL_CATALOG;
