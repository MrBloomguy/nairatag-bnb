# NairaTag Orchestrator Agent Architecture Audit

> **Project**: NairaTag on BNB Chain (`nairatag-bnb`)  
> **Central Orchestrator Tag**: `₦NAIRATAG` (Canonical Protocol Orchestrator)  
> **Core Motto**: *Your tag is your agent.*  
> **Status**: Step 7A Architecture & Systems Audit (Approved with Corrections)

---

## 1. Executive Summary & Vision

**NairaTag** is an open, sovereign AI agent economy natively anchored on **BNB Smart Chain (BSC)**. In this economy:
- Every user and agent claims a sovereign tag (`₦TAG`) through `NairaTagRegistry`.
- Tags resolve to payout addresses, execution wallets, and metadata via `NairaTagResolver`.
- The central orchestrator—**NairaTag** (`₦NAIRATAG`)—serves as the universal interface for users and autonomous agents: understanding natural language intent, discovering specialist agents, verifying identity tiers, delegating tasks, and coordinating multi-agent workflows.

### Architectural Law: Identity is not Authority
Throughout this system, we enforce strict separation between identity credentials and transaction execution:
- **Holding an identity (NairaTag or Binance Agent ID) verifies trust tier; it does NOT grant authorization to spend funds, approve escrow, or execute arbitrary transactions.**
- The execution wallet of an agent is decoupled from the owner's identity address that holds the Binance Agent ID token.
- No automated asset movement or unapproved escrow allocation is ever executed without explicit, user-visible signature confirmation.

---

## 2. The 8-Layer Separation of Concerns

To ensure modularity, security, and extensibility across BNB Chain and future networks, the NairaTag architecture strictly decouples responsibilities across eight distinct layers:

| Layer | Component | Responsibility |
|---|---|---|
| **1. Registry** | `NairaTagRegistry.sol` | Sovereign ownership of the tag namespace; maps `bytes32` node hashes to owner addresses and resolvers. |
| **2. Resolver** | `NairaTagResolver.sol` | Cryptographic forward/reverse address resolution and ENSIP-5 text metadata for specific claimed nodes. |
| **3. Agent Directory** | `SpecialistAgentDirectory` | Open, searchable index that categorizes and discovers available specialist agents based on capabilities, availability, and pricing. |
| **4. Identity Verification** | `agentIdVerifier` | Verifies external trust credentials (e.g., official Binance SPACE ID Agent ID BEP-721 token on BNB Mainnet). |
| **5. Orchestrator** | `NairaTag Orchestrator` (`₦NAIRATAG`) | Understands natural language requests, plans multi-step workflows, selects agents, and coordinates cross-agent tasks. |
| **6. A2A Communication** | `A2A Protocol / JSON-RPC 2.0` | Standardized inter-agent protocol for exchanging quotes, task payloads, and deliverables between agents. |
| **7. Authorization Boundary** | `PaymentAuthorizationGate` | Enforces explicit, user-visible confirmation before any asset movement or smart contract escrow commitment. |
| **8. Execution** | `Execution Wallet / Escrow` | Executes approved on-chain transactions (escrow locking, settlement, token transfers) via verified contracts. |

---

## 3. Critical Architectural Distinctions

### A. Resolution vs. Discovery
There is a fundamental difference between **Resolution** and **Discovery**:
- **Resolution (`NairaTagResolver`)**: Given a specific tag (e.g., `₦BLOOM`), retrieve its payout address, endpoint, and text metadata. A resolver is point-to-point and does not enumerate all registered agents.
- **Discovery (`SpecialistAgentDirectory`)**: Given a user requirement (e.g., *"Find a specialist agent to verify a smart contract"* or *"Find a weather logistics agent"*), discover all registered agents that advertise and provide that capability.

The **Agent Directory** bridges this gap: it indexes agents from on-chain registration events, maintains capability schemas, tracks availability, and enables semantic search for the Orchestrator.

### B. Trustworthy Identity Records & Anti-Spoofing
How do we ensure text records (such as `agent.identity_address`, `agent.endpoint`, `agent.capabilities`) are trustworthy?

1. **On-Chain Write Authorization**:
   - In `NairaTagResolver.sol`, the modifier `onlyAuthorized(node)` enforces:
     ```solidity
     bool isTagOwner = registry.owner(node) == msg.sender;
     bool isOwnReverseNode = reverseNode(msg.sender) == node;
     if (!isTagOwner && !isOwnReverseNode) revert Unauthorized();
     ```
   - Only the current owner of the tag node in `NairaTagRegistry` can set text records, EVM addresses, or payment endpoints.
2. **Handling Tag Ownership Transfers**:
   - If tag ownership is transferred in `NairaTagRegistry`, the previous owner instantly loses write permissions on the resolver.
   - The directory indexer observes `Transfer(node, owner)` events on the registry, automatically invalidating stale profiles until the new owner affirms or updates their records.
3. **Preventing Identity Spoofing (Dual-Sided Verification)**:
   - A malicious tag owner could set `agent.identity_address` to someone else's prominent wallet to falsely claim their Binance Agent ID credential.
   - To prevent spoofing, the verification service mandates **Dual-Sided Cryptographic Verification**:
     - *Condition 1*: The tag owner designates `agent.identity_address` in the resolver.
     - *Condition 2*: The designated identity address must cryptographically sign a binding payload (EIP-712 or signed authorization message) or be the caller himself, proving that the identity holder consents to being bound to this sovereign tag.

---

## 4. Deep-Dive Audit of Existing Codebase

### Question 1: How the current agent receives and processes requests
In `agent/app/agent/src/`:
- **Entrypoint**: [`dualMain.ts`](file:///C:/Users/olusegun/.gemini/antigravity-ide/scratch/nairatag-bnb/agent/app/agent/src/dualMain.ts) boots an Express HTTP server mounting five interfaces on the AgentCore microVM:
  1. `/.well-known/agent-card.json` (A2A AgentCard discovery)
  2. `/` (A2A JSON-RPC 2.0 endpoint for `message/send`)
  3. `GET /ping` (AgentCore healthcheck contract; returns `HEALTHY_BUSY` when tasks run)
  4. `/mcp` (Streamable-HTTP transport for Model Context Protocol)
  5. `/x402` (B402 HTTP seller gateway for HTTP 402 micro-payments)
- **Processing Flow**:
  - Inbound A2A messages enter [`executor.ts`](file:///C:/Users/olusegun/.gemini/antigravity-ide/scratch/nairatag-bnb/agent/app/agent/src/executor.ts) (`SellerAgentExecutor.execute`).
  - Expects a structured `DataPart` containing a `skill` property.
  - Dispatches to either:
    - `negotiate`: Fixed quote pricing from `studio.toml` (`signing.ts` `signQuote`).
    - `notify_funded`: Verifies on-chain deposit, immediately ACKs `accepted`, and triggers background delivery (`runWork` -> LLM generateText -> `signing.submitResult`).
  - **Limitation**: Plain-text / free-form conversational messages are rejected with `unknown skill: undefined`. The scaffolded worker has no conversational planner or multi-turn reasoning loop.

### Question 2: How A2A communication works
- Implemented via `@a2a-js/sdk` and `@a2a-js/sdk/server/express`.
- Client agents issue JSON-RPC 2.0 calls (`method: "message/send"`) passing a message envelope with `TextPart` or `DataPart`.
- In production, A2A on AWS AgentCore mandates OAuth2 bearer authentication via Cognito (`agentCard.ts`).
- Locally, `bag dev` runs in open mode for local testing.

### Question 3: How MCP tools are exposed
- Implemented via `@modelcontextprotocol/sdk` on `/mcp`.
- Session state is tracked via the `Mcp-Session-Id` header.
- In [`mcpMain.ts`](file:///C:/Users/olusegun/.gemini/antigravity-ide/scratch/nairatag-bnb/agent/app/agent/src/mcpMain.ts), tools are registered via `server.registerTool(...)`.
- Exposes all catalog tools:
  - Commerce tools: `negotiate`, `notify_funded`.
  - Read tools: `wallet_info`, `balance_native`, `balance_u`, `network_info`, `tx_status`, `agent_info`, `agent_by_address`, `job_status`, `job_list`, and `verify_agent_id`.

### Question 4: Whether the current runtime supports multi-agent orchestration
- **No.** The scaffolded project is exclusively a **single-seller worker**:
  - It only implements `AgentExecutor` for incoming requests.
  - It possesses no outbound A2A client to call other agents.
  - It has no buyer wallet client to fund jobs or negotiate with peer agents.
  - It lacks a task decomposition engine and workflow state store.

### Question 5: How the NairaTag Orchestrator discovers specialist agents
Specialist agents are discovered through the open **Specialist Agent Directory**:
1. **On-Chain NairaTag Namespace**:
   - `NairaTagRegistry.owner(node)` verifies the tag is claimed.
   - `NairaTagResolver.text(node, "agent.endpoint")` or `paymentEndpoint(node)` yields live endpoints.
   - `NairaTagResolver.text(node, "agent.capabilities")` specifies advertised skills.
2. **Open Directory Registry**:
   - Dynamic registration interface where third-party agents publish capability manifests, endpoints, pricing, and protocol compatibility.
3. **ERC-8004 Registry**:
   - Built-in studio tools `agentInfo(agent_id)` and `agentByAddress(address)` read on-chain ERC-8004 metadata.

### Question 6: Structured capability descriptions
- To support autonomous orchestration, a structured taxonomy (`SpecialistCapability`) is established:
  - Category: `defi`, `market`, `weather`, `security`, `logistics`, `general`
  - Methods: input/output JSON schemas, required tokens, estimated latency
  - Pricing: Fixed per-call, dynamic quote, or escrow milestone

### Question 7: Decoupling Agent ID verification from the execution wallet
The Agent Studio runtime wallet (`.studio/wallets`) is an **execution wallet** intended solely for automated signing and gas. The Binance Agent ID (SPACE ID BEP-721 Soulbound token) is held by the **agent owner's personal or identity address**.

```
Target Address to Verify = 
  resolver.text(node, "agent.identity_address") 
  || registry.owner(node) 
  || designatedOwnerAddress
```
This ensures an agent operating on an ephemeral execution key can verifiably present the credentials of its sovereign owner.

---

## 5. Proposed NairaTag Orchestrator Architecture

The **NairaTag Orchestrator** (`₦NAIRATAG`) wraps the runtime with an orchestration and delegation layer:

```
                          ┌──────────────────────────┐
                          │       USER / CLIENT      │
                          └─────────────┬────────────┘
                                        │ (Natural language intent)
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                           NAIRATAG ORCHESTRATOR (₦NAIRATAG)                       │
│                                                                                   │
│  ┌───────────────────────┐   ┌────────────────────────┐   ┌────────────────────┐  │
│  │ Intent Classifier &   │──▶│ Specialist Directory & │──▶│ Identity Verifier  │  │
│  │ Workflow Planner      │   │ Capability Matcher     │   │ (Agent ID / Tier)  │  │
│  └───────────────────────┘   └────────────────────────┘   └────────────────────┘  │
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │                AUTHORIZATION GATE (Identity is not Authority)               │  │
│  │       Requests explicit user confirmation before any fund transfer          │  │
│  └──────────────────────────────────────┬──────────────────────────────────────┘  │
│                                         │ (User Confirmed)                        │
│                                         ▼                                         │
│                              ┌────────────────────────┐                           │
│                              │ Task Delegation Engine │                           │
│                              │ (A2A Client / Escrow)  │                           │
│                              └────────────────────────┘                           │
└───────────────────────────────────────────┬───────────────────────────────────────┘
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               │                            │                            │
               ▼                            ▼                            ▼
      ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
      │     ₦BLOOM      │          │   ₦DEFILLAMA    │          │     ₦METEO      │
      │ Sub-second Pay  │          │  DeFi TVL Feed  │          │Weather Logistics│
      └─────────────────┘          └─────────────────┘          └─────────────────┘
```

---

## 6. Practical Implementation Sequence (Step 7B & Beyond)

1. **Step 7B: Specialist Agent Directory & Profile Service**
   - Build an open `specialistDirectory.ts` and `agentProfileService.ts`.
   - Support open agent registration (not hardcoded), structured capability profiles, availability tracking, and resolver metadata binding.
   - Include reference test agents (`₦BLOOM`, `₦DEFILLAMA`, `₦METEO`, `₦COINGECKO`) to validate discovery.
2. **Step 7C: Agent ID Application Integration & On-Chain Interaction**
   - Connect `agentIdVerifier.ts` to the onboarding and registration flow.
   - Design the on-chain interaction for Agent ID holders on BNB Mainnet (`claimWithAgentId`).
3. **Step 7D: NairaTag Orchestrator Core & A2A Delegation Client**
   - Implement orchestrator loop to handle natural language requests, plan steps, and delegate to specialist agents via A2A.
4. **Step 7E: User Authorization Gate**
   - Implement explicit budget and transaction confirmation before broadcasting payment or escrow transactions.

---

*Audit document updated, verified, and aligned with hackathon requirements.*
