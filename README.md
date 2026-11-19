# NairaTag on BNB Chain

NairaTag is open identity and AI agent infrastructure: **Your tag is your agent.**

This repository is dedicated exclusively to **BNB Smart Chain (BSC)** development, deployment, and Binance Wallet × BNB Chain Agent ID integration. It is completely independent from the existing multi-chain protocol repository.

> [!IMPORTANT]
> **BNB-Native Infrastructure Only**: This repository exclusively uses the official **BNB Agent Studio CLI (`bag` / `@bnbagent/studio-cli`)** and **BNB Agent SDK (`@bnbagent/sdk`)**. It does not use Celo or Arc Studio tools.

---

## 1. Verified Deployments on BSC Testnet (`Chain ID: 97`)

All core contracts are compiled, tested, deployed, and **publicly verified (with green checkmark)** on BNB Smart Chain Testnet:

| Contract | Testnet Address | Source Verification | Compiler | Optimization | Block | Explorer |
|---|---|---|---|---|---|---|
| **NairaTagRegistry** | `0x73434d121f46e188b7f12ef048062e79e5119cc3` | ✅ **Verified** | `v0.8.38` (commit `1835d247`) | 200 runs | `143583829` | [BscScan Source](https://testnet.bscscan.com/address/0x73434d121f46e188b7f12ef048062e79e5119cc3#code) |
| **NairaTagResolver** | `0x2ce440b6c63dc5e1128ab75ddac4d5da850de869` | ✅ **Verified** | `v0.8.38` (commit `1835d247`) | 200 runs | `143583841` | [BscScan Source](https://testnet.bscscan.com/address/0x2ce440b6c63dc5e1128ab75ddac4d5da850de869#code) |

---

## 2. Architecture: NairaTag Identity vs Binance Agent ID

NairaTag agents possess two complementary identity layers:

```
┌────────────────────────────────────────────────────────┐
│                   NAIRATAG AGENT                       │
├────────────────────────────┬───────────────────────────┤
│    Native Sovereign ID     │  External Credential ID   │
│       (NairaTag Tag)       │     (Binance Agent ID)    │
│  e.g. ₦bloom / @nairatag   │   SPACE ID AI NFT (0x60b) │
│     BSC Testnet / Mainnet  │         BSC Mainnet       │
│  Maps tag -> EVM address   │  balanceOf(address) > 0   │
└────────────────────────────┴───────────────────────────┘
```

### Identity Comparison

| Property | NairaTag Protocol Identity (`₦tag`) | Binance / SPACE ID Agent ID |
|---|---|---|
| **Form** | Human-readable sovereign tag (`₦tag` / `@name`) | BEP-721 Soulbound Token (Symbol: `AI`) |
| **Contract** | `NairaTagRegistry` (`0x73434d12...`) | `SPACE ID Agent ID` (`0x60b9262456de...`) |
| **Network** | BSC Testnet (`97`) & BSC Mainnet (`56`) | BSC Mainnet (`56`) only |
| **What it Proves** | Sovereign address mapping, payment routing & escrow endpoint | External developer/agent verification credential |
| **Verification Method** | `registry.ownerOf(node)` / `resolver.addr(node)` | `balanceOf(address) > 0` |
| **Role in Agent Economy**| Transaction routing, pay-to-tag, escrow payouts | Credential tier gate (`verified` vs `unverified`) |

### Core Rule: Identity is not Authority
- Holding an Agent ID verifies that an entity completed Binance / SPACE ID identity onboarding.
- Holding an Agent ID does **not**:
  - Authorize transfers or approvals of funds.
  - Grant unrestricted contract permissions.
  - Override NairaTag namespace ownership or transfer tags.
  - Bypass ERC-8183 / NairaTag escrow delivery and dispute conditions.
  - Automatically execute transactions without explicit signing logic.

### Why Testnet Returns `not_deployed`
The official SPACE ID Agent ID contract (`0x60b9262456de011f7d15a54cdd8c48baaa8b022f`) is deployed exclusively on **BSC Mainnet (Chain ID 56)**.
- On **BSC Testnet (Chain ID 97)**: `eth_getCode` returns `0x`. Rather than deploying an unofficial substitute or faking verification, `verify_agent_id` returns `verificationTier: "not_deployed"` and `contractAvailable: false`.
- On **BSC Mainnet (Chain ID 56)**: `verify_agent_id` verifies contract bytecode (17,514 bytes) and calls `balanceOf(address)` via viem public client, returning `verified` or `unverified`.

---

## 3. Network Configuration

| Setting | Value |
|---|---|
| **Network** | BNB Smart Chain Testnet |
| **Chain ID** | `97` |
| **Currency** | `tBNB` |
| **RPC** | `https://bsc-testnet-dataseed.bnbchain.org` |
| **Explorer** | `https://testnet.bscscan.com` |

> [!NOTE]
> The Binance / SPACE ID Agent ID contract (`0x60b9262456de011f7d15a54cdd8c48baaa8b022f`) is deployed on **BSC Mainnet (Chain ID 56)**. For BSC Testnet (Chain ID 97), the Agent ID contract address is dynamically configurable via `IBinanceAgentID` and environment variables.

---

## 4. Repository Structure

```
nairatag-bnb/
├── .env.example                         # Safe template with BSC Testnet RPC & PRIVATE_KEY
├── .github/workflows/contracts.yml      # Automated Foundry CI workflow
├── .gitignore                           # Ignores secrets, build artifacts, wallets
├── foundry.toml                         # solc 0.8.24, cancun, bsc_testnet RPC
├── README.md                            # Project documentation
├── deployments/
│   └── bsc-testnet.json                 # Verified on-chain contract addresses and tx hashes
├── src/                                 # Chain-neutral Solidity contracts
│   ├── NairaTagRegistry.sol             # Canonical namespace registry (1-tag rule, normalization)
│   ├── NairaTagResolver.sol             # Multi-coin, reverse resolution, and metadata resolver
│   └── interfaces/
│       ├── IERC165.sol                  # Standard ERC-165
│       ├── INairaTagRegistry.sol        # Registry interface
│       ├── INairaTagResolver.sol        # Resolver interface
│       └── IBinanceAgentID.sol          # Binance / SPACE ID Agent ID holder check
├── script/                              # Deployment and verification scripts
│   ├── DeployNairaTag.s.sol             # Foundry BSC Testnet script
│   ├── deploy-bsc-testnet.cjs           # On-chain deployment script
│   └── verify-contracts.cjs             # BscScan / Etherscan API V2 automated contract verifier
├── test/                                # Foundry unit tests
│   └── NairaTagProtocol.t.sol           # Core protocol unit tests
└── agent/                               # Official BNB Agent Studio seller agent project
    ├── package.json                     # Workspace root
    ├── pnpm-workspace.yaml
    ├── AGENTS.md                        # Generated agent safety rules
    └── app/agent/
        ├── studio.toml                  # BSC Testnet, Pieverse LLM, ERC-8183, x402 config
        ├── package.json                 # Depends on @bnbagent/studio-runtime & @bnbagent/sdk
        └── src/
            ├── sellerCore.ts            # ERC-8183 seller logic & delivery
            ├── signing.ts               # Fixed-code signing path (never LLM-callable)
            ├── tools.ts                 # Read-only chain tools (includes verify_agent_id)
            ├── readToolCatalog.ts       # Tool descriptions & Zod schemas
            ├── mcpMain.ts               # Streamable-HTTP MCP server exposing read tools
            ├── dualMain.ts              # A2A + MCP entrypoint
            └── services/
                └── agentIdVerifier.ts   # Official SPACE ID Agent ID verifier
    └── test/
        └── agentIdVerifier.test.mjs     # 10 comprehensive unit & integration tests
```

---

## 5. Getting Started

### Smart Contracts (Foundry)

```bash
# Run unit tests
forge test

# Prepare deployment to BSC Testnet (chain 97)
forge script script/DeployNairaTag.s.sol:DeployNairaTag \
  --rpc-url bsc_testnet --broadcast
```

### BNB Agent Studio (`bag` CLI)

The agent runtime is managed via `@bnbagent/studio-cli`:

```bash
# Install the official CLI
npm install --global @bnbagent/studio-cli

# Navigate to agent directory
cd agent

# Diagnose configuration and environment
bag doctor

# Run the agent locally
bag dev
```

---

## 6. BNB Smart Chain Mainnet Deployment (`Chain ID: 56`)

The deployment stack for BNB Smart Chain Mainnet deploys NairaTag's sovereign naming registry, multi-coin resolver, and the official SPACE ID Agent ID on-chain activation contract.

### Core Contracts to Deploy

1. **`NairaTagRegistry`**: Canonical namespace registry (NTS-100 normalization, anti-squatting 1-tag limit).
2. **`NairaTagResolver`**: Multi-coin, text metadata, and forward/reverse address resolution.
3. **`NairaTagAgentIDActivation`**: On-chain verification and sovereign tag binding for official SPACE ID Agent ID holders (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`).

### Preflight & Deployment Commands

```bash
# 1. Inspect prerequisites, derive deployer, check gas price & balance
node script/preflight-mainnet.cjs

# 2. Deploy contracts (requires CONFIRM_MAINNET_BROADCAST=true)
CONFIRM_MAINNET_BROADCAST=true node script/deploy-bsc-mainnet.cjs

# 3. Verify all 3 contracts on BscScan
node script/verify-mainnet-contracts.cjs
```

For comprehensive details on safety gates, atomic resumption, and compiler settings, see [BNB Mainnet Deployment Guide](docs/bnb-mainnet-deployment-guide.md).

