/**
 * Central Skill Authorization Verifier (Phase 3 Remediation)
 * ==========================================================
 * Shared cryptographic consent verifier for all financial skills.
 *
 * GOVERNANCE RULES:
 * 1. "Identity is not Authority": Financial actions CANNOT execute autonomously.
 *    They strictly require interactive user consent proven by an EIP-712 or EIP-191
 *    cryptographic signature from the authorized wallet.
 * 2. Cryptographic Parameter Binding: Signatures are strictly bound to:
 *    skillId, sender, recipient, amount, token, chainId, monotonic nonce, and expiry.
 *    Any altered parameter, expired timestamp, or reused nonce is rejected.
 * 3. Never trust a boolean flag (`isAuthorized: true`), a non-empty signature string,
 *    or a matching address alone as proof of authorization. Signer recovery is mandatory.
 * 4. Durable Replay Protection: Nonce monotonicity and execution keys are checked
 *    against DurableExecutionStore.
 */

import {
  getAddress,
  isAddress,
  recoverMessageAddress,
  recoverTypedDataAddress,
  type Hex,
} from "viem";
import {
  DurableExecutionStore,
  globalExecutionStore,
} from "../durableExecutionStore.js";

// ==========================================
// EIP-712 Typed Data Specifications
// ==========================================

export const SKILL_AUTH_DOMAIN_NAME = "NairaTag Skill Authorization";
export const SKILL_AUTH_VERSION = "1";

export const BINANCE_SKILL_AUTH_TYPES = {
  NairaTagSkillAuthorization: [
    { name: "skillId", type: "string" },
    { name: "sender", type: "address" },
    { name: "recipient", type: "string" },
    { name: "amount", type: "string" },
    { name: "token", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

/**
 * Builds canonical plaintext message for EIP-191 personal_sign fallback.
 */
export function buildCanonicalSkillAuthMessage(params: {
  skillId: string;
  sender: string;
  recipient: string;
  amount: string;
  token: string;
  chainId: number;
  nonce: number;
  expiresAt: number;
}): string {
  return [
    "NairaTag Skill Authorization",
    `Skill ID: ${params.skillId}`,
    `Sender: ${params.sender}`,
    `Recipient: ${params.recipient}`,
    `Amount: ${params.amount} ${params.token}`,
    `Chain ID: ${params.chainId}`,
    `Nonce: ${params.nonce}`,
    `Expires: ${params.expiresAt}`,
  ].join("\n");
}

export interface SkillAuthorizationProof {
  approvedBy: string; // EVM address of approving user / wallet
  signature: `0x${string}` | string; // 65-byte hex cryptographic signature
  nonce: number; // Monotonic per-approver integer
  expiresAt: number; // Unix timestamp in seconds
  chainId?: number; // Target chain ID (default: 97)
  type?: "eip712" | "eip191";
}

export interface VerifySkillAuthRequest {
  skillId: string;
  sender: string;
  recipient: string;
  amount: string;
  token: string;
  chainId: number;
  authProof?: SkillAuthorizationProof;
}

export interface SkillAuthVerificationResult {
  valid: boolean;
  recoveredSigner?: string;
  verifiedType?: "eip712" | "eip191";
  code?: string;
  error?: string;
}

/**
 * Central Cryptographic Authorization Verifier
 */
export class SkillAuthorizationVerifier {
  private store: DurableExecutionStore;

  constructor(store: DurableExecutionStore = globalExecutionStore) {
    this.store = store;
  }

  /**
   * Cryptographically verifies user authorization for a planned financial skill.
   */
  public async verifyAuthorization(
    req: VerifySkillAuthRequest
  ): Promise<SkillAuthVerificationResult> {
    const { authProof } = req;

    // 1. Proof Presence Check
    if (!authProof) {
      return {
        valid: false,
        code: "UNAUTHORIZED_FINANCIAL_ACTION",
        error: "Missing authorization proof: financial execution strictly requires verified user cryptographic consent.",
      };
    }

    // 2. Approver Address Validation
    if (!authProof.approvedBy || !isAddress(authProof.approvedBy, { strict: false })) {
      return {
        valid: false,
        code: "INVALID_APPROVER_ADDRESS",
        error: `Invalid approver address: ${authProof.approvedBy}`,
      };
    }
    const cleanApprover = getAddress(authProof.approvedBy);

    // 3. Sender Matching Check
    if (!req.sender || !isAddress(req.sender, { strict: false })) {
      return {
        valid: false,
        code: "INVALID_SENDER_ADDRESS",
        error: `Invalid sender address: ${req.sender}`,
      };
    }
    const cleanSender = getAddress(req.sender);

    if (cleanApprover.toLowerCase() !== cleanSender.toLowerCase()) {
      return {
        valid: false,
        code: "WALLET_AUTHORIZATION_MISMATCH",
        error: `Approver address (${cleanApprover}) does not match sender address (${cleanSender}).`,
      };
    }

    // 4. Signature Format Validation
    if (!authProof.signature || typeof authProof.signature !== "string") {
      return {
        valid: false,
        code: "MISSING_SIGNATURE",
        error: "Missing cryptographic signature.",
      };
    }
    const sigHex = authProof.signature.trim();
    if (!/^0x[0-9a-fA-F]{130,132}$/.test(sigHex)) {
      return {
        valid: false,
        code: "INVALID_SIGNATURE_FORMAT",
        error: "Invalid cryptographic signature format: must be a 65-byte hex string (0x...).",
      };
    }

    // 5. Expiration Check
    const currentSeconds = Math.floor(Date.now() / 1000);
    if (!authProof.expiresAt || typeof authProof.expiresAt !== "number" || authProof.expiresAt <= 0) {
      return {
        valid: false,
        code: "INVALID_EXPIRATION",
        error: "Missing or invalid expiresAt timestamp.",
      };
    }
    if (currentSeconds > authProof.expiresAt) {
      return {
        valid: false,
        code: "AUTHORIZATION_EXPIRED",
        error: `Authorization expired: current timestamp (${currentSeconds}) exceeds signature expiresAt (${authProof.expiresAt}).`,
      };
    }

    // 6. Monotonic Nonce & Replay Prevention
    if (typeof authProof.nonce !== "number" || authProof.nonce <= 0) {
      return {
        valid: false,
        code: "INVALID_NONCE",
        error: "Invalid nonce: nonce must be a positive integer.",
      };
    }
    const highestNonce = this.store.getHighestNonce(cleanApprover);
    if (authProof.nonce <= highestNonce) {
      return {
        valid: false,
        code: "NONCE_REPLAY_DETECTED",
        error: `Nonce replay detected: nonce ${authProof.nonce} has already been used or is lower than highest recorded nonce (${highestNonce}) for ${cleanApprover}.`,
      };
    }

    // 7. Duplicate Execution Key Check
    const executionKey = `skill:${req.skillId}:${cleanApprover}:${authProof.nonce}`;
    if (this.store.hasPlan(executionKey)) {
      return {
        valid: false,
        code: "DUPLICATE_EXECUTION",
        error: `Duplicate execution detected: authorization key '${executionKey}' has already been processed.`,
      };
    }

    // 8. Cryptographic Signer Recovery
    const expectedChainId = req.chainId;
    if (authProof.chainId !== undefined && authProof.chainId !== expectedChainId) {
      return {
        valid: false,
        code: "CHAIN_ID_MISMATCH",
        error: `Chain ID mismatch: signature authorized chain ${authProof.chainId}, but execution target is ${expectedChainId}.`,
      };
    }

    let recoveredSigner: string | null = null;
    let verifiedType: "eip712" | "eip191" = "eip712";

    // Attempt EIP-712 recovery
    if (authProof.type !== "eip191") {
      try {
        const domain = {
          name: SKILL_AUTH_DOMAIN_NAME,
          version: SKILL_AUTH_VERSION,
          chainId: expectedChainId,
        } as const;

        const message = {
          skillId: req.skillId,
          sender: cleanSender,
          recipient: req.recipient,
          amount: req.amount,
          token: req.token,
          chainId: BigInt(expectedChainId),
          nonce: BigInt(authProof.nonce),
          expiresAt: BigInt(authProof.expiresAt),
        };

        recoveredSigner = await recoverTypedDataAddress({
          domain,
          types: BINANCE_SKILL_AUTH_TYPES,
          primaryType: "NairaTagSkillAuthorization",
          message,
          signature: sigHex as Hex,
        });
        verifiedType = "eip712";
      } catch {
        recoveredSigner = null;
      }
    }

    // Fallback to EIP-191 personal_sign
    if (!recoveredSigner || recoveredSigner.toLowerCase() !== cleanApprover.toLowerCase()) {
      const canonicalMessage = buildCanonicalSkillAuthMessage({
        skillId: req.skillId,
        sender: cleanSender,
        recipient: req.recipient,
        amount: req.amount,
        token: req.token,
        chainId: expectedChainId,
        nonce: authProof.nonce,
        expiresAt: authProof.expiresAt,
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
        code: "CRYPTOGRAPHIC_SIGNATURE_INVALID",
        error: `Cryptographic verification failed: recovered signer (${recoveredSigner ?? "invalid"}) does not match approvedBy (${cleanApprover}). Parameter tampering or forgery detected.`,
      };
    }

    return {
      valid: true,
      recoveredSigner: cleanApprover,
      verifiedType,
    };
  }

  /**
   * Persistently records an executed skill authorization to prevent replay.
   */
  public recordExecution(req: VerifySkillAuthRequest): void {
    const { authProof } = req;
    if (!authProof) return;
    const cleanApprover = getAddress(authProof.approvedBy);
    const executionKey = `skill:${req.skillId}:${cleanApprover}:${authProof.nonce}`;

    this.store.recordExecution({
      planId: executionKey,
      executedAt: new Date().toISOString(),
      approver: cleanApprover,
      nonce: authProof.nonce,
      signatureHash: authProof.signature.slice(0, 18),
      action: req.skillId,
      targetSpecialist: "binance_agentic_wallet",
      amount: req.amount,
      token: req.token,
    });
  }
}

export const globalSkillAuthVerifier = new SkillAuthorizationVerifier();
