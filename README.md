# NairaTag on BNB Chain

NairaTag is open identity and AI agent infrastructure: **Your tag is your agent.**

This repository is dedicated exclusively to **BNB Smart Chain (BSC)** development, deployment, and Binance Wallet × BNB Chain Agent ID integration. It is completely independent from the existing multi-chain protocol repository.

> [!IMPORTANT]
> **BNB-Native Infrastructure Only**: This repository exclusively uses the official **BNB Agent Studio CLI (`bag` / `@bnbagent/studio-cli`)** and **BNB Agent SDK (`@bnbagent/sdk`)**. It does not use Celo or Arc Studio tools.

---

## 1. Architecture Boundaries

The architecture preserves clear boundaries:
- **NairaTag Identity**: Maps a normalized human-readable tag (`₦tag`) to an owner on BNB Chain.
- **Binance Agent ID**: Verified via `IBinanceAgentID.balanceOf(address)` against the official BEP-721 Soulbound registry.
- **Identity is not Authority**: Holding an Agent ID or NairaTag verifies identity tier; it does **not** grant unrestricted contract execution rights or payment authority.
- **BNB Agent Studio Runtime**: Autonomous agent runtime powered by `@bnbagent/studio-runtime` exposing composable public faces (A2A on port 9000, MCP on port 8000/mcp, and x402/B402 HTTP routes).

---

## 2. Network Configuration

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

## 3. Repository Structure

```
nairatag-bnb/
├── .env.example                         # Safe template with BSC Testnet RPC & PRIVATE_KEY
├── .github/workflows/contracts.yml      # Automated Foundry CI workflow
├── .gitignore                           # Ignores secrets, build artifacts, wallets
├── foundry.toml                         # solc 0.8.24, cancun, bsc_testnet RPC
├── README.md                            # Project documentation
├── src/                                 # Chain-neutral Solidity contracts
│   ├── NairaTagRegistry.sol             # Canonical namespace registry (1-tag rule, normalization)
│   ├── NairaTagResolver.sol             # Multi-coin, reverse resolution, and metadata resolver
│   └── interfaces/
│       ├── IERC165.sol                  # Standard ERC-165
│       ├── INairaTagRegistry.sol        # Registry interface
│       ├── INairaTagResolver.sol        # Resolver interface
│       └── IBinanceAgentID.sol          # Binance / SPACE ID Agent ID holder check
├── script/                              # Foundry deployment scripts
│   └── DeployNairaTag.s.sol             # BSC Testnet-guarded deployer (chainid == 97)
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
            ├── tools.ts                 # Read-only chain tools for the LLM
            └── dualMain.ts              # A2A + MCP entrypoint
```

---

## 4. Getting Started

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
