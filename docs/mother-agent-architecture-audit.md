# NairaTag Orchestrator Agent Architecture Audit

> **Project**: NairaTag on BNB Chain (`nairatag-bnb`)  
> **Central Orchestrator Tag**: `₦NAIRATAG` (Canonical Protocol Orchestrator)  
> **Core Motto**: *Your tag is your agent.*  
> **Status**: Step 7A Architecture & Systems Audit

---

## 1. Executive Summary & Vision

**NairaTag** is an open, sovereign AI agent economy natively anchored on **BNB Smart Chain (BSC)**. In this economy:
- Every user and agent claims a sovereign tag (`₦tag` / `@name`) through `NairaTagRegistry`.
- Tags resolve to payout addresses, execution wallets, and metadata via `NairaTagResolver`.
- The central orchestrator—**NairaTag** (`₦NAIRATAG`)—serves as the universal interface for users and autonomous agents: understanding natural language intent, discovering specialist agents, verifying identity tiers, delegating tasks, and coordinating multi-agent workflows.

### Architectural Law: Identity is not Authority
Throughout this system, we enforce strict separation between identity credentials and transaction execution:
- **Holding an identity (NairaTag or Binance Agent ID) verifies trust tier; it does NOT grant authorization to spend funds, approve escrow, or execute arbitrary transactions.**
- The execution wallet of an agent is decoupled from the owner's identity address that holds the Binance Agent ID token.

---

## 2. Deep-Dive Audit of Existing Codebase

### Question 1: How the current agent receives and processes requests
In `agent/app/agent/src/`:
- **Entrypoint**: [`dualMain.ts`](file:///C:/Users/olusegun/.gemini/antigravity-ide/scratch/nairatag-bnb/agent/app/agent/src/dualMain.ts) boots an Express HTTP server mounting three interfaces on the AgentCore microVM:
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
  - Read tools: `wallet_info`, `balance_native`, `balance_u`, `network_info`, `tx_status`, `agent_info`, `agent_by_address`, `job_status`, `job_list`, and the newly added `verify_agent_id`.

### Question 4: Whether the current runtime supports multi-agent orchestration
- **No.** The scaffolded project is exclusively a **single-seller worker**:
  - It only implements `AgentExecutor` for incoming requests.
  - It possesses no outbound A2A client to call other agents.
  - It has no buyer wallet client to fund jobs or negotiate with peer agents.
  - It lacks a task decomposition engine and workflow state store.

### Question 5: How the NairaTag Orchestrator can discover specialist agents
Specialist agents can be discovered through three complementary layers:
1. **On-Chain NairaTag Namespace**:
   - `NairaTagRegistry.ownerOf(node)` ensures tag exists and is claimed.
   - `NairaTagResolver.text(node, "agent.card_url")` or `paymentEndpoint(node)` yields the agent's live endpoint.
   - `NairaTagResolver.text(node, "agent.capabilities")` specifies machine-readable capabilities.
2. **ERC-8004 Registry**:
   - Built-in studio tools `agentInfo(agent_id)` and `agentByAddress(address)` read on-chain ERC-8004 metadata.
3. **Local / Managed Specialist Directory**:
   - Structured registry (e.g. `specialistCatalog.ts`) containing known first-party and verified ecosystem agents (`₦bloom`, `₦defillama`, `₦meteo`, `₦coingecko`) with baseline ratings and pricing.

### Question 6: Whether agents have structured capability descriptions
- Currently, capabilities are only described in English prose inside `agentCard.ts` (`skills: [NEGOTIATE, NOTIFY_FUNDED]`) and `studio.toml`.
- To support autonomous orchestration, a structured taxonomy (`SpecialistCapability`) is required (e.g., `defi.tvl_feed`, `market.price_oracle`, `weather.logistics`, `audit.code_security`).

### Question 7: How task delegation and task status are represented
- In `sellerCore.ts`, task status follows ERC-8183 states: `CREATED` -> `FUNDED` -> `SUBMITTED` -> `SETTLED` (or `DISPUTED`).
- However, there is no higher-level **Orchestration Task** model that tracks:
  - User Intent -> Task Decomposition -> Agent Selection -> User Authorization -> Delegation -> Progress -> Aggregation -> Deliverable Presentation.

### Question 8: How the existing NairaTag Registry & Resolver identify agents
The deployed contracts on BSC Testnet (`0x73434d12...` and `0x2ce440b6...`) provide native identity primitives:
- `registry.namehash(tag)`: Derives canonical `bytes32` node.
- `registry.owner(node)`: Returns sovereign tag owner address.
- `resolver.addr(node)`: Returns the primary payout / receiving EVM address.
- `resolver.text(node, key)`: Supports standard ENSIP-5 text records:
  - `agent.kind`: `"orchestrator" | "specialist"`
  - `agent.capabilities`: comma-separated capability list
  - `agent.identity_address`: address holding the Binance Agent ID
  - `agent.endpoint`: A2A / MCP / HTTP URL
- `resolver.paymentEndpoint(node)`: Direct x402 / payment URL.
- `resolver.name(reverseNode(address))`: Reverse-resolves EVM address back to `₦tag`.

### Question 9: Decoupling Agent ID verification from the execution wallet
The Agent Studio runtime wallet (`.studio/wallets`) is an **execution wallet** intended solely for automated signing and gas. The Binance Agent ID (SPACE ID BEP-721 Soulbound token) is typically held by the **agent owner's personal or multisig address**.

To avoid blindly checking the execution wallet:
```
Target Address to Verify = 
  resolver.text(node, "agent.identity_address") 
  || registry.owner(node) 
  || designatedOwnerAddress
```
This guarantees that an agent running on an ephemeral execution key can still present verifiable credentials belonging to its sovereign owner.

### Question 10: Implemented vs Scaffolded Status

| Component | Status | Details |
|---|---|---|
| **NairaTagRegistry** | ✅ Fully Deployed & Verified | `0x73434d121f46e188b7f12ef048062e79e5119cc3` on BSC Testnet |
| **NairaTagResolver** | ✅ Fully Deployed & Verified | `0x2ce440b6c63dc5e1128ab75ddac4d5da850de869` on BSC Testnet |
| **Binance Agent ID Verifier** | ✅ Fully Implemented & Tested | `agentIdVerifier.ts` (10/10 tests pass, live BSC Mainnet check verified) |
| **Read Tools & MCP Server** | ✅ Fully Implemented | `tools.ts`, `readToolCatalog.ts`, `mcpMain.ts` |
| **Agent Studio Runtime** | ⚙️ Scaffolded Worker | Configured for BSC Testnet, Pieverse LLM, ERC-8183 Seller |
| **Orchestrator Engine** | 🔲 Not Yet Implemented | Multi-agent planner, agent discovery, task delegation |
| **User Payment Authorization** | 🔲 Not Yet Implemented | Explicit user confirmation gate before initiating paid escrow |

---

## 3. Proposed NairaTag Orchestrator Architecture

The **NairaTag Orchestrator** (`₦NAIRATAG`) wraps the existing runtime with an orchestration layer:

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
│  │ Intent Classifier &   │──▶│  Agent Discovery &     │──▶│ Identity Verifier  │  │
│  │ Task Decomposition    │   │  Capability Matcher    │   │ (NairaTag + SPACE) │  │
│  └───────────────────────┘   └────────────────────────┘   └────────────────────┘  │
│                                           │                                       │
│                                           ▼                                       │
│                              ┌────────────────────────┐                           │
│                              │  Authorization Gate    │◀── User Confirmation     │
│                              │  (Identity ≠ Authority)│                           │
│                              └────────────┬───────────┘                           │
│                                           │                                       │
│                                           ▼                                       │
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

### Proposed Core Tools

1. **`discover_agents(filter: { category?, capability?, minTier? })`**
   - Discovers registered agents matching the required skills from on-chain resolver records and specialist directory.
2. **`get_agent_profile(tagOrAddress: string)`**
   - Returns structured profile: Tag, Owner, Identity Address, Execution Wallet, Verified Tier, Capabilities, Endpoints, Rate.
3. **`verify_agent_identity(tagOrAddress: string, network?: string)`**
   - Leverages `agentIdVerifier.ts` to verify the designated identity address on BSC Mainnet (`0x60b9...`).
4. **`delegate_task(targetTag: string, taskSpec: { task, terms, budget })`**
   - Formats task according to A2A / ERC-8183 protocol and dispatches to specialist agent endpoint.
5. **`get_task_status(delegationId: string)`**
   - Checks delivery progress, on-chain escrow state, or A2A response artifacts.
6. **`coordinate_agents(workflow: { steps: WorkflowStep[] })`**
   - Sequentially or in parallel executes dependent agent tasks and aggregates results.
7. **`request_payment_authorization(quote: { recipientTag, amount, token, reason })`**
   - Enforces the user approval boundary before moving funds or locking escrow.

---

## 4. Communication & Protocol Model

| Interaction | Protocol | Transport | Security |
|---|---|---|---|
| User ↔ NairaTag Orchestrator | Natural Language + Structured Actions | Web Chat / REST / MCP | Session Token |
| NairaTag ↔ Specialist Agent | A2A (Agent-to-Agent) | JSON-RPC 2.0 over HTTP | Bearer JWT / EIP-191 Quote |
| Tool Invocation | MCP (Model Context Protocol) | Streamable HTTP (`/mcp`) | Stateful Session ID |
| Micro-payments | x402 / B402 | HTTP 402 Payment Required | On-chain settlement receipt |
| Bounties & Large Tasks | ERC-8183 Escrow | Smart Contract (`lock` -> `submit` -> `release`) | On-chain contract state |

---

## 5. Practical Implementation Sequence (Step 7B & Beyond)

1. **Step 7B: Specialist Agent Directory & Profile Service**
   - Build `specialistDirectory.ts` and `agentProfileService.ts`.
   - Wire tag resolution (`NairaTagResolver`) with identity verification (`agentIdVerifier.ts`).
2. **Step 7C: Outbound A2A Delegation Client**
   - Build lightweight A2A client helper to send tasks to specialist agents (`negotiate` and `notify_funded`).
3. **Step 7D: Orchestrator Core & Conversational Planner**
   - Implement orchestrator loop in `orchestratorCore.ts` to handle plain natural-language requests, plan steps, and coordinate specialist responses.
4. **Step 7E: User Authorization Gate**
   - Implement explicit budget confirmation step before broadcasting payment or escrow transactions.

---

## 6. Risks & Unresolved Decisions

1. **Testnet Mock Agents vs Live Endpoints**:
   - On testnet, specialist agents must have mock endpoints or local loopback instances so delegation can be verified deterministically in tests.
2. **Cognito Requirement on AgentCore**:
   - In production on AWS AgentCore, inbound A2A requires Cognito tokens. Locally and on testnet, open/bearer auth must be supported.
3. **Escrow Contract Deployment on BSC Testnet**:
   - `NairaTagRegistry` and `NairaTagResolver` are deployed and verified. For task escrow, `NairaTagBountyEscrow` or standard ERC-8183 router will be needed when testing live task funding.

---

*Audit completed and verified against test suite (10/10 tests pass).*
