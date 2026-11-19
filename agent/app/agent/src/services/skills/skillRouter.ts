/**
 * Binance Skill Router (Phase 3 Remediation)
 * ==========================================
 * Enforces parameter schema validation, central cryptographic consent verification,
 * and durable replay protection prior to dispatching skills to their handlers.
 *
 * Strict Requirement 1:
 * Never treat `isAuthorized: true`, a non-empty signature, or a matching address
 * as proof of authorization. Central cryptographic verification is strictly enforced.
 */

import { SkillRegistry, globalSkillRegistry } from "./skillRegistry.js";
import { SkillExecutionContext, SkillExecutionResult } from "./types.js";
import {
  SkillAuthorizationVerifier,
  globalSkillAuthVerifier,
  VerifySkillAuthRequest,
} from "./skillAuthorizationVerifier.js";

export class SkillRouter {
  private registry: SkillRegistry;
  private authVerifier: SkillAuthorizationVerifier;

  constructor(
    registry: SkillRegistry = globalSkillRegistry,
    authVerifier: SkillAuthorizationVerifier = globalSkillAuthVerifier
  ) {
    this.registry = registry;
    this.authVerifier = authVerifier;
  }

  /**
   * Executes a registered skill through the validation and authorization pipeline.
   */
  public async executeSkill(
    skillId: string,
    params: unknown,
    context: SkillExecutionContext = {}
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const cleanId = skillId.trim().toLowerCase();
    const skill = this.registry.getSkill(cleanId);

    // 1. Skill Existence Check
    if (!skill) {
      return {
        success: false,
        skillId: cleanId,
        classification: "SIMULATED",
        metadata: {
          source: "Binance Skill Router",
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
        error: {
          code: "SKILL_NOT_FOUND",
          message: `Skill '${skillId}' is not registered in the Binance Skill Registry.`,
        },
      };
    }

    // 2. Input Schema Validation
    const parsed = skill.inputSchema.safeParse(params);
    if (!parsed.success) {
      return {
        success: false,
        skillId: skill.id,
        classification: "SIMULATED",
        metadata: {
          source: "Binance Skill Router",
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
        error: {
          code: "INVALID_PARAMETERS",
          message: `Parameter validation failed for skill '${skill.id}': ${parsed.error.message}`,
          details: parsed.error.issues,
        },
      };
    }

    // 3. Central Cryptographic Consent & Verification Gate
    // "Identity is not Authority": Financial skills strictly require verified cryptographic consent
    if (skill.requiresUserConsent) {
      const data = parsed.data as any;

      // 3a. Mainnet Settlement Lock (Policy Enforced)
      if (data.chainId === 56 || data.network === "bsc-mainnet" || data.network === "mainnet" || data.network === "bsc") {
        return {
          success: false,
          skillId: skill.id,
          classification: "SIMULATED",
          metadata: {
            source: "Binance Skill Central Mainnet Lock",
            timestamp: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: "MAINNET_SETTLEMENT_DISABLED",
            message:
              "CRITICAL: BNB Mainnet live settlement is strictly disabled by protocol policy. Only BSC Testnet (Chain ID 97) execution is permitted.",
          },
        };
      }

      // 3b. Explicit User Confirmation Check
      if (data.confirmationAccepted === false && !context.userConfirmationAccepted) {
        return {
          success: false,
          skillId: skill.id,
          classification: "SIMULATED",
          metadata: {
            source: "Binance Skill Central User Confirmation Gate",
            timestamp: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: "CONFIRMATION_REQUIRED",
            message: `User confirmation required. Please review and confirm the transfer: send ${data.amount} ${data.token} to ${data.recipient}.`,
          },
        };
      }

      const authReq: VerifySkillAuthRequest = {
        skillId: skill.id,
        sender: data.sender ?? context.callerAddress ?? "",
        recipient: data.recipient ?? "",
        amount: data.amount ?? "",
        token: data.token ?? "",
        chainId: data.chainId ?? 97,
        authProof: context.authProof,
      };

      const authCheck = await this.authVerifier.verifyAuthorization(authReq);
      if (!authCheck.valid) {
        return {
          success: false,
          skillId: skill.id,
          classification: "SIMULATED",
          metadata: {
            source: "Binance Skill Central Authorization Gate",
            timestamp: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: authCheck.code ?? "UNAUTHORIZED_FINANCIAL_ACTION",
            message: authCheck.error ?? "Cryptographic authorization verification failed.",
          },
        };
      }

      // Dispatch to skill handler
      try {
        const result = await skill.handler(parsed.data, context);
        if (result.success && result.classification === "LIVE") {
          // Durably record execution to prevent replay
          this.authVerifier.recordExecution(authReq);
        }
        return result;
      } catch (err: any) {
        return {
          success: false,
          skillId: skill.id,
          classification: "SIMULATED",
          metadata: {
            source: "Binance Skill Router",
            timestamp: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: "SKILL_EXECUTION_ERROR",
            message: `Error executing skill '${skill.id}': ${err.message || String(err)}`,
          },
        };
      }
    }

    // 4. Read-Only Skills: Dispatch directly
    try {
      return await skill.handler(parsed.data, context);
    } catch (err: any) {
      return {
        success: false,
        skillId: skill.id,
        classification: "SIMULATED",
        metadata: {
          source: "Binance Skill Router",
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
        error: {
          code: "SKILL_EXECUTION_ERROR",
          message: `Error executing skill '${skill.id}': ${err.message || String(err)}`,
        },
      };
    }
  }
}

export const globalSkillRouter = new SkillRouter();
