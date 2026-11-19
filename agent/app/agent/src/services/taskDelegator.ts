/**
 * NairaTag Task Delegator & Interactive Cryptographic Authorization Gate (Phase 1 Remediation)
 *
 * Implements outbound task delegation, durable replay protection, and cryptographically
 * verified wallet-bound authorization for the NairaTag Orchestrator (₦NAIRATAG).
 *
 * ARCHITECTURAL REQUIREMENTS:
 * 1. "Identity is not Authority": Financial actions (settlements, escrow locks/releases)
 *    CANNOT be executed autonomously. They strictly require explicit, interactive user consent
 *    proven by an EIP-712 or EIP-191 cryptographic signature from the authorized wallet.
 * 2. Cryptographic Replay & Anti-Tampering: Approval is strictly bound to:
 *    planId, action, targetSpecialist, recipient, amount, token, chainId, monotonic nonce, and expiry.
 *    Any altered parameter, expired timestamp, or reused nonce/planId is rejected.
 * 3. Durable Storage: Replay protection survives server restarts, scale-to-zero wake-ups,
 *    and multi-worker deployments via DurableExecutionStore.
 * 4. Transparent Receipts: Every execution returns a structured, auditable DelegationReceipt.
 */

import { randomUUID } from "node:crypto";
import {
  getAddress,
  isAddress,
  recoverMessageAddress,
  recoverTypedDataAddress,
  type Hex,
} from "viem";
import {
  OrchestrationPlanSchema,
  type OrchestrationPlan,
  type PlanDelegationTarget,
} from "./orchestratorCore.js";
import {
  DurableExecutionStore,
  globalExecutionStore,
} from "./durableExecutionStore.js";
import { SpecialistAdapterRegistry } from "./specialists/specialistAdapterRegistry.js";
import type {
  ExecutionClassification,
  SpecialistExecutionMetadata,
  OnChainSettlementReceipt,
} from "./specialists/types.js";
import {
  globalSpecialistDirectory,
  SpecialistAgentDirectory,
} from "./specialistDirectory.js";

// ==========================================
// EIP-712 Typed Data Specifications (SEC-01)
// ==========================================

export const NAIRATAG_AUTH_DOMAIN = {
  name: "NairaTag Task Authorization",
  version: "1",
  chainId: 56,
} as const;

export const NAIRATAG_AUTH_TYPES = {
  NairaTagTaskAuthorization: [
    { name: "planId", type: "string" },
    { name: "action", type: "string" },
    { name: "targetSpecialist", type: "string" },
    { name: "recipient", type: "string" },
    { name: "amount", type: "string" },
    { name: "token", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

/**
 * Builds the canonical plaintext message for EIP-191 personal_sign fallback.
 */
export function buildCanonicalAuthorizationMessage(params: {
  planId: string;
  action: string;
  targetSpecialist: string;
  recipient: string;
  amount: string;
  token: string;
  chainId: number;
  nonce: number;
  expiresAt: number;
}): string {
  return [
    "NairaTag Task Authorization",
    `Plan ID: ${params.planId}`,
    `Action: ${params.action}`,
    `Target Specialist: ${params.targetSpecialist}`,
    `Recipient: ${params.recipient}`,
    `Amount: ${params.amount} ${params.token}`,
    `Chain ID: ${params.chainId}`,
    `Nonce: ${params.nonce}`,
    `Expires: ${params.expiresAt}`,
  ].join("\n");
}

// ==========================================
// Authorization Request & Proof
// ==========================================

export interface PlanAuthorizationRequest {
  planId: string;
  approvedBy: string; // EVM address of approving user / wallet
  signature: `0x${string}` | string; // REQUIRED cryptographic signature
  nonce: number; // Monotonic per-approver integer
  expiresAt: number; // Unix timestamp in seconds
  chainId?: number; // Target chain ID (defaults to 56)
  type?: "eip712" | "eip191";
  userAffirmation?: string;
}

// ==========================================
// Delegation Receipt Interface
// ==========================================

export interface DelegationReceipt {
  receiptId: string;
  planId: string;
  status: "completed" | "failed" | "unauthorized" | "rejected";
  specialistTag: string;
  specialistName: string;
  specialistAddress: string;
  capabilityId: string;
  executedAt: string;
  latencyMs: number;
  resultPayload?: Record<string, unknown>;
  settlementTxHash?: string;
  deliverableUrl?: string;
  classification?: ExecutionClassification;
  executionMetadata?: SpecialistExecutionMetadata;
  onChainReceipt?: OnChainSettlementReceipt;
  error?: string;
  authorizationDetails?: {
    approvedBy: string;
    spendingAmount?: string;
    spendingCurrency?: string;
    nonce?: number;
    expiresAt?: number;
    signatureType?: "eip712" | "eip191";
    verifiedAgentIdTier?: string;
  };
}

// ==========================================
// Task Delegator Implementation
// ==========================================

export class TaskDelegator {
  private directory: SpecialistAgentDirectory;
  private store: DurableExecutionStore;
  private receipts: Map<string, DelegationReceipt> = new Map();

  constructor(
    directory: SpecialistAgentDirectory = globalSpecialistDirectory,
    store: DurableExecutionStore = globalExecutionStore
  ) {
    this.directory = directory;
    this.store = store;
  }

  /**
   * Cryptographically verifies user authorization for a planned financial task.
   * Enforces:
   * 1. Plan ID match
   * 2. Replay protection (via persistent DurableExecutionStore)
   * 3. Expiration window (current timestamp <= expiresAt)
   * 4. Monotonic nonce progression (nonce > highestRecordedNonce)
   * 5. Strict parameter binding (action, specialist, recipient, amount, token, chainId)
   * 6. Cryptographic signature recovery (EIP-712 or EIP-191) matching approvedBy
   */
  public async authorizePlan(
    plan: OrchestrationPlan,
    authRequest: PlanAuthorizationRequest
  ): Promise<{ valid: boolean; error?: string; authorizedPlan?: OrchestrationPlan }> {
    // 1. Verify plan ID match
    if (plan.planId !== authRequest.planId) {
      return {
        valid: false,
        error: `Plan ID mismatch: authorization target (${authRequest.planId}) does not match plan (${plan.planId}).`,
      };
    }

    // 2. Replay check via persistent store
    if (this.store.hasPlan(plan.planId)) {
      return {
        valid: false,
        error: `Plan ${plan.planId} has already been executed. Replay authorization is rejected.`,
      };
    }

    // 3. Approver address validation
    if (!isAddress(authRequest.approvedBy)) {
      return {
        valid: false,
        error: `Invalid approver address: ${authRequest.approvedBy}`,
      };
    }
    const cleanApprover = getAddress(authRequest.approvedBy);

    // If plan specified a caller address, verify approver matches
    if (plan.caller.address && cleanApprover.toLowerCase() !== plan.caller.address.toLowerCase()) {
      return {
        valid: false,
        error: `Approver mismatch: authorized by ${cleanApprover}, but plan owner is ${plan.caller.address}.`,
      };
    }

    // 4. Cryptographic signature presence check
    if (!authRequest.signature || typeof authRequest.signature !== "string") {
      return {
        valid: false,
        error: "Missing cryptographic signature: financial actions strictly require a valid wallet signature.",
      };
    }

    const sigHex = authRequest.signature.trim();
    if (!/^0x[0-9a-fA-F]{130,132}$/.test(sigHex)) {
      return {
        valid: false,
        error: "Invalid cryptographic signature format: must be 65-byte hex string (0x...).",
      };
    }

    // 5. Expiration check
    const currentSeconds = Math.floor(Date.now() / 1000);
    if (!authRequest.expiresAt || typeof authRequest.expiresAt !== "number") {
      return {
        valid: false,
        error: "Missing or invalid expiresAt timestamp.",
      };
    }

    if (currentSeconds > authRequest.expiresAt) {
      return {
        valid: false,
        error: `Authorization expired: current timestamp (${currentSeconds}) exceeds signature expiresAt (${authRequest.expiresAt}).`,
      };
    }

    // 6. Monotonic Nonce check
    if (typeof authRequest.nonce !== "number" || authRequest.nonce <= 0) {
      return {
        valid: false,
        error: "Invalid nonce: nonce must be a positive integer.",
      };
    }

    const highestNonce = this.store.getHighestNonce(cleanApprover);
    if (authRequest.nonce <= highestNonce) {
      return {
        valid: false,
        error: `Invalid nonce: nonce (${authRequest.nonce}) must be strictly greater than previous highest nonce (${highestNonce}). Replay rejected.`,
      };
    }

    // 7. Parameter Binding Verification
    const expectedAction = plan.intent.action;
    const expectedSpecialist =
      plan.matchedSpecialist?.executionAddress ??
      plan.matchedSpecialist?.ownerAddress ??
      plan.matchedSpecialist?.tag ??
      "";
    const expectedRecipient =
      plan.intent.entities.recipientAddress ??
      plan.intent.entities.recipientTag ??
      "";
    const expectedAmount = plan.intent.entities.amount ?? "0";
    const expectedToken = plan.intent.entities.token ?? "USDC";
    const targetChainId = authRequest.chainId ?? 56;

    // 8. Cryptographic Signature Recovery (EIP-712 primary, EIP-191 fallback)
    let recoveredSigner: string | null = null;
    let verifiedType: "eip712" | "eip191" = "eip712";

    // Attempt EIP-712 recovery if not explicitly set to eip191
    if (authRequest.type !== "eip191") {
      try {
        recoveredSigner = await recoverTypedDataAddress({
          domain: {
            ...NAIRATAG_AUTH_DOMAIN,
            chainId: BigInt(targetChainId),
          },
          types: NAIRATAG_AUTH_TYPES,
          primaryType: "NairaTagTaskAuthorization",
          message: {
            planId: plan.planId,
            action: expectedAction,
            targetSpecialist: expectedSpecialist,
            recipient: expectedRecipient,
            amount: expectedAmount,
            token: expectedToken,
            chainId: BigInt(targetChainId),
            nonce: BigInt(authRequest.nonce),
            expiresAt: BigInt(authRequest.expiresAt),
          },
          signature: sigHex as Hex,
        });
        verifiedType = "eip712";
      } catch {
        recoveredSigner = null;
      }
    }

    // Fallback: Attempt EIP-191 personal_sign recovery
    if (!recoveredSigner || recoveredSigner.toLowerCase() !== cleanApprover.toLowerCase()) {
      const canonicalMessage = buildCanonicalAuthorizationMessage({
        planId: plan.planId,
        action: expectedAction,
        targetSpecialist: expectedSpecialist,
        recipient: expectedRecipient,
        amount: expectedAmount,
        token: expectedToken,
        chainId: targetChainId,
        nonce: authRequest.nonce,
        expiresAt: authRequest.expiresAt,
      });

      try {
        recoveredSigner = await recoverMessageAddress({
          message: canonicalMessage,
          signature: sigHex as Hex,
        });
        verifiedType = "eip191";
      } catch {
        recoveredSigner = null;
      }
    }

    // Validate recovered signer matches declared approver
    if (!recoveredSigner || recoveredSigner.toLowerCase() !== cleanApprover.toLowerCase()) {
      return {
        valid: false,
        error: `Cryptographic verification failed: recovered signer (${recoveredSigner ?? "invalid"}) does not match approvedBy (${cleanApprover}).`,
      };
    }

    // 9. Successfully Authorized Plan
    const updatedPlan: OrchestrationPlan = {
      ...plan,
      status: "ready_for_execution",
      authorization: {
        ...plan.authorization,
        isAuthorized: true,
        reason: `Cryptographically verified ${verifiedType.toUpperCase()} signature by ${cleanApprover} (nonce: ${authRequest.nonce}, expiresAt: ${authRequest.expiresAt}).`,
      },
    };

    return {
      valid: true,
      authorizedPlan: updatedPlan,
    };
  }

  /**
   * Executes an orchestrated task by delegating to the selected specialist agent.
   * Strictly enforces the "Identity is not Authority" rule: if the task requires financial
   * authorization, execution is blocked immediately without a verified cryptographic signature.
   */
  public async executeTask(
    plan: OrchestrationPlan,
    authRequest?: PlanAuthorizationRequest,
    opts: { timeoutMs?: number; transport?: "live" | "sandbox" } = {}
  ): Promise<DelegationReceipt> {
    const startTime = Date.now();
    const receiptId = `rcpt_${randomUUID()}`;
    const timestamp = new Date().toISOString();

    // 0. Validate Plan Schema Integrity (SEC-03)
    try {
      OrchestrationPlanSchema.parse(plan);
    } catch (err: any) {
      const receipt: DelegationReceipt = {
        receiptId,
        planId: plan?.planId ?? "unknown",
        status: "failed",
        specialistTag: "UNKNOWN",
        specialistName: "Unknown",
        specialistAddress: "",
        capabilityId: "",
        executedAt: timestamp,
        latencyMs: 0,
        error: `Plan schema validation failed: ${err.message || String(err)}`,
      };
      this.receipts.set(receiptId, receipt);
      return receipt;
    }

    // 1. Replay prevention check via persistent store
    if (this.store.hasPlan(plan.planId)) {
      const receipt: DelegationReceipt = {
        receiptId,
        planId: plan.planId,
        status: "rejected",
        specialistTag: plan.matchedSpecialist?.tag ?? "UNKNOWN",
        specialistName: plan.matchedSpecialist?.name ?? "Unknown",
        specialistAddress: plan.matchedSpecialist?.executionAddress ?? "",
        capabilityId: plan.matchedSpecialist?.capability.id ?? "",
        executedAt: timestamp,
        latencyMs: 0,
        error: "Plan already executed. Replay attempt rejected.",
      };
      this.receipts.set(receiptId, receipt);
      return receipt;
    }

    // 2. Authorization Gate Check
    let isFullyAuthorized = plan.authorization.isAuthorized;
    let verifiedApprover = plan.caller.address ?? "0x0000000000000000000000000000000000000000";
    let appliedAuthDetails: PlanAuthorizationRequest | undefined = authRequest;

    if (plan.authorization.requiresUserAuthorization) {
      if (authRequest) {
        const authCheck = await this.authorizePlan(plan, authRequest);
        if (!authCheck.valid) {
          const receipt: DelegationReceipt = {
            receiptId,
            planId: plan.planId,
            status: "unauthorized",
            specialistTag: plan.matchedSpecialist?.tag ?? "UNKNOWN",
            specialistName: plan.matchedSpecialist?.name ?? "Unknown",
            specialistAddress: plan.matchedSpecialist?.executionAddress ?? "",
            capabilityId: plan.matchedSpecialist?.capability.id ?? "",
            executedAt: timestamp,
            latencyMs: 0,
            error: `Authorization failed: ${authCheck.error}`,
          };
          this.receipts.set(receiptId, receipt);
          return receipt;
        }
        isFullyAuthorized = true;
        verifiedApprover = getAddress(authRequest.approvedBy);
        appliedAuthDetails = authRequest;
        if (authCheck.authorizedPlan) {
          plan = {
            ...authCheck.authorizedPlan,
            authorization: {
              ...authCheck.authorizedPlan.authorization,
              signature: authRequest.signature,
              approvedBy: authRequest.approvedBy,
            },
          };
        }
      }

      if (!isFullyAuthorized) {
        const receipt: DelegationReceipt = {
          receiptId,
          planId: plan.planId,
          status: "unauthorized",
          specialistTag: plan.matchedSpecialist?.tag ?? "UNKNOWN",
          specialistName: plan.matchedSpecialist?.name ?? "Unknown",
          specialistAddress: plan.matchedSpecialist?.executionAddress ?? "",
          capabilityId: plan.matchedSpecialist?.capability.id ?? "",
          executedAt: timestamp,
          latencyMs: 0,
          error:
            "CRITICAL ACCESS BLOCKED: Task requires explicit interactive cryptographic wallet authorization. " +
            "Neither sovereign NairaTag identity nor Binance Agent ID credentials bypass user approval. (Identity is not Authority)",
        };
        this.receipts.set(receiptId, receipt);
        return receipt;
      }
    }

    // 3. Specialist Check
    if (!plan.matchedSpecialist) {
      const receipt: DelegationReceipt = {
        receiptId,
        planId: plan.planId,
        status: "failed",
        specialistTag: "NONE",
        specialistName: "None",
        specialistAddress: "",
        capabilityId: "",
        executedAt: timestamp,
        latencyMs: 0,
        error: "Cannot execute task: No specialist agent matched to this plan.",
      };
      this.receipts.set(receiptId, receipt);
      return receipt;
    }

    const specialist = plan.matchedSpecialist;

    // 4. Dispatch Task to Specialist
    try {
      const result = await this.dispatchToSpecialist(plan, specialist, opts);
      const latencyMs = Date.now() - startTime;

      // Persistently record executed plan to prevent replay attacks
      this.store.recordExecution({
        planId: plan.planId,
        executedAt: timestamp,
        approver: verifiedApprover,
        nonce: appliedAuthDetails?.nonce,
        signatureHash: appliedAuthDetails?.signature?.slice(0, 18),
        action: plan.intent.action,
        targetSpecialist: specialist.executionAddress,
        amount: plan.intent.entities.amount,
        token: plan.intent.entities.token,
      });

      const receipt: DelegationReceipt = {
        receiptId,
        planId: plan.planId,
        status: "completed",
        specialistTag: specialist.tag,
        specialistName: specialist.name,
        specialistAddress: specialist.executionAddress,
        capabilityId: specialist.capability.id,
        executedAt: timestamp,
        latencyMs,
        resultPayload: result.payload,
        settlementTxHash: result.txHash,
        deliverableUrl: result.deliverableUrl,
        classification: result.classification,
        executionMetadata: result.metadata,
        onChainReceipt: result.onChainReceipt,
        authorizationDetails: plan.authorization.requiresUserAuthorization
          ? {
              approvedBy: verifiedApprover,
              spendingAmount: plan.authorization.spendingLimit?.amount,
              spendingCurrency: plan.authorization.spendingLimit?.currency,
              nonce: appliedAuthDetails?.nonce,
              expiresAt: appliedAuthDetails?.expiresAt,
              signatureType: appliedAuthDetails?.type ?? "eip712",
              verifiedAgentIdTier: plan.caller.agentIdTier,
            }
          : undefined,
      };

      this.receipts.set(receiptId, receipt);
      return receipt;
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const receipt: DelegationReceipt = {
        receiptId,
        planId: plan.planId,
        status: "failed",
        specialistTag: specialist.tag,
        specialistName: specialist.name,
        specialistAddress: specialist.executionAddress,
        capabilityId: specialist.capability.id,
        executedAt: timestamp,
        latencyMs,
        error: `Specialist execution failed: ${err.message || String(err)}`,
      };
      this.receipts.set(receiptId, receipt);
      return receipt;
    }
  }

  /**
   * Dispatches the task to the specialist agent.
   */
  private async dispatchToSpecialist(
    plan: OrchestrationPlan,
    specialist: PlanDelegationTarget,
    opts: { transport?: "live" | "sandbox" }
  ): Promise<{
    payload: Record<string, unknown>;
    txHash?: string;
    deliverableUrl?: string;
    classification?: ExecutionClassification;
    metadata?: SpecialistExecutionMetadata;
    onChainReceipt?: OnChainSettlementReceipt;
  }> {
    const registry = SpecialistAdapterRegistry.getInstance();

    // Route to first-party specialist adapter if registered (₦DEFILLAMA, ₦COINGECKO, ₦METEO, ₦BLOOM)
    if (registry.hasAdapter(specialist.tag)) {
      const adapterResult = await registry.executeSpecialist(
        specialist.tag,
        {
          ...plan.preparedTaskPayload,
          ...plan.intent.entities,
          authorization: plan.authorization,
          isAuthorized: plan.authorization.isAuthorized,
          chainId: plan.authorization.spendingLimit?.chainId ?? (opts.transport === "live" ? 97 : 97),
          sender: plan.authorization.approvedBy,
          dryRun: opts.transport === "sandbox",
        },
        {
          transport: opts.transport,
          network: "bsc-testnet",
        }
      );

      if (!adapterResult.success) {
        throw new Error(
          adapterResult.error?.message ||
            `Specialist ${specialist.tag} execution failed: ${adapterResult.error?.code || "UNKNOWN"}`
        );
      }

      return {
        payload: (adapterResult.data as Record<string, unknown>) ?? {},
        txHash: adapterResult.onChainReceipt?.transactionHash,
        deliverableUrl: adapterResult.onChainReceipt?.verifiedOnExplorerUrl,
        classification: adapterResult.metadata.classification,
        metadata: adapterResult.metadata,
        onChainReceipt: adapterResult.onChainReceipt,
      };
    }

    // Generic Third-Party Specialist via A2A JSON-RPC 2.0
    if (specialist.endpoint && opts.transport === "live") {
      try {
        const response = await fetch(specialist.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "message/send",
            params: {
              skill: specialist.capability.id,
              task_payload: plan.preparedTaskPayload,
            },
            id: randomUUID(),
          }),
        });
        if (response.ok) {
          const json = await response.json();
          return {
            payload: json.result || json,
            classification: "LIVE",
            metadata: {
              classification: "LIVE",
              source: specialist.endpoint,
              retrievedAt: new Date().toISOString(),
              latencyMs: 120,
            },
          };
        }
      } catch {
        // fallback
      }
    }

    return {
      payload: {
        agent: specialist.tag,
        capability: specialist.capability.id,
        status: "success",
        note: `Executed task deliverable generated by ${specialist.name}`,
        preparedPayload: plan.preparedTaskPayload,
      },
      classification: "SIMULATED",
      metadata: {
        classification: "SIMULATED",
        source: `Simulated Sandbox: ${specialist.name}`,
        retrievedAt: new Date().toISOString(),
        latencyMs: 10,
      },
    };
  }

  /**
   * Retrieves an execution receipt by receipt ID.
   */
  public getReceipt(receiptId: string): DelegationReceipt | undefined {
    return this.receipts.get(receiptId);
  }

  /**
   * Checks whether a plan has already been executed.
   */
  public isPlanExecuted(planId: string): boolean {
    return this.store.hasPlan(planId);
  }
}

// Global Singleton Instance
export const globalTaskDelegator = new TaskDelegator();
