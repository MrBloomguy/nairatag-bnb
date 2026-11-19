/**
 * Binance Skill Router (Phase 3)
 * ===============================
 * Enforces parameter schema validation, permission checks, and the
 * interactive user consent gate ("Identity is not Authority")
 * prior to dispatching skills to their handlers.
 */

import { SkillRegistry, globalSkillRegistry } from "./skillRegistry.js";
import { SkillExecutionContext, SkillExecutionResult } from "./types.js";

export class SkillRouter {
  private registry: SkillRegistry;

  constructor(registry: SkillRegistry = globalSkillRegistry) {
    this.registry = registry;
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

    // 3. Permission & Interactive User Consent Gate
    // "Identity is not Authority": Financial skills strictly require verified cryptographic consent
    if (skill.requiresUserConsent) {
      if (!context.authorization || !context.authorization.isAuthorized) {
        return {
          success: false,
          skillId: skill.id,
          classification: "SIMULATED",
          metadata: {
            source: "Binance Skill Authorization Gate",
            timestamp: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: "UNAUTHORIZED_FINANCIAL_ACTION",
            message: `Skill '${skill.id}' is a financial execution capability and strictly requires interactive user cryptographic authorization (EIP-712 or EIP-191).`,
          },
        };
      }

      // Check signature format if provided
      if (context.authorization.signature) {
        const sig = context.authorization.signature.trim();
        if (!/^0x[0-9a-fA-F]{130,132}$/.test(sig)) {
          return {
            success: false,
            skillId: skill.id,
            classification: "SIMULATED",
            metadata: {
              source: "Binance Skill Authorization Gate",
              timestamp: new Date().toISOString(),
              latencyMs: Date.now() - startTime,
            },
            error: {
              code: "INVALID_SIGNATURE_FORMAT",
              message: "Authorization signature must be a 65-byte hex string (0x...).",
            },
          };
        }
      }
    }

    // 4. Dispatch to Skill Handler
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
