/**
 * Read-only chain tools exposed to this agent's LLM (AI SDK `tool` wrap).
 *
 * Each entry in `LLM_READ_TOOLS` is a function from
 * `@bnbagent/studio-runtime/tools` wrapped as a Vercel AI SDK tool. The LLM
 * may call any tool in this set while producing the deliverable (the
 * `notify_funded` work step); the `description` is what the LLM sees.
 *
 * You own this file — edit `LLM_READ_TOOLS` to control exactly what your
 * agent can read on-chain. Entries for features your project doesn't use are
 * commented out by default; uncomment after you've added the dependency to
 * `studio.toml`.
 *
 * **All tools are read-only** by the studio definition: no on-chain state
 * change, no transferable authority, no transaction signing, no EIP-712
 * typed-data signing. The agent IS the sole on-chain signer, but ALL of its
 * signing — quote-sign, submitResult, settle, plus the automatic
 * budget-gated Pieverse LLM-credit auto-renew inside `buildModel()` — lives
 * in `signing.ts` / `model.ts` as FIXED entrypoint code and is NEVER a tool
 * the LLM can invoke. The LLM only produces work text after a job is
 * verified funded; it can never price, sign, spend, or mutate chain state.
 * Keep this set read-only.
 *
 * (`pieverseUsage` is the one exception in the underlying module: it does a
 * SIWE EIP-191 personal_sign, domain-locked to llm.pieverse.io, no on-chain
 * effect. It is commented out below.)
 */

import * as cr from "@bnbagent/studio-runtime/tools";
import { loadStudioToml } from "@bnbagent/studio-runtime/config";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { READ_TOOL_CATALOG } from "./readToolCatalog.js";
import { verifyAgentId } from "./services/agentIdVerifier.js";
import { globalSpecialistDirectory } from "./services/specialistDirectory.js";
import {
  globalNairaTagOrchestrator,
  OrchestrationPlanSchema,
} from "./services/orchestratorCore.js";
import { globalTaskDelegator } from "./services/taskDelegator.js";
import {
  globalSkillRegistry,
  globalSkillRouter,
} from "./services/skills/index.js";

/**
 * The project-wide default network (`[network].default`) — tool calls that
 * omit `network` fall back to it, never to a hardcoded name.
 */
function defaultNetwork(): string {
  try {
    const cfg = loadStudioToml();
    return String(
      ((cfg.network ?? {}) as Record<string, unknown>).default ?? "bsc-testnet",
    );
  } catch {
    return "bsc-testnet";
  }
}

export const LLM_READ_TOOLS: ToolSet = {
  // --- Wallet & chain basics ---
  wallet_info: tool({
    description: READ_TOOL_CATALOG.wallet_info.description,
    inputSchema: z.object(READ_TOOL_CATALOG.wallet_info.inputSchema),
    execute: async () => cr.walletInfo(),
  }),
  balance_native: tool({
    description: READ_TOOL_CATALOG.balance_native.description,
    inputSchema: z.object(READ_TOOL_CATALOG.balance_native.inputSchema),
    execute: async ({ address, network }) =>
      cr.balanceNative(address ?? null, network ?? defaultNetwork()),
  }),
  balance_u: tool({
    // requires [u_token] in studio.toml
    description: READ_TOOL_CATALOG.balance_u.description,
    inputSchema: z.object(READ_TOOL_CATALOG.balance_u.inputSchema),
    execute: async ({ address, network }) =>
      cr.balanceU(address ?? null, network ?? defaultNetwork()),
  }),
  network_info: tool({
    description: READ_TOOL_CATALOG.network_info.description,
    inputSchema: z.object(READ_TOOL_CATALOG.network_info.inputSchema),
    execute: async ({ network }) => cr.networkInfo(network ?? defaultNetwork()),
  }),
  tx_status: tool({
    description: READ_TOOL_CATALOG.tx_status.description,
    inputSchema: z.object(READ_TOOL_CATALOG.tx_status.inputSchema),
    execute: async ({ tx_hash, network }) =>
      cr.txStatus(tx_hash, network ?? defaultNetwork()),
  }),

  // --- LLM provider ---
  // pieverse_usage: tool({
  //   // SIWE personal_sign; requires [llm.provider=pieverse-llm]
  //   description: "Pieverse LLM usage/credit summary for the last N days.",
  //   inputSchema: z.object({ days: z.number().int().optional() }),
  //   execute: async ({ days }) => cr.pieverseUsage(days ?? 7),
  // }),

  // --- ERC-8004 identity (read-only lookups the LLM may want for context) ---
  agent_info: tool({
    // requires [erc8004] in studio.toml
    description: READ_TOOL_CATALOG.agent_info.description,
    inputSchema: z.object(READ_TOOL_CATALOG.agent_info.inputSchema),
    execute: async ({ agent_id, network }) =>
      cr.agentInfo(agent_id, network ?? defaultNetwork()),
  }),
  agent_by_address: tool({
    // requires [erc8004] in studio.toml
    description: READ_TOOL_CATALOG.agent_by_address.description,
    inputSchema: z.object(READ_TOOL_CATALOG.agent_by_address.inputSchema),
    execute: async ({ address, network }) =>
      cr.agentByAddress(address, network ?? defaultNetwork()),
  }),

  // --- ERC-8183 jobs (READ-ONLY status/list — writes live in signing.ts) ---
  job_status: tool({
    // requires [erc8183] in studio.toml
    description: READ_TOOL_CATALOG.job_status.description,
    inputSchema: z.object(READ_TOOL_CATALOG.job_status.inputSchema),
    execute: async ({ job_id, network }) =>
      cr.jobStatus(job_id, network ?? defaultNetwork()),
  }),
  job_list: tool({
    // requires [erc8183] in studio.toml
    description: READ_TOOL_CATALOG.job_list.description,
    inputSchema: z.object(READ_TOOL_CATALOG.job_list.inputSchema),
    execute: async ({ limit, mine, network }) =>
      cr.jobList({ limit, mine, network: network ?? defaultNetwork() }),
  }),

  // --- Binance / SPACE ID Agent ID Verification (Identity is not Authority) ---
  verify_agent_id: tool({
    description: READ_TOOL_CATALOG.verify_agent_id.description,
    inputSchema: z.object(READ_TOOL_CATALOG.verify_agent_id.inputSchema),
    execute: async ({ address, network }) => {
      let targetAddress = address;
      if (!targetAddress) {
        try {
          const w = (await cr.walletInfo()) as { address?: string } | undefined;
          targetAddress = w?.address;
        } catch {
          // fallback if wallet info unavailable
        }
      }
      return verifyAgentId({
        address: targetAddress ?? "",
        network: (network as "bsc-mainnet" | "bsc-testnet") ?? "bsc-mainnet",
      });
    },
  }),

  // --- NairaTag Open Specialist Agent Directory & Discovery ---
  discover_agents: tool({
    description: READ_TOOL_CATALOG.discover_agents.description,
    inputSchema: z.object(READ_TOOL_CATALOG.discover_agents.inputSchema),
    execute: async ({ category, capability, keyword, require_agent_id }) => {
      return globalSpecialistDirectory.discoverAgents({
        category,
        capability,
        keyword,
        requireAgentId: require_agent_id,
      });
    },
  }),

  get_agent_profile: tool({
    description: READ_TOOL_CATALOG.get_agent_profile.description,
    inputSchema: z.object(READ_TOOL_CATALOG.get_agent_profile.inputSchema),
    execute: async ({ tag_or_address }) => {
      if (tag_or_address.startsWith("0x") || tag_or_address.startsWith("0X")) {
        return (
          (await globalSpecialistDirectory.getAgentByAddress(tag_or_address)) ?? {
            error: `No agent registered for address ${tag_or_address}`,
          }
        );
      }
      return (
        (await globalSpecialistDirectory.getAgentByTag(tag_or_address)) ?? {
          error: `No agent registered for tag ${tag_or_address}`,
        }
      );
    },
  }),

  // --- NairaTag Central Orchestration & Planning (₦NAIRATAG) ---
  plan_orchestration: tool({
    description: READ_TOOL_CATALOG.plan_orchestration.description,
    inputSchema: z.object(READ_TOOL_CATALOG.plan_orchestration.inputSchema),
    execute: async ({ prompt, caller_tag, caller_address }) => {
      return globalNairaTagOrchestrator.planTask(prompt, {
        tag: caller_tag,
        address: caller_address,
      });
    },
  }),

  execute_orchestration_plan: tool({
    description: READ_TOOL_CATALOG.execute_orchestration_plan.description,
    inputSchema: z.object(READ_TOOL_CATALOG.execute_orchestration_plan.inputSchema),
    execute: async ({
      plan_json,
      approver_address,
      signature,
      nonce,
      expires_at,
      chain_id,
      auth_type,
      user_affirmation,
    }) => {
      let rawPlan;
      try {
        rawPlan = JSON.parse(plan_json);
      } catch (e: any) {
        return { error: `Invalid plan_json: failed to parse JSON: ${e.message}` };
      }

      let plan;
      try {
        plan = OrchestrationPlanSchema.parse(rawPlan);
      } catch (e: any) {
        return { error: `Invalid plan schema (SEC-03): ${e.message}` };
      }

      const authRequest =
        approver_address && signature && typeof nonce === "number" && typeof expires_at === "number"
          ? {
              planId: plan.planId,
              approvedBy: approver_address,
              signature,
              nonce,
              expiresAt: expires_at,
              chainId: chain_id,
              type: auth_type,
              userAffirmation: user_affirmation,
            }
          : undefined;

      return globalTaskDelegator.executeTask(plan, authRequest);
    },
  }),

  // --- Binance Skills Hub & Agentic Wallet Capabilities (Phase 3) ---
  discover_binance_skills: tool({
    description: READ_TOOL_CATALOG.discover_binance_skills.description,
    inputSchema: z.object(READ_TOOL_CATALOG.discover_binance_skills.inputSchema),
    execute: async ({ category, access_level, query }) => {
      if (query) {
        return globalSkillRegistry.searchSkills(query).map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          category: s.category,
          accessLevel: s.accessLevel,
          requiresUserConsent: s.requiresUserConsent,
        }));
      }
      return globalSkillRegistry
        .listSkills({
          category: category as any,
          accessLevel: access_level as any,
        })
        .map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          category: s.category,
          accessLevel: s.accessLevel,
          requiresUserConsent: s.requiresUserConsent,
        }));
    },
  }),

  execute_binance_skill: tool({
    description: READ_TOOL_CATALOG.execute_binance_skill.description,
    inputSchema: z.object(READ_TOOL_CATALOG.execute_binance_skill.inputSchema),
    execute: async ({
      skill_id,
      params_json,
      approver_address,
      signature,
      nonce,
      expires_at,
      chain_id,
      auth_type,
    }) => {
      let params;
      try {
        params = JSON.parse(params_json);
      } catch (e: any) {
        return {
          success: false,
          skillId: skill_id,
          error: {
            code: "INVALID_JSON",
            message: `Failed to parse params_json: ${e.message}`,
          },
        };
      }

      const authProof =
        approver_address && signature && typeof nonce === "number" && typeof expires_at === "number"
          ? {
              approvedBy: approver_address,
              signature,
              nonce,
              expiresAt: expires_at,
              chainId: chain_id,
              type: auth_type,
            }
          : undefined;

      const context = {
        callerAddress: approver_address,
        authProof,
      };

      return globalSkillRouter.executeSkill(skill_id, params, context);
    },
  }),
  // job_count: ...        // network-wide stat — usually noise

  // --- Advanced / footguns (commented by default) ---
  // contract_call_view: ...  // accepts any ABI — LLM-callable footgun
  // block_info: ...
  // wallet_list: ...          // multi-wallet management — dev concern
  // wallet_address: ...       // alias of wallet_info
};
