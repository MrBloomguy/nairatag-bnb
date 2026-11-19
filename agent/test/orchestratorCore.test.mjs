/**
 * Test Suite: NairaTag Orchestrator Core & Specialist Discovery (Step 8)
 *
 * Verifies:
 * 1. Natural Language Intent Parsing & Entity Extraction.
 * 2. Caller Identity Resolution & Binance Agent ID Tier Verification.
 * 3. Semantic Specialist Discovery & Capability Matching (₦BLOOM, ₦DEFILLAMA, ₦METEO, ₦COINGECKO).
 * 4. Dynamic Third-Party Specialist Matching via Open Directory.
 * 5. Strict Enforcement of "Identity is not Authority" (zero automated spend/fund movements).
 * 6. Ambiguous / Unsupported Request Handling with Polite Clarifications.
 * 7. End-to-End Orchestrator Tool Execution (plan_orchestration).
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  NairaTagOrchestrator,
  globalNairaTagOrchestrator,
} from "../app/agent/src/services/orchestratorCore.ts";
import {
  SpecialistAgentDirectory,
  REFERENCE_ECOSYSTEM_AGENTS,
} from "../app/agent/src/services/specialistDirectory.ts";
import { LLM_READ_TOOLS } from "../app/agent/src/tools.ts";

test("1. Natural Language Intent Parsing & Entity Extraction", async (t) => {
  const orchestrator = new NairaTagOrchestrator();

  // Test Case A: Payment settlement intent
  const payIntent = orchestrator.parseIntents("Send 5.5 USDC to ₦ALICE");
  assert.equal(payIntent.category, "payments.settlement");
  assert.equal(payIntent.action, "send_payment");
  assert.equal(payIntent.requiresSpecialist, true);
  assert.equal(payIntent.requiresFinancialAuthorization, true);
  assert.equal(payIntent.entities.amount, "5.5");
  assert.equal(payIntent.entities.token, "USDC");
  assert.equal(payIntent.entities.recipientTag, "₦ALICE");

  // Test Case B: Escrow lock intent
  const escrowIntent = orchestrator.parseIntents("Lock 25 USDC escrow for deliverable");
  assert.equal(escrowIntent.category, "payments.escrow");
  assert.equal(escrowIntent.action, "lock_escrow");
  assert.equal(escrowIntent.requiresFinancialAuthorization, true);
  assert.equal(escrowIntent.entities.amount, "25");
  assert.equal(escrowIntent.entities.token, "USDC");

  // Test Case C: Escrow release intent
  const releaseIntent = orchestrator.parseIntents("Release bounty 3 to ₦BLOOM");
  assert.equal(releaseIntent.category, "payments.escrow");
  assert.equal(releaseIntent.action, "release_bounty");
  assert.equal(releaseIntent.requiresFinancialAuthorization, true);
  assert.equal(releaseIntent.entities.recipientTag, "₦BLOOM");

  // Test Case D: DeFi TVL query
  const defiIntent = orchestrator.parseIntents("What is PancakeSwap TVL on BNB Chain?");
  assert.equal(defiIntent.category, "defi.tvl");
  assert.equal(defiIntent.action, "query_tvl");
  assert.equal(defiIntent.requiresSpecialist, true);
  assert.equal(defiIntent.requiresFinancialAuthorization, false);
  assert.equal(defiIntent.entities.protocol, "pancakeswap");

  // Test Case E: Market price query
  const priceIntent = orchestrator.parseIntents("What is the price of BNB in USDC?");
  assert.equal(priceIntent.category, "market.price");
  assert.equal(priceIntent.action, "query_price");
  assert.equal(priceIntent.requiresSpecialist, true);
  assert.equal(priceIntent.requiresFinancialAuthorization, false);

  // Test Case F: Weather logistics query
  const weatherIntent = orchestrator.parseIntents("Check weather in Lagos for delivery transit");
  assert.equal(weatherIntent.category, "logistics.weather");
  assert.equal(weatherIntent.action, "query_weather");
  assert.equal(weatherIntent.requiresSpecialist, true);
  assert.equal(weatherIntent.requiresFinancialAuthorization, false);
  assert.equal(weatherIntent.entities.location, "Lagos");

  // Test Case G: Identity lookup
  const identityIntent = orchestrator.parseIntents("Who owns ₦BLOOM?");
  assert.equal(identityIntent.category, "identity.lookup");
  assert.equal(identityIntent.action, "inspect_identity");
  assert.equal(identityIntent.requiresFinancialAuthorization, false);

  // Test Case H: Ambiguous request
  const ambiguousIntent = orchestrator.parseIntents("hey");
  assert.equal(ambiguousIntent.category, "ambiguous");
  assert.equal(ambiguousIntent.confidence < 0.5, true);
});

test("2. Caller Identity & Binance Agent ID Credential Resolution", async (t) => {
  const orchestrator = new NairaTagOrchestrator();

  // Anonymous caller
  const anonCaller = await orchestrator.resolveCaller();
  assert.equal(anonCaller.agentIdTier, "unverified");
  assert.equal(anonCaller.isAgentIdHolder, false);

  // Known ecosystem tag caller (₦BLOOM)
  const bloomCaller = await orchestrator.resolveCaller({ tag: "₦BLOOM" });
  assert.equal(bloomCaller.tag, "₦BLOOM");
  assert.equal(bloomCaller.canonicalName, "bloom");
  assert.equal(bloomCaller.address?.toLowerCase(), "0x7c26b4e55b23ef5de44a2b957cf395acb4c2af26");

  // Caller with unverified EVM address
  const unverifiedCaller = await orchestrator.resolveCaller({
    address: "0x0000000000000000000000000000000000000001",
  });
  assert.equal(unverifiedCaller.address, "0x0000000000000000000000000000000000000001");
  assert.equal(unverifiedCaller.isAgentIdHolder, false);
});

test("3. Semantic Specialist Discovery & Workflow Planning", async (t) => {
  const orchestrator = new NairaTagOrchestrator();

  // Plan 1: Payment Settlement -> ₦BLOOM
  const plan1 = await orchestrator.planTask("Send 10 USDC to ₦ALICE");
  assert.equal(plan1.status, "ready_for_review");
  assert.equal(plan1.intent.category, "payments.settlement");
  assert.ok(plan1.matchedSpecialist, "Matched specialist must exist");
  assert.equal(plan1.matchedSpecialist.tag, "₦BLOOM");
  assert.equal(plan1.matchedSpecialist.capability.id, "settlement.usdc");
  assert.equal(plan1.preparedTaskPayload?.action, "send_payment");
  assert.equal(plan1.preparedTaskPayload?.capabilityId, "settlement.usdc");

  // Plan 2: DeFi TVL -> ₦DEFILLAMA
  const plan2 = await orchestrator.planTask("Show PancakeSwap TVL and protocol volume");
  assert.equal(plan2.status, "ready_for_review");
  assert.equal(plan2.intent.category, "defi.tvl");
  assert.ok(plan2.matchedSpecialist);
  assert.equal(plan2.matchedSpecialist.tag, "₦DEFILLAMA");
  assert.equal(plan2.matchedSpecialist.capability.id, "defi.tvl_feed");

  // Plan 3: Weather Logistics -> ₦METEO
  const plan3 = await orchestrator.planTask("Check transit weather in London");
  assert.equal(plan3.status, "ready_for_review");
  assert.equal(plan3.intent.category, "logistics.weather");
  assert.ok(plan3.matchedSpecialist);
  assert.equal(plan3.matchedSpecialist.tag, "₦METEO");
  assert.equal(plan3.matchedSpecialist.capability.id, "weather.logistics");

  // Plan 4: Market Price -> ₦COINGECKO
  const plan4 = await orchestrator.planTask("What is BNB price in USDC?");
  assert.equal(plan4.status, "ready_for_review");
  assert.equal(plan4.intent.category, "market.price");
  assert.ok(plan4.matchedSpecialist);
  assert.equal(plan4.matchedSpecialist.tag, "₦COINGECKO");
  assert.equal(plan4.matchedSpecialist.capability.id, "market.spot_price");
});

test("4. Open Specialist Ecosystem: Third-Party Agent Matching", async (t) => {
  const directory = new SpecialistAgentDirectory();
  const orchestrator = new NairaTagOrchestrator(directory);

  // Register a third-party security specialist
  await directory.registerAgent({
    tag: "₦CERTIPRIME",
    kind: "specialist",
    name: "CertiPrime Contract Audit Agent",
    description: "Autonomous smart contract static analysis and bytecode vulnerability auditing.",
    author: "CertiPrime Security DAO",
    version: "1.0.0",
    owner: "0x4444444444444444444444444444444444444444",
    capabilities: [
      {
        id: "security.audit",
        category: "security",
        name: "Bytecode Vulnerability Scan",
        description: "Scans smart contract bytecode for reentrancy, access control flaws, and unhandled exceptions.",
        tags: ["security", "audit", "vulnerability", "bytecode", "solidity"],
        pricing: { model: "fixed_per_request", amount: "5.0", currency: "USDC" },
        estimatedLatencyMs: 3200,
      },
    ],
  });

  // Verify the Orchestrator discovers and selects this dynamic specialist
  const plan = await orchestrator.planTask("Run a security vulnerability audit on my smart contract");
  assert.equal(plan.status, "ready_for_review");
  assert.ok(plan.matchedSpecialist);
  assert.equal(plan.matchedSpecialist.tag, "₦CERTIPRIME");
  assert.equal(plan.matchedSpecialist.capability.id, "security.audit");
  assert.equal(plan.matchedSpecialist.pricing?.amount, "5.0");
  assert.equal(plan.matchedSpecialist.pricing?.currency, "USDC");
});

test("5. Critical Safety: 'Identity is not Authority' Enforcement", async (t) => {
  const orchestrator = new NairaTagOrchestrator();

  // 1. Payment Plan with a verified Agent ID holder caller
  // Verified real on-chain holder from BSC Mainnet
  const realHolderAddress = "0xE077ab2259170199d398ec8d70D44d7dde1C6e06";
  const plan = await orchestrator.planTask("Send 100 USDC to ₦BOB", {
    address: realHolderAddress,
  });

  // CRITICAL CHECK: Even with a verified Agent ID holder, financial actions MUST NOT be pre-authorized!
  assert.equal(plan.authorization.requiresUserAuthorization, true);
  assert.equal(plan.authorization.isAuthorized, false);
  assert.equal(plan.authorization.spendingLimit?.amount, "100");
  assert.equal(plan.authorization.spendingLimit?.currency, "USDC");
  assert.match(plan.authorization.reason, /requires your explicit authorization/i);
  assert.match(
    plan.authorization.warning || "",
    /CRITICAL RULE: Neither NairaTag identity nor Binance Agent ID credentials bypass user authorization/i
  );

  // 2. Read-only query should not require financial authorization
  const readPlan = await orchestrator.planTask("What is PancakeSwap TVL?");
  assert.equal(readPlan.authorization.requiresUserAuthorization, false);
  assert.equal(readPlan.authorization.isAuthorized, false);
});

test("6. Ambiguous and Unsupported Requests", async (t) => {
  const orchestrator = new NairaTagOrchestrator();

  // Ambiguous request
  const ambPlan = await orchestrator.planTask("hi");
  assert.equal(ambPlan.status, "needs_clarification");
  assert.ok(ambPlan.clarificationPrompt);
  assert.match(ambPlan.clarificationPrompt, /Could you please specify/i);

  // Unsupported request (beyond registered specialist capabilities)
  const unsuppPlan = await orchestrator.planTask("Bake a chocolate cake recipe in the kitchen");
  assert.equal(unsuppPlan.status, "unsupported");
  assert.ok(unsuppPlan.clarificationPrompt);
  assert.match(unsuppPlan.clarificationPrompt, /discover available specialists/i);
});

test("7. End-to-End Orchestrator Tool Execution (plan_orchestration)", async (t) => {
  // Test that the tool wrapped in LLM_READ_TOOLS executes properly
  const planTool = LLM_READ_TOOLS.plan_orchestration;
  assert.ok(planTool, "plan_orchestration tool must be registered in LLM_READ_TOOLS");

  const toolOutput = await planTool.execute(
    {
      prompt: "Send 2.5 USDC to ₦CHARLIE",
      caller_tag: "₦ALICE",
    },
    { toolCallId: "test_call_1", messages: [] }
  );

  assert.ok(toolOutput);
  assert.equal(toolOutput.status, "ready_for_review");
  assert.equal(toolOutput.intent.category, "payments.settlement");
  assert.equal(toolOutput.matchedSpecialist.tag, "₦BLOOM");
  assert.equal(toolOutput.authorization.requiresUserAuthorization, true);
  assert.equal(toolOutput.authorization.isAuthorized, false);
  assert.match(toolOutput.summary, /Orchestration Plan Formulated/);
});
