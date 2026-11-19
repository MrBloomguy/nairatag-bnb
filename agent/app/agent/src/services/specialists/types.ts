/**
 * Specialist Adapter Interface and Execution Classifications (Phase 2)
 * ===================================================================
 * Defines provider-neutral contracts for all specialist agents.
 * Every response carries an explicit execution classification:
 * - LIVE: Real-time, external API or on-chain transaction execution.
 * - CACHED: Valid data served from a bounded in-memory/durable cache.
 * - MOCK: Synthetic data used strictly in testing harnesses.
 * - SIMULATED: Sandboxed/dry-run execution without moving real funds.
 */

export type ExecutionClassification = "LIVE" | "CACHED" | "MOCK" | "SIMULATED";

export interface SpecialistExecutionMetadata {
  classification: ExecutionClassification;
  source: string;
  retrievedAt: string;
  latencyMs: number;
  isStale?: boolean;
  ttlSeconds?: number;
  rateLimitRemaining?: number;
}

export interface OnChainTransferEvent {
  tokenContract: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  amountRaw: string;
  amountFormatted: string;
  logIndex?: number;
  transactionIndex?: number;
}

export interface OnChainSettlementReceipt {
  chainId: number;
  blockNumber: number;
  transactionHash: `0x${string}`;
  status: "success" | "reverted";
  from: `0x${string}`;
  to: `0x${string}`;
  amount: string;
  tokenAddress?: `0x${string}`;
  tokenSymbol: string;
  gasUsed?: string;
  verifiedOnExplorerUrl?: string;
  transferEvent?: OnChainTransferEvent;
}

export interface SpecialistExecutionResult<T = Record<string, unknown>> {
  success: boolean;
  specialistTag: string;
  capabilityId: string;
  metadata: SpecialistExecutionMetadata;
  paymentCompleted?: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    httpStatus?: number;
    retryable?: boolean;
    details?: unknown;
  };
  onChainReceipt?: OnChainSettlementReceipt;
}

export interface SpecialistExecutionOptions {
  transport?: "live" | "sandbox";
  timeoutMs?: number;
  skipCache?: boolean;
  network?: "bsc-testnet" | "bsc-mainnet";
}

export interface SpecialistAdapter<T = Record<string, unknown>> {
  readonly tag: string;
  readonly canonicalName: string;
  readonly description: string;
  execute(
    payload: Record<string, unknown>,
    opts?: SpecialistExecutionOptions
  ): Promise<SpecialistExecutionResult<T>>;
}
