/**
 * Binance Skills Hub & Agentic Wallet System Types
 * ================================================
 * Defines provider-neutral interfaces for Binance Skills Hub capabilities
 * (market data, token analysis, security scans) and Binance Agentic Wallet
 * capabilities (balances, transfers, swaps).
 *
 * Strict Architectural Tenets:
 * 1. "Identity is not Authority": Binance Agent ID is identity; Binance Agentic Wallet
 *    is an execution provider, not identity. "Your tag is your agent".
 * 2. Financial execution skills (e.g. transfers, swaps) strictly require explicit
 *    user cryptographic authorization (EIP-712 or EIP-191).
 * 3. Read-only skills (market, security, analytics) execute without interactive prompts.
 */

import { z } from "zod";
import type { SkillAuthorizationProof } from "./skillAuthorizationVerifier.js";

export type SkillCategory =
  | "market"
  | "security"
  | "analytics"
  | "wallet"
  | "trade";

export type SkillAccessLevel =
  | "read_only"
  | "authenticated"
  | "financial_execution";

export interface SkillExecutionContext {
  callerAddress?: string;
  callerTag?: string;
  agentIdTier?: string;
  authProof?: SkillAuthorizationProof;
  userConfirmationAccepted?: boolean;
  transport?: "live" | "sandbox" | "simulated";
  testSeam?: any;
}

export interface SkillExecutionMetadata {
  source: string;
  timestamp: string;
  latencyMs: number;
  cached?: boolean;
}

export interface SkillExecutionResult<T = any> {
  success: boolean;
  skillId: string;
  data?: T;
  classification: "LIVE" | "CACHED" | "SIMULATED";
  metadata: SkillExecutionMetadata;
  onChainReceipt?: {
    status: "success" | "reverted";
    transactionHash: string;
    blockNumber?: bigint | number;
    gasUsed?: bigint | number;
    from?: string;
    to?: string;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface SkillDefinition<TParams = any, TResult = any> {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  accessLevel: SkillAccessLevel;
  requiresUserConsent: boolean;
  inputSchema: z.ZodType<TParams>;
  handler: (params: TParams, context: SkillExecutionContext) => Promise<SkillExecutionResult<TResult>>;
}
