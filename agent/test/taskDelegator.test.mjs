/**
 * Test Suite: NairaTag Task Delegator & Interactive Authorization Gate (Step 9)
 *
 * Verifies:
 * 1. Read-only task execution (₦DEFILLAMA, ₦METEO, ₦COINGECKO) without financial authorization.
 * 2. Strict blocking of unauthorized financial tasks ("Identity is not Authority").
 * 3. Successful execution when explicit user authorization is provided.
 * 4. Cryptographic replay attack prevention (duplicate execution rejected).
 * 5. Authorization parameter integrity checks (mismatched plan ID, invalid address, caller mismatch).
 * 6. Tool execution through LLM_READ_TOOLS.execute_orchestration_plan.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { NairaTagOrchestrator } from "../app/agent/src/services/orchestratorCore.ts";
import {
  TaskDelegator,
  globalTaskDelegator,
} from "../app/agent/src/services/taskDelegator.ts";
import { LLM_READ_TOOLS } from "../app/agent/src/tools.ts";

test("1. Read-Only Task Delegation (No Financial Authorization Required)", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const delegator = new TaskDelegator();

  // Test Case A: DeFi TVL query from ₦DEFILLAMA
  const tvlPlan = await orchestrator.planTask("What is PancakeSwap TVL on BNB Chain?");
  assert.equal(tvlPlan.authorization.requiresUserAuthorization, false);

  const tvlReceipt = await delegator.executeTask(tvlPlan);
  assert.equal(tvlReceipt.status, "completed");
  assert.equal(tvlReceipt.specialistTag, "₦DEFILLAMA");
  assert.equal(tvlReceipt.capabilityId, "defi.tvl_feed");
  assert.ok(tvlReceipt.resultPayload);
  assert.equal(tvlReceipt.resultPayload.protocol, "pancakeswap");
  assert.equal(tvlReceipt.resultPayload.chain, "bsc");
  assert.ok(tvlReceipt.latencyMs >= 0);

  // Test Case B: Weather logistics from ₦METEO
  const weatherPlan = await orchestrator.planTask("Check weather in Nairobi for transport");
  const weatherReceipt = await delegator.executeTask(weatherPlan);
  assert.equal(weatherReceipt.status, "completed");
  assert.equal(weatherReceipt.specialistTag, "₦METEO");
  assert.equal(weatherReceipt.resultPayload?.location, "Nairobi");

  // Test Case C: Token price from ₦COINGECKO
  const pricePlan = await orchestrator.planTask("What is BNB price in USDC?");
  const priceReceipt = await delegator.executeTask(pricePlan);
  assert.equal(priceReceipt.status, "completed");
  assert.equal(priceReceipt.specialistTag, "₦COINGECKO");
  assert.equal(priceReceipt.resultPayload?.symbol, "BNB");
});

test("2. Financial Action Blocked Without Authorization ('Identity is not Authority')", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const delegator = new TaskDelegator();

  // Real verified Agent ID holder on BSC Mainnet
  const verifiedHolder = "0xE077ab2259170199d398ec8d70D44d7dde1C6e06";

  const paymentPlan = await orchestrator.planTask("Send 10 USDC to ₦ALICE", {
    address: verifiedHolder,
  });

  assert.equal(paymentPlan.authorization.requiresUserAuthorization, true);
  assert.equal(paymentPlan.authorization.isAuthorized, false);

  // Attempt to execute without providing authorization proof
  const blockedReceipt = await delegator.executeTask(paymentPlan);

  assert.equal(blockedReceipt.status, "unauthorized");
  assert.match(blockedReceipt.error || "", /CRITICAL ACCESS BLOCKED/i);
  assert.match(blockedReceipt.error || "", /Identity is not Authority/i);
});

test("3. Authorized Financial Task Execution", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const delegator = new TaskDelegator();

  const userAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const plan = await orchestrator.planTask("Send 5.5 USDC to ₦BOB", {
    address: userAddress,
  });

  // Provide explicit user authorization
  const authRequest = {
    planId: plan.planId,
    approvedBy: userAddress,
    userAffirmation: "CONFIRM_PAYMENT_5.5_USDC",
    timestamp: new Date().toISOString(),
  };

  const receipt = await delegator.executeTask(plan, authRequest);

  assert.equal(receipt.status, "completed");
  assert.equal(receipt.specialistTag, "₦BLOOM");
  assert.equal(receipt.capabilityId, "settlement.usdc");
  assert.ok(receipt.settlementTxHash);
  assert.match(receipt.settlementTxHash, /^0x51d9/);
  assert.ok(receipt.deliverableUrl);
  assert.equal(receipt.resultPayload?.amount, "5.5");
  assert.equal(receipt.resultPayload?.currency, "USDC");
  assert.equal(receipt.resultPayload?.settlementStatus, "confirmed");

  // Verify authorization details logged on the receipt
  assert.ok(receipt.authorizationDetails);
  assert.equal(receipt.authorizationDetails.approvedBy.toLowerCase(), userAddress.toLowerCase());
  assert.equal(receipt.authorizationDetails.spendingAmount, "5.5");
  assert.equal(receipt.authorizationDetails.spendingCurrency, "USDC");
});

test("4. Replay Attack Prevention", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const delegator = new TaskDelegator();

  const userAddress = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  const plan = await orchestrator.planTask("Send 2.0 USDC to ₦CHARLIE", {
    address: userAddress,
  });

  const authRequest = {
    planId: plan.planId,
    approvedBy: userAddress,
    userAffirmation: "I_AUTHORIZE_THIS_PAYMENT",
  };

  // First execution: succeeds
  const firstReceipt = await delegator.executeTask(plan, authRequest);
  assert.equal(firstReceipt.status, "completed");

  // Second execution of the exact same plan: strictly rejected!
  const replayReceipt = await delegator.executeTask(plan, authRequest);
  assert.equal(replayReceipt.status, "rejected");
  assert.match(replayReceipt.error || "", /Plan already executed. Replay attempt rejected/i);
});

test("5. Authorization Integrity & Anti-Tampering Checks", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const delegator = new TaskDelegator();

  const userAddress = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
  const plan = await orchestrator.planTask("Send 15 USDC to ₦DAVE", {
    address: userAddress,
  });

  // Check 1: Plan ID mismatch
  const mismatchAuth = {
    planId: "plan_fake_tampered_id",
    approvedBy: userAddress,
    userAffirmation: "CONFIRM",
  };
  const res1 = delegator.authorizePlan(plan, mismatchAuth);
  assert.equal(res1.valid, false);
  assert.match(res1.error || "", /Plan ID mismatch/i);

  // Check 2: Invalid approver address
  const badAddrAuth = {
    planId: plan.planId,
    approvedBy: "not-an-evm-address",
    userAffirmation: "CONFIRM",
  };
  const res2 = delegator.authorizePlan(plan, badAddrAuth);
  assert.equal(res2.valid, false);
  assert.match(res2.error || "", /Invalid approver address/i);

  // Check 3: Approver mismatch (impersonation attempt)
  const impersonatorAuth = {
    planId: plan.planId,
    approvedBy: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    userAffirmation: "CONFIRM",
  };
  const res3 = delegator.authorizePlan(plan, impersonatorAuth);
  assert.equal(res3.valid, false);
  assert.match(res3.error || "", /Approver mismatch/i);

  // Check 4: Missing affirmation
  const noAffirmationAuth = {
    planId: plan.planId,
    approvedBy: userAddress,
    userAffirmation: "   ",
  };
  const res4 = delegator.authorizePlan(plan, noAffirmationAuth);
  assert.equal(res4.valid, false);
  assert.match(res4.error || "", /Missing user affirmation/i);
});

test("6. End-to-End Execution via LLM_READ_TOOLS.execute_orchestration_plan", async (t) => {
  const planTool = LLM_READ_TOOLS.plan_orchestration;
  const execTool = LLM_READ_TOOLS.execute_orchestration_plan;

  assert.ok(planTool);
  assert.ok(execTool);

  // 1. Formulate Plan
  const plan = await planTool.execute(
    {
      prompt: "Show PancakeSwap TVL on BNB",
      caller_tag: "₦USER",
    },
    { toolCallId: "call_plan_1", messages: [] }
  );

  assert.equal(plan.status, "ready_for_review");

  // 2. Execute Plan via Tool
  const receipt = await execTool.execute(
    {
      plan_json: JSON.stringify(plan),
    },
    { toolCallId: "call_exec_1", messages: [] }
  );

  assert.ok(receipt);
  assert.equal(receipt.status, "completed");
  assert.equal(receipt.specialistTag, "₦DEFILLAMA");
  assert.ok(receipt.resultPayload);
});
