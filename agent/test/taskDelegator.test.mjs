/**
 * Test Suite: NairaTag Task Delegator & Interactive Cryptographic Authorization Gate (Phase 1)
 *
 * Verifies:
 * 1. Read-only task execution (₦DEFILLAMA, ₦METEO, ₦COINGECKO) without financial authorization.
 * 2. Strict blocking of unauthorized financial tasks ("Identity is not Authority").
 * 3. Cryptographically signed financial task execution (EIP-712 / EIP-191).
 * 4. Persistent replay attack prevention via DurableExecutionStore.
 * 5. Authorization integrity & parameter anti-tampering checks.
 * 6. Tool execution through LLM_READ_TOOLS.execute_orchestration_plan with Zod validation.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { NairaTagOrchestrator } from "../app/agent/src/services/orchestratorCore.ts";
import {
  TaskDelegator,
  NAIRATAG_AUTH_DOMAIN,
  NAIRATAG_AUTH_TYPES,
  buildCanonicalAuthorizationMessage,
} from "../app/agent/src/services/taskDelegator.ts";
import { DurableExecutionStore } from "../app/agent/src/services/durableExecutionStore.ts";
import { LLM_READ_TOOLS } from "../app/agent/src/tools.ts";

// Standard deterministic test accounts
const TEST_USER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const testUserAccount = privateKeyToAccount(TEST_USER_KEY);

const ATTACKER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const attackerAccount = privateKeyToAccount(ATTACKER_KEY);

function createFreshDelegator() {
  const storePath = join(tmpdir(), `task_store_${randomUUID()}.json`);
  const store = new DurableExecutionStore(storePath);
  const delegator = new TaskDelegator(undefined, store);
  return { delegator, store, storePath };
}

test("1. Read-Only Task Delegation (No Financial Authorization Required)", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const { delegator } = createFreshDelegator();

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

test("2. Financial Action Blocked Without Cryptographic Authorization", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const { delegator } = createFreshDelegator();

  const paymentPlan = await orchestrator.planTask("Send 10 USDC to ₦ALICE", {
    address: testUserAccount.address,
  });

  assert.equal(paymentPlan.authorization.requiresUserAuthorization, true);
  assert.equal(paymentPlan.authorization.isAuthorized, false);

  // Attempt to execute without providing authorization proof
  const blockedReceipt = await delegator.executeTask(paymentPlan);

  assert.equal(blockedReceipt.status, "unauthorized");
  assert.match(blockedReceipt.error || "", /CRITICAL ACCESS BLOCKED/i);
  assert.match(blockedReceipt.error || "", /Identity is not Authority/i);
});

test("3. Cryptographically Authorized Financial Task Execution (EIP-712 & EIP-191)", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const { delegator } = createFreshDelegator();

  const plan = await orchestrator.planTask("Send 5.5 USDC to ₦BOB", {
    address: testUserAccount.address,
  });

  const mockRecipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const usdcAddress = "0x64544969ed7EBf5f083679233325356EbE738930";

  // Inject verified test receipt to validate authentic on-chain receipt & transfer event handling
  plan.preparedTaskPayload = {
    amount: "5.5",
    currency: "USDC",
    recipient: mockRecipient,
    testSeam: {
      txHash: "0x3f5c71a938c8b18a25c1e87498c19a8264e819b265819e625a1739810a916382",
      receipt: {
        status: "success",
        blockNumber: 42100800n,
        transactionHash: "0x3f5c71a938c8b18a25c1e87498c19a8264e819b265819e625a1739810a916382",
        from: testUserAccount.address,
        to: usdcAddress,
        gasUsed: 45000n,
        logs: [
          {
            address: usdcAddress,
            topics: [
              "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
              "0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266",
              "0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8",
            ],
            data: "0x0000000000000000000000000000000000000000000000004c53ecdc18a60000",
            logIndex: 0n,
            transactionIndex: 0n,
          },
        ],
      },
    },
  };

  const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour in future
  const nonce = 1;
  const chainId = 56;

  // Sign EIP-712 Typed Data with real user account
  const signature = await testUserAccount.signTypedData({
    domain: { ...NAIRATAG_AUTH_DOMAIN, chainId: BigInt(chainId) },
    types: NAIRATAG_AUTH_TYPES,
    primaryType: "NairaTagTaskAuthorization",
    message: {
      planId: plan.planId,
      action: plan.intent.action,
      targetSpecialist: plan.matchedSpecialist.executionAddress,
      recipient: plan.intent.entities.recipientTag,
      amount: plan.intent.entities.amount,
      token: plan.intent.entities.token,
      chainId: BigInt(chainId),
      nonce: BigInt(nonce),
      expiresAt: BigInt(expiresAt),
    },
  });

  const authRequest = {
    planId: plan.planId,
    approvedBy: testUserAccount.address,
    signature,
    nonce,
    expiresAt,
    chainId,
    type: "eip712",
  };

  const receipt = await delegator.executeTask(plan, authRequest);

  assert.equal(receipt.status, "confirmed");
  assert.equal(receipt.paymentCompleted, true);
  assert.equal(receipt.specialistTag, "₦BLOOM");
  assert.equal(receipt.capabilityId, "settlement.usdc");
  assert.ok(receipt.settlementTxHash);
  assert.equal(receipt.resultPayload?.amount, "5.5");
  assert.equal(receipt.resultPayload?.currency, "USDC");

  // Verify authorization details logged on the receipt
  assert.ok(receipt.authorizationDetails);
  assert.equal(receipt.authorizationDetails.approvedBy.toLowerCase(), testUserAccount.address.toLowerCase());
  assert.equal(receipt.authorizationDetails.spendingAmount, "5.5");
  assert.equal(receipt.authorizationDetails.spendingCurrency, "USDC");
  assert.equal(receipt.authorizationDetails.nonce, 1);
});

test("4. Replay Attack Prevention (Persistent Across Re-execution)", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const { delegator } = createFreshDelegator();

  const plan = await orchestrator.planTask("Send 2.0 USDC to ₦CHARLIE", {
    address: testUserAccount.address,
  });

  const mockRecipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const usdcAddress = "0x64544969ed7EBf5f083679233325356EbE738930";

  plan.preparedTaskPayload = {
    amount: "2.0",
    currency: "USDC",
    recipient: mockRecipient,
    testSeam: {
      txHash: "0x4e6d82b049d9c29b36d2f98509d20b9375f920c376920f736b2840921b027493",
      receipt: {
        status: "success",
        blockNumber: 42100805n,
        transactionHash: "0x4e6d82b049d9c29b36d2f98509d20b9375f920c376920f736b2840921b027493",
        from: testUserAccount.address,
        to: usdcAddress,
        gasUsed: 45000n,
        logs: [
          {
            address: usdcAddress,
            topics: [
              "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
              "0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266",
              "0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8",
            ],
            data: "0x0000000000000000000000000000000000000000000000001bc16d674ec80000",
            logIndex: 0n,
            transactionIndex: 0n,
          },
        ],
      },
    },
  };

  const expiresAt = Math.floor(Date.now() / 1000) + 1800;
  const nonce = 1;

  const signature = await testUserAccount.signTypedData({
    domain: { ...NAIRATAG_AUTH_DOMAIN, chainId: 56n },
    types: NAIRATAG_AUTH_TYPES,
    primaryType: "NairaTagTaskAuthorization",
    message: {
      planId: plan.planId,
      action: plan.intent.action,
      targetSpecialist: plan.matchedSpecialist.executionAddress,
      recipient: plan.intent.entities.recipientTag,
      amount: plan.intent.entities.amount,
      token: plan.intent.entities.token,
      chainId: 56n,
      nonce: BigInt(nonce),
      expiresAt: BigInt(expiresAt),
    },
  });

  const authRequest = {
    planId: plan.planId,
    approvedBy: testUserAccount.address,
    signature,
    nonce,
    expiresAt,
    chainId: 56,
  };

  // First execution: succeeds
  const firstReceipt = await delegator.executeTask(plan, authRequest);
  assert.equal(firstReceipt.status, "confirmed");
  assert.equal(firstReceipt.paymentCompleted, true);

  // Second execution of the exact same plan: strictly rejected by persistent store!
  const replayReceipt = await delegator.executeTask(plan, authRequest);
  assert.equal(replayReceipt.status, "rejected");
  assert.match(replayReceipt.error || "", /Plan already executed. Replay attempt rejected/i);
});

test("5. Authorization Integrity & Anti-Tampering Checks", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const { delegator } = createFreshDelegator();

  const plan = await orchestrator.planTask("Send 15 USDC to ₦DAVE", {
    address: testUserAccount.address,
  });

  // Check 1: Missing signature fails
  const noSigAuth = {
    planId: plan.planId,
    approvedBy: testUserAccount.address,
    userAffirmation: "CONFIRM_PAYMENT",
  };
  const res1 = await delegator.authorizePlan(plan, noSigAuth);
  assert.equal(res1.valid, false);
  assert.match(res1.error || "", /Missing cryptographic signature/i);

  // Check 2: Invalid signature format fails
  const badSigAuth = {
    planId: plan.planId,
    approvedBy: testUserAccount.address,
    signature: "0xinvalidhex",
    nonce: 10,
    expiresAt: Math.floor(Date.now() / 1000) + 1000,
  };
  const res2 = await delegator.authorizePlan(plan, badSigAuth);
  assert.equal(res2.valid, false);
  assert.match(res2.error || "", /Invalid cryptographic signature format/i);

  // Check 3: Signature from attacker fails recovery against approver address
  const attackerSignature = await attackerAccount.signTypedData({
    domain: { ...NAIRATAG_AUTH_DOMAIN, chainId: 56n },
    types: NAIRATAG_AUTH_TYPES,
    primaryType: "NairaTagTaskAuthorization",
    message: {
      planId: plan.planId,
      action: plan.intent.action,
      targetSpecialist: plan.matchedSpecialist.executionAddress,
      recipient: plan.intent.entities.recipientTag,
      amount: plan.intent.entities.amount,
      token: plan.intent.entities.token,
      chainId: 56n,
      nonce: 1n,
      expiresAt: BigInt(Math.floor(Date.now() / 1000) + 1000),
    },
  });

  const forgedAuth = {
    planId: plan.planId,
    approvedBy: testUserAccount.address, // Declaring testUser, but signed by attacker
    signature: attackerSignature,
    nonce: 1,
    expiresAt: Math.floor(Date.now() / 1000) + 1000,
  };

  const res3 = await delegator.authorizePlan(plan, forgedAuth);
  assert.equal(res3.valid, false);
  assert.match(res3.error || "", /Cryptographic verification failed/i);

  // Check 4: Expired authorization fails
  const expiredSig = await testUserAccount.signTypedData({
    domain: { ...NAIRATAG_AUTH_DOMAIN, chainId: 56n },
    types: NAIRATAG_AUTH_TYPES,
    primaryType: "NairaTagTaskAuthorization",
    message: {
      planId: plan.planId,
      action: plan.intent.action,
      targetSpecialist: plan.matchedSpecialist.executionAddress,
      recipient: plan.intent.entities.recipientTag,
      amount: plan.intent.entities.amount,
      token: plan.intent.entities.token,
      chainId: 56n,
      nonce: 2n,
      expiresAt: BigInt(Math.floor(Date.now() / 1000) - 60), // Expired 1 min ago
    },
  });

  const expiredAuth = {
    planId: plan.planId,
    approvedBy: testUserAccount.address,
    signature: expiredSig,
    nonce: 2,
    expiresAt: Math.floor(Date.now() / 1000) - 60,
  };

  const res4 = await delegator.authorizePlan(plan, expiredAuth);
  assert.equal(res4.valid, false);
  assert.match(res4.error || "", /Authorization expired/i);
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
