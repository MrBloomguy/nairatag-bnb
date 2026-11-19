# NairaTag × BNB Chain: Security, Execution and Hackathon Readiness Audit

> **Document Status:** Comprehensive Audit Report (Step 10)  
> **Repository:** `MrBloomguy/nairatag-bnb`  
> **Audit Date:** 2026-11-19  
> **Scope:** Smart Contracts, Task Delegation, Authorization Gate, Identity Verification, Specialist Execution, Hackathon Criteria, and Binance Skills Hub Integration.

---

## 1. Executive Summary & Ground-Truth Posture

The NairaTag on BNB Chain repository has achieved notable foundational milestones:
1. **Foundry Smart Contract Layer:** `NairaTagRegistry.sol`, `NairaTagResolver.sol`, and `NairaTagAgentIDActivation.sol` are verified on BNB Testnet, tested against BNB Mainnet forks (26/26 tests passing), with dry-run deployment gas costs simulated (~0.00022 BNB).
2. **Identity Architecture:** The SPACE ID Agent ID BEP-721 contract (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`) has been decoupled from the execution wallet, establishing that **Identity is not Authority**.
3. **Orchestrator & Directory:** The Orchestrator (`₦NAIRATAG`) parses intents, queries an open specialist directory, and formulates structured workflow plans.

### Critical Assessment: Deployer Funding Must Be Held
Despite 56/56 passing tests, **the current implementation is not yet production-secure or hackathon-submission ready**.

* **Authorization Flaw:** Financial authorization does not verify cryptographic signatures. Supplying an arbitrary text affirmation (e.g. `userAffirmation: "CONFIRM_PAYMENT"`) bypasses the consent gate entirely.
* **Ephemeral Replay Protection:** Replay protection relies on an in-memory `Set<string>` that resets on server restarts or across horizontal workers.
* **Simulated Execution:** The `₦BLOOM` settlement agent and data specialists do not execute real blockchain transactions or live API calls; they return simulated mock receipts.
* **Hackathon Criteria Gap:** The Innovation Award requires at least **30 distinct Agent ID addresses** to interact on-chain with participating contracts during the contest window. Deploying contracts without an active onboarding mechanism will fail this requirement.

**Recommendation:** **Do NOT fund the BNB deployer wallet (`0x961d16fD...14AA`) or broadcast Mainnet contracts** until the critical vulnerabilities are resolved and the 30-participant onboarding pipeline is staged.

---

## 2. Findings Matrix

| Finding ID | Severity | Category | Title | Affected Files & Functions |
|---|---|---|---|---|
| **SEC-01** | **CRITICAL** | Authorization | Programmatic Consent Bypass (Missing Signature Verification) | `agent/app/agent/src/services/taskDelegator.ts` (`authorizePlan`, `executeTask`) |
| **SEC-02** | **HIGH** | Replay / State | In-Memory, Non-Persistent Replay Protection | `agent/app/agent/src/services/taskDelegator.ts` (`executedPlans`, lines 74, 98, 224) |
| **EXEC-01** | **HIGH** | Execution | Specialist Execution Masked as Real Transactions | `agent/app/agent/src/services/taskDelegator.ts` (`dispatchToSpecialist`, lines 312-350) |
| **ID-01** | **HIGH** | Identity | Orchestrator Bypasses `NairaTagAgentIDActivation` On-Chain Checks | `agent/app/agent/src/services/orchestratorCore.ts` (`resolveCaller`, lines 195-206) |
| **HACK-01** | **HIGH** | Hackathon | Lack of Real Participant Onboarding for 30+ Agent ID Requirement | Hackathon Rules (BNB Mainnet Contract Interaction Count) |
| **DATA-01** | **MEDIUM** | Realism | External Data Oracles Return Static Mock Telemetry | `agent/app/agent/src/services/taskDelegator.ts` (`dispatchToSpecialist`, lines 334-365) |
| **SEC-03** | **LOW** | Input Validation | Unvalidated JSON Schema in Tool Execution Adapters | `agent/app/agent/src/tools.ts` (`execute_orchestration_plan`, line 198), `mcpMain.ts` |

---

## 3. Deep-Dive Audit Findings

### **SEC-01 [CRITICAL]: Programmatic Consent Bypass (Missing Signature Verification)**
- **File:** [`agent/app/agent/src/services/taskDelegator.ts`](file:///c:/Users/olusegun/.gemini/antigravity-ide/scratch/nairatag-bnb/agent/app/agent/src/services/taskDelegator.ts#L85-L145)
- **Functions:** `authorizePlan(plan, authRequest)`, `executeTask(plan, authRequest)`
- **Vulnerability Mechanism:**
  In `taskDelegator.ts`, the authorization check is implemented as follows:
  ```typescript
  // Lines 122-128
  if (!authRequest.userAffirmation || authRequest.userAffirmation.trim().length === 0) {
    return {
      valid: false,
      error: "Missing user affirmation: explicit authorization text is required.",
    };
  }
  ```
  While `signature?: string` is defined in the TypeScript interface `PlanAuthorizationRequest`, **it is never verified**. No cryptographic recovery (`verifyMessage`, `recoverAddress`, or EIP-712 `verifyTypedData`) is performed.
- **Impact:**
  Any autonomous agent, malicious frontend script, or caller knowing the user's address (`caller.address`) can forge approval simply by passing:
  ```json
  {
    "planId": "plan_xxx",
    "approvedBy": "0xTargetUserAddress",
    "userAffirmation": "CONFIRM_PAYMENT"
  }
  ```
  The system marks `isAuthorized: true` and dispatches fund movement. This defeats the core tenet **"Identity is not Authority"**.
- **Reproducible Evidence:**
  Calling `delegator.executeTask(plan, { planId: plan.planId, approvedBy: targetUser, userAffirmation: "ANY_TEXT" })` succeeds without requiring private key access.

---

### **SEC-02 [HIGH]: In-Memory, Non-Persistent Replay Protection**
- **File:** [`agent/app/agent/src/services/taskDelegator.ts`](file:///c:/Users/olusegun/.gemini/antigravity-ide/scratch/nairatag-bnb/agent/app/agent/src/services/taskDelegator.ts#L74-L75)
- **Mechanism:**
  ```typescript
  // Line 74
  private executedPlans: Set<string> = new Set();
  ```
  `executedPlans` is stored strictly in ephemeral process memory.
- **Impact:**
  1. **Process Restarts:** When the agent runtime restarts (e.g. scale-to-zero microVM, container reboot, or developer reload), the set empties. Old plans can be executed a second time.
  2. **Multi-Worker Desynchronization:** If the agent runs across multiple instances or behind a load balancer, Worker B has no visibility into Worker A's `executedPlans`.
  3. **No Nonce / Expiration:** Plans contain no `expiresAt` unix timestamp or per-user incremental nonce. An intercepted plan is theoretically valid indefinitely.

---

### **EXEC-01 [HIGH]: Specialist Execution Masked as Real Transactions**
- **File:** [`agent/app/agent/src/services/taskDelegator.ts`](file:///c:/Users/olusegun/.gemini/antigravity-ide/scratch/nairatag-bnb/agent/app/agent/src/services/taskDelegator.ts#L312-L332)
- **Functions:** `dispatchToSpecialist(plan, specialist)`
- **Mechanism:**
  ```typescript
  // Lines 313-331
  if (normTag === "bloom") {
    return {
      txHash: `0x51d9${randomUUID().replace(/-/g, "")}`,
      payload: {
        settlementStatus: "confirmed",
        amount: amt,
        currency: tok,
        routedTo: recipient,
        protocolRail: "NairaTagBountyEscrow / Arc USDC Memo Precompile",
        settlementLatencyMs: 420,
        confirmedBlock: 28410200,
      },
      deliverableUrl: `https://explorer.arc.io/tx/0x51d9${randomUUID().replace(/-/g, "").slice(0, 32)}`,
    };
  }
  ```
- **Impact:**
  `₦BLOOM` does not execute on-chain transactions or call smart contracts. It synthesizes a mock `txHash` and fake block number `28410200`. Describing this as "sub-second digital dollar settlement" is deceptive without a disclaimer that it is a **simulation harness**.

---

### **ID-01 [HIGH]: Orchestrator Bypasses `NairaTagAgentIDActivation` On-Chain Checks**
- **File:** [`agent/app/agent/src/services/orchestratorCore.ts`](file:///c:/Users/olusegun/.gemini/antigravity-ide/scratch/nairatag-bnb/agent/app/agent/src/services/orchestratorCore.ts#L195-L206)
- **Functions:** `resolveCaller(callerInput)`
- **Mechanism:**
  The orchestrator verifies caller credentials by calling `verifyAgentId({ address })`. That function checks the raw SPACE ID BEP-721 contract (`balanceOf > 0`).
  However, it **never checks `NairaTagAgentIDActivation.sol`**!
  It does not verify:
  1. Has the caller bound their `₦TAG` to their Agent ID via `activate(node)`?
  2. Does `activationContract.checkValidity(node)` return `ValidityStatus.VALID`?
  3. Is the tag deactivated, transferred, or revoked?
- **Impact:**
  A wallet holding an Agent ID who has never interacted with the NairaTag Protocol is treated as a "verified holder", while our own custom `NairaTagAgentIDActivation` contract remains unutilized in the live runtime decision tree.

---

### **HACK-01 [HIGH]: Lack of Real Participant Onboarding for 30+ Agent ID Requirement**
- **Hackathon Requirement:**
  > *"Agent Application Innovation Award requires a live product and at least 30 distinct Agent ID addresses interacting with participating contracts during the submission period."*
- **Mechanism & Current State:**
  - `NairaTagAgentIDActivation.sol` has only been tested in local Foundry fork tests using 1 impersonated address (`0xE077ab2259170199d398ec8d70D44d7dde1C6e06`).
  - The contracts are **not deployed on BNB Mainnet** (Chain ID 56).
  - No community outreach UI or gas-assisted onboarding flow exists for external Agent ID holders to claim a tag and activate it.
- **Impact:**
  Without 30 distinct real-world wallets executing `activate()` on Mainnet, the project is disqualified from the $29,000 Innovation Award regardless of technical code quality.

---

### **DATA-01 [MEDIUM]: External Data Oracles Return Static Mock Telemetry**
- **File:** [`agent/app/agent/src/services/taskDelegator.ts`](file:///c:/Users/olusegun/.gemini/antigravity-ide/scratch/nairatag-bnb/agent/app/agent/src/services/taskDelegator.ts#L334-L365)
- **Mechanism:**
  - `₦DEFILLAMA` returns hardcoded `tvlUsd: 1485290000`.
  - `₦METEO` returns hardcoded `temperatureC: 28.5`, `condition: "Partly Cloudy"`.
  - `₦COINGECKO` returns hardcoded `priceUsdc: "645.20"`.
- **Impact:**
  Specialist agent output is non-deterministic and static. An agent asking for live market data receives outdated hardcoded constants.

---

## 4. Specialist Execution Classification Table

| Specialist Tag | Declared Role | Transport Layer | Execution Reality | Classification |
|---|---|---|---|---|
| **`₦BLOOM`** | Sub-Second USDC Settlement & Escrow Release | Internal Handler | Generates mock tx hash (`0x51d9...`), fake block 28410200. No on-chain transfer. | **SIMULATED** |
| **`₦DEFILLAMA`** | Protocol TVL & Volume Feed | Internal Handler | Returns hardcoded JSON numbers. No HTTP request to `api.llama.fi`. | **MOCK** |
| **`₦METEO`** | Hyper-Local Weather Logistics | Internal Handler | Returns hardcoded JSON temperatures. No Open-Meteo API query. | **MOCK** |
| **`₦COINGECKO`** | DEX/CEX Spot Price Oracle | Internal Handler | Returns hardcoded $645.20 BNB price. No CoinGecko API query. | **MOCK** |
| **Third-Party Agents** | Dynamic Specialist Network | A2A JSON-RPC 2.0 (`message/send`) | Contains `fetch()` logic, but falls back to mock string if endpoint is missing. | **SIMULATED FALLBACK** |

---

## 5. Binance Skills Hub & Binance Agentic Wallet Integration Architecture

### 5.1 Overview of Official Binance Capabilities
Binance provides two distinct, modular agent integration layers:
1. **Binance Skills Hub (`github.com/binance/binance-skills-hub`):**
   - Open-source, MCP-compliant skills organized as directories containing `SKILL.md`.
   - **Read-Only Skills:** Market data, spot order books, trending tokens, smart-money signals, security checks. Accessible via public endpoints without user API keys.
   - **Authenticated Skills:** Spot trading, margin, futures orders. Requires scoped Binance API Key + Secret (must be injected via environment or secure keyrings; NEVER exposed to LLM prompts or chat logs).
2. **Binance Agentic Wallet (`binance-agentic-wallet`):**
   - Drives the `baw` CLI managing Binance Web3 MPC (Multi-Party Computation) keyless wallets.
   - Enforces off-chain guardrails (whitelisted addresses, daily spend caps, scoped transaction policies).

### 5.2 Provider-Neutral Skill Registry & Router Architecture
To ensure NairaTag remains an **open agent platform** rather than a single-vendor chatbot, we design a modular `SkillRegistry` and `SkillRouter`:

```
                               ┌───────────────────────────┐
                               │   ₦NAIRATAG ORCHESTRATOR  │
                               └─────────────┬─────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │   Skill Registry & Router │
                               └───────┬───────────┬───────┘
                                       │           │
                     ┌─────────────────┘           └─────────────────┐
                     ▼                                               ▼
         ┌───────────────────────┐                       ┌───────────────────────┐
         │ Public / Read Skills  │                       │ Sensitive Write Skills│
         │ - CoinGecko / Meteo   │                       │ - Binance Agentic Wlt │
         │ - Binance Market Data │                       │ - NairaTag Escrow     │
         │ - DeFiLlama TVL       │                       │ - Spot Trading (Auth) │
         └───────────┬───────────┘                       └───────────┬───────────┘
                     │                                               │
                     │ (Direct Execution)                            │ (Interactive Consent Gate)
                     ▼                                               ▼
         ┌───────────────────────┐                       ┌───────────────────────┐
         │ Immediate Execution   │                       │ EIP-712 / EIP-191     │
         │ Delivery Receipt      │                       │ Signed User Approval  │
         └───────────────────────┘                       └───────────────────────┘
```

#### Skill Classification Architecture:
1. **Public Read-Only (`SkillCategory.PUBLIC_READ`):**
   - Zero authentication required.
   - Immediate execution; no user confirmation dialog necessary.
   - Examples: Binance 24h Ticker, DeFiLlama TVL, Weather Logistics.
2. **Authenticated CEX (`SkillCategory.AUTHENTICATED_CEX`):**
   - Requires API credentials managed securely via environment or secure enclave.
   - Keys are NEVER in prompts, logs, or MCP tool parameters.
3. **Wallet / Value-Bearing (`SkillCategory.WALLET_WRITE`):**
   - Transacting native tokens or calling smart contracts.
   - **Mandatory EIP-712 User Signature:** Enforced by the `TaskDelegator` consent gate.

---

## 6. Prioritized Remediation Plan

### **Phase 1: Security Hardening (Immediate Prerequisite)**
1. **Implement Cryptographic EIP-712 / EIP-191 Verification in `TaskDelegator`:**
   - Define canonical `NairaTagAuthorization` typed-data struct:
     `{ planId, action, targetSpecialist, spendingLimit, currency, chainId, nonce, expiry }`.
   - Use viem's `verifyTypedData` or `recoverMessageAddress` to prove the `approvedBy` address signed the exact transaction parameters.
   - Reject any attempt where signature is missing, invalid, or expired.
2. **Persistent Replay Storage & Expiration:**
   - Replace in-memory `Set<string>` with a persistent storage adapter (e.g. JSON file in data dir or SQLite/KV).
   - Enforce a 15-minute validity window on all plans (`expiry < block.timestamp`).
3. **Connect `NairaTagAgentIDActivation` into Orchestrator:**
   - Update `orchestratorCore.ts` to call `checkValidity(node)` against the deployed activation contract.
   - Distinguish between "Wallet holds Agent ID" and "Tag is officially Activated on-chain".

### **Phase 2: Real Specialist Execution (Replacing Mocks)**
1. **Real Public Data Oracles:**
   - Wire `₦DEFILLAMA` to `https://api.llama.fi` (public, free, no keys needed).
   - Wire `₦COINGECKO` to Binance public ticker or CoinGecko public ping (real live prices).
   - Wire `₦METEO` to Open-Meteo public API (`api.open-meteo.com`).
2. **Real Blockchain Settlement Adapter for `₦BLOOM`:**
   - Clearly label sandbox mode as `[SIMULATION]` when running without funded execution keys.
   - Provide a live execution mode where `₦BLOOM` calls `NairaTagBountyEscrow` on BSC Testnet/Mainnet using the Agent Studio runtime wallet (`.studio/wallets`).

### **Phase 3: Hackathon 30+ Participant Onboarding Strategy**
1. **One-Click Activation dApp / CLI Script:**
   - Build a lightweight React / CLI onboarding interface (`apps/agent-id-onboarding`).
   - Connects to Rabby / MetaMask / Binance Web3 Wallet.
   - Checks user's wallet for SPACE ID Agent ID (`0x60B9...022F`).
   - If held: Claims their desired `₦TAG` in `NairaTagRegistry` and triggers `activate(node)` in `NairaTagAgentIDActivation` in a single batched or consecutive flow.
2. **Onboarding Campaign & Gas Sponsorship:**
   - With gas per activation at ~0.00007 BNB (~$0.04), a small gas subsidy or faucet can onboard 50+ real Agent ID holders within 48 hours of Mainnet deployment.
3. **Mainnet Broadcast Timing:**
   - Fund the deployer wallet (`0x961d16fD...14AA`) with 0.005 BNB **only after Phase 1 and Phase 2 are verified in code**.

---

## 7. Conclusion

Step 9 established a logical skeleton, but **it is not yet secure against forged consent, does not survive process restarts, and relies on simulated execution**.

By implementing real cryptographic EIP-712 consent, connecting live public data feeds, and launching a dedicated onboarding flow for 30+ Agent ID holders, NairaTag will transition from a simulated demo to the most secure, compliant, and innovative project in the Binance Wallet × BNB Chain Agent ID Hackathon.
