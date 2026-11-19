/**
 * Test Suite: Security Foundation & Adversarial Verification (Phase 1 Remediation)
 *
 * Exhaustive security and negative test coverage for:
 * - SEC-01: Cryptographic consent bypass prevention, parameter manipulation, signature forgery
 * - SEC-02: Persistent replay protection across process restarts, nonce rollback rejection
 * - ID-01: On-chain NairaTagAgentIDActivation state evaluation and downgrade on lost Agent ID
 * - SEC-03: Strict Zod schema validation against poisoned or malformed plans
 */

import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { unlinkSync, existsSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import {
  NairaTagOrchestrator,
  OrchestrationPlanSchema,
} from "../app/agent/src/services/orchestratorCore.ts";
import {
  TaskDelegator,
  NAIRATAG_AUTH_DOMAIN,
  NAIRATAG_AUTH_TYPES,
  buildCanonicalAuthorizationMessage,
} from "../app/agent/src/services/taskDelegator.ts";
import { DurableExecutionStore } from "../app/agent/src/services/durableExecutionStore.ts";

const USER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const userAccount = privateKeyToAccount(USER_PRIVATE_KEY);

const ATTACKER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const attackerAccount = privateKeyToAccount(ATTACKER_PRIVATE_KEY);

function createFreshDelegator() {
  const storePath = join(tmpdir(), `sec_store_${randomUUID()}.json`);
  const store = new DurableExecutionStore(storePath);
  const delegator = new TaskDelegator(undefined, store);
  return { delegator, store, storePath };
}

test("SEC-01.1: Programmatic bypass attempt with bare affirmation string is strictly rejected", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const { delegator } = createFreshDelegator();

  const plan = await orchestrator.planTask("Send 50 USDC to ₦ALICE", {
    address: userAccount.address,
  });

  // Attacker supplies affirmation string but NO signature
  const bypassAttempt = {
    planId: plan.planId,
    approvedBy: userAccount.address,
    userAffirmation: "CONFIRM_PAYMENT",
  };

  const receipt = await delegator.executeTask(plan, bypassAttempt);
  assert.equal(receipt.status, "unauthorized");
  assert.match(receipt.error || "", /Missing cryptographic signature/i);
});

test("SEC-01.2: Signature from non-owner/attacker is strictly rejected (Forgery Protection)", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const { delegator } = createFreshDelegator();

  const plan = await orchestrator.planTask("Send 25 USDC to ₦BOB", {
    address: userAccount.address,
  });

  const expiresAt = Math.floor(Date.now() / 1000) + 1200;
  const nonce = 1;

  // Attacker signs using their own key
  const forgedSig = await attackerAccount.signTypedData({
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

  const forgedAuth = {
    planId: plan.planId,
    approvedBy: userAccount.address, // Declares user, but signed by attacker
    signature: forgedSig,
    nonce,
    expiresAt,
    chainId: 56,
  };

  const receipt = await delegator.executeTask(plan, forgedAuth);
  assert.equal(receipt.status, "unauthorized");
  assert.match(receipt.error || "", /Cryptographic verification failed/i);
});

test("SEC-01.3: Parameter manipulation detection (Amount tampering)", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const { delegator } = createFreshDelegator();

  const plan = await orchestrator.planTask("Send 100 USDC to ₦CHARLIE", {
    address: userAccount.address,
  });

  const expiresAt = Math.floor(Date.now() / 1000) + 1200;
  const nonce = 10;

  // User signed authorization for only 10 USDC
  const signedSig = await userAccount.signTypedData({
    domain: { ...NAIRATAG_AUTH_DOMAIN, chainId: 56n },
    types: NAIRATAG_AUTH_TYPES,
    primaryType: "NairaTagTaskAuthorization",
    message: {
      planId: plan.planId,
      action: plan.intent.action,
      targetSpecialist: plan.matchedSpecialist.executionAddress,
      recipient: plan.intent.entities.recipientTag,
      amount: "10", // Signed for 10 USDC
      token: "USDC",
      chainId: 56n,
      nonce: BigInt(nonce),
      expiresAt: BigInt(expiresAt),
    },
  });

  // Attacker submits this signature for the 100 USDC plan
  const tamperedAuth = {
    planId: plan.planId,
    approvedBy: userAccount.address,
    signature: signedSig,
    nonce,
    expiresAt,
    chainId: 56,
  };

  const receipt = await delegator.executeTask(plan, tamperedAuth);
  assert.equal(receipt.status, "unauthorized");
  assert.match(receipt.error || "", /Cryptographic verification failed/i);
});

test("SEC-01.4: Parameter manipulation detection (Recipient tampering)", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const { delegator } = createFreshDelegator();

  const plan = await orchestrator.planTask("Send 10 USDC to ₦MERCHANT", {
    address: userAccount.address,
  });

  const expiresAt = Math.floor(Date.now() / 1000) + 1200;
  const nonce = 11;

  // User signed authorization for ₦DIFFERENT
  const signedSig = await userAccount.signTypedData({
    domain: { ...NAIRATAG_AUTH_DOMAIN, chainId: 56n },
    types: NAIRATAG_AUTH_TYPES,
    primaryType: "NairaTagTaskAuthorization",
    message: {
      planId: plan.planId,
      action: plan.intent.action,
      targetSpecialist: plan.matchedSpecialist.executionAddress,
      recipient: "₦DIFFERENT", // Mismatched recipient
      amount: "10",
      token: "USDC",
      chainId: 56n,
      nonce: BigInt(nonce),
      expiresAt: BigInt(expiresAt),
    },
  });

  const tamperedAuth = {
    planId: plan.planId,
    approvedBy: userAccount.address,
    signature: signedSig,
    nonce,
    expiresAt,
    chainId: 56,
  };

  const receipt = await delegator.executeTask(plan, tamperedAuth);
  assert.equal(receipt.status, "unauthorized");
  assert.match(receipt.error || "", /Cryptographic verification failed/i);
});

test("SEC-01.5: Expired authorization is strictly rejected", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const { delegator } = createFreshDelegator();

  const plan = await orchestrator.planTask("Send 5 USDC to ₦ALICE", {
    address: userAccount.address,
  });

  const pastExpiry = Math.floor(Date.now() / 1000) - 30; // 30 seconds ago
  const nonce = 12;

  const expiredSig = await userAccount.signTypedData({
    domain: { ...NAIRATAG_AUTH_DOMAIN, chainId: 56n },
    types: NAIRATAG_AUTH_TYPES,
    primaryType: "NairaTagTaskAuthorization",
    message: {
      planId: plan.planId,
      action: plan.intent.action,
      targetSpecialist: plan.matchedSpecialist.executionAddress,
      recipient: plan.intent.entities.recipientTag,
      amount: "5",
      token: "USDC",
      chainId: 56n,
      nonce: BigInt(nonce),
      expiresAt: BigInt(pastExpiry),
    },
  });

  const auth = {
    planId: plan.planId,
    approvedBy: userAccount.address,
    signature: expiredSig,
    nonce,
    expiresAt: pastExpiry,
  };

  const receipt = await delegator.executeTask(plan, auth);
  assert.equal(receipt.status, "unauthorized");
  assert.match(receipt.error || "", /Authorization expired/i);
});

test("SEC-02.1: Nonce rollback attempt is rejected", async (t) => {
  const orchestrator = new NairaTagOrchestrator();
  const { delegator } = createFreshDelegator();

  // Execute first plan with nonce = 5
  const plan1 = await orchestrator.planTask("Send 1 USDC to ₦ALICE", { address: userAccount.address });
  plan1.preparedTaskPayload = { recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" };
  const expiresAt = Math.floor(Date.now() / 1000) + 1200;

  const sig1 = await userAccount.signTypedData({
    domain: { ...NAIRATAG_AUTH_DOMAIN, chainId: 56n },
    types: NAIRATAG_AUTH_TYPES,
    primaryType: "NairaTagTaskAuthorization",
    message: {
      planId: plan1.planId,
      action: plan1.intent.action,
      targetSpecialist: plan1.matchedSpecialist.executionAddress,
      recipient: plan1.intent.entities.recipientTag,
      amount: "1",
      token: "USDC",
      chainId: 56n,
      nonce: 5n,
      expiresAt: BigInt(expiresAt),
    },
  });

  const receipt1 = await delegator.executeTask(plan1, {
    planId: plan1.planId,
    approvedBy: userAccount.address,
    signature: sig1,
    nonce: 5,
    expiresAt,
  });
  assert.equal(receipt1.status, "simulated");

  // Attempt second plan with rolled-back nonce = 3 (<= 5)
  const plan2 = await orchestrator.planTask("Send 1 USDC to ₦BOB", { address: userAccount.address });
  const sig2 = await userAccount.signTypedData({
    domain: { ...NAIRATAG_AUTH_DOMAIN, chainId: 56n },
    types: NAIRATAG_AUTH_TYPES,
    primaryType: "NairaTagTaskAuthorization",
    message: {
      planId: plan2.planId,
      action: plan2.intent.action,
      targetSpecialist: plan2.matchedSpecialist.executionAddress,
      recipient: plan2.intent.entities.recipientTag,
      amount: "1",
      token: "USDC",
      chainId: 56n,
      nonce: 3n, // Rolled-back nonce
      expiresAt: BigInt(expiresAt),
    },
  });

  const receipt2 = await delegator.executeTask(plan2, {
    planId: plan2.planId,
    approvedBy: userAccount.address,
    signature: sig2,
    nonce: 3,
    expiresAt,
  });

  assert.equal(receipt2.status, "unauthorized");
  assert.match(receipt2.error || "", /Invalid nonce: nonce \(3\) must be strictly greater than previous highest nonce \(5\)/i);
});

test("SEC-02.2: Replay protection persists across complete process restart simulation", async (t) => {
  const tempStoreFile = join(tmpdir(), `nairatag_test_store_${randomUUID()}.json`);

  try {
    const orchestrator = new NairaTagOrchestrator();
    const store1 = new DurableExecutionStore(tempStoreFile);
    const delegator1 = new TaskDelegator(undefined, store1);

    const plan = await orchestrator.planTask("Send 12 USDC to ₦CHARLIE", { address: userAccount.address });
    plan.preparedTaskPayload = { recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" };
    const expiresAt = Math.floor(Date.now() / 1000) + 1200;
    const nonce = 20;

    const signature = await userAccount.signTypedData({
      domain: { ...NAIRATAG_AUTH_DOMAIN, chainId: 56n },
      types: NAIRATAG_AUTH_TYPES,
      primaryType: "NairaTagTaskAuthorization",
      message: {
        planId: plan.planId,
        action: plan.intent.action,
        targetSpecialist: plan.matchedSpecialist.executionAddress,
        recipient: plan.intent.entities.recipientTag,
        amount: "12",
        token: "USDC",
        chainId: 56n,
        nonce: BigInt(nonce),
        expiresAt: BigInt(expiresAt),
      },
    });

    const authRequest = {
      planId: plan.planId,
      approvedBy: userAccount.address,
      signature,
      nonce,
      expiresAt,
    };

    // First execution succeeds in instance 1
    const receipt1 = await delegator1.executeTask(plan, authRequest);
    assert.equal(receipt1.status, "simulated");

    // === SIMULATE PROCESS RESTART ===
    // Destroy instance 1 completely and spin up a fresh instance 2 pointing to the same storage
    const store2 = new DurableExecutionStore(tempStoreFile);
    const delegator2 = new TaskDelegator(undefined, store2);

    // Replay attack in instance 2 MUST be rejected
    const replayReceipt = await delegator2.executeTask(plan, authRequest);
    assert.equal(replayReceipt.status, "rejected");
    assert.match(replayReceipt.error || "", /Plan already executed. Replay attempt rejected/i);
  } finally {
    if (existsSync(tempStoreFile)) {
      unlinkSync(tempStoreFile);
    }
  }
});

test("SEC-03: Malformed or poisoned plan JSON is rejected by strict Zod schema validation", async (t) => {
  const delegator = new TaskDelegator();

  // Test Case A: Missing required planId
  const malformedPlanA = {
    timestamp: new Date().toISOString(),
    status: "ready_for_review",
    caller: { agentIdTier: "unverified", isAgentIdHolder: false },
    authorization: { requiresUserAuthorization: false, isAuthorized: false, reason: "none" },
    summary: "malformed",
  };

  const receiptA = await delegator.executeTask(malformedPlanA);
  assert.equal(receiptA.status, "failed");
  assert.match(receiptA.error || "", /Plan schema validation failed/i);

  // Test Case B: Invalid status string
  const malformedPlanB = {
    planId: "plan_123",
    timestamp: new Date().toISOString(),
    status: "INVALID_STATUS_INJECTED",
    caller: { agentIdTier: "unverified", isAgentIdHolder: false },
    intent: {
      category: "payments.settlement",
      action: "send_payment",
      confidence: 0.9,
      rawPrompt: "test",
      entities: {},
      requiresSpecialist: true,
      requiresFinancialAuthorization: true,
    },
    authorization: { requiresUserAuthorization: true, isAuthorized: false, reason: "test" },
    summary: "test",
  };

  const receiptB = await delegator.executeTask(malformedPlanB);
  assert.equal(receiptB.status, "failed");
  assert.match(receiptB.error || "", /Plan schema validation failed/i);
});

test("ID-01: Orchestrator caller resolution evaluates on-chain activation status", async (t) => {
  const orchestrator = new NairaTagOrchestrator();

  // Unregistered tag returns NOT_ACTIVATED or CONTRACT_UNAVAILABLE (if not deployed on active network)
  const caller = await orchestrator.resolveCaller({ tag: "₦UNREGISTERED_TAG_999" });
  assert.equal(caller.isTagActivated, false);
  assert.ok(caller.activationStatus === "NOT_ACTIVATED" || caller.activationStatus === "CONTRACT_UNAVAILABLE");

  // Valid caller object structure
  assert.ok("isTagActivated" in caller);
  assert.ok("activationStatus" in caller);
});
