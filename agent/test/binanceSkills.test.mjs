import test from "node:test";
import assert from "node:assert/strict";
import {
  globalSkillRegistry,
  SkillRegistry,
} from "../app/agent/src/services/skills/skillRegistry.js";
import {
  globalSkillRouter,
  SkillRouter,
} from "../app/agent/src/services/skills/skillRouter.js";

// ==========================================
// 1. Skill Discovery & Catalog Tests
// ==========================================

test("1.1. Skill Registry: Discover Binance Skills Hub & Agentic Wallet Capabilities", async (t) => {
  const registry = globalSkillRegistry;
  const allSkills = registry.listSkills();

  assert.ok(allSkills.length >= 5, "Expected at least 5 registered Binance skills");

  // Verify core IDs exist
  assert.ok(registry.hasSkill("binance.market.ticker"));
  assert.ok(registry.hasSkill("binance.market.depth"));
  assert.ok(registry.hasSkill("binance.token.security"));
  assert.ok(registry.hasSkill("binance.wallet.balance"));
  assert.ok(registry.hasSkill("binance.wallet.transfer"));

  // Check categories
  const marketSkills = registry.listSkills({ category: "market" });
  assert.equal(marketSkills.length, 2);

  const walletSkills = registry.listSkills({ category: "wallet" });
  assert.equal(walletSkills.length, 2);

  const securitySkills = registry.listSkills({ category: "security" });
  assert.equal(securitySkills.length, 1);

  // Check consent filters: only financial execution requires user consent
  const consentRequired = registry.listSkills({ requiresUserConsent: true });
  assert.equal(consentRequired.length, 1);
  assert.equal(consentRequired[0].id, "binance.wallet.transfer");

  const readOnlySkills = registry.listSkills({ requiresUserConsent: false });
  assert.ok(readOnlySkills.length >= 4);

  // Search by keyword
  const searchResults = registry.searchSkills("ticker");
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].id, "binance.market.ticker");
});

// ==========================================
// 2. Binance Skills Hub: Live Market Data Tests
// ==========================================

test("2.1. Binance Market Ticker: Live Spot & 24hr Metrics Query (BNBUSDT)", async (t) => {
  const res = await globalSkillRouter.executeSkill("binance.market.ticker", {
    symbol: "BNBUSDT",
  });

  assert.equal(res.success, true);
  assert.equal(res.skillId, "binance.market.ticker");
  assert.ok(res.data, "Expected data payload");
  assert.equal(res.data.symbol, "BNBUSDT");
  assert.ok(parseFloat(res.data.price) > 0, "Price should be positive number");
  assert.ok(parseFloat(res.data.highPrice) >= parseFloat(res.data.lowPrice));
  assert.ok(res.data.volume, "Volume should exist");
  assert.match(res.metadata.source, /Binance Public REST API/i);
});

test("2.2. Binance Market Ticker: In-Memory TTL Cache Hit", async (t) => {
  // First query (warms cache)
  const res1 = await globalSkillRouter.executeSkill("binance.market.ticker", {
    symbol: "BTCUSDT",
  });
  assert.equal(res1.success, true);

  // Second query (should hit cache)
  const res2 = await globalSkillRouter.executeSkill("binance.market.ticker", {
    symbol: "BTCUSDT",
  });
  assert.equal(res2.success, true);
  assert.equal(res2.classification, "CACHED");
  assert.equal(res2.metadata.cached, true);
  assert.equal(res2.data.symbol, "BTCUSDT");
  assert.equal(res2.data.price, res1.data.price);
});

test("2.3. Binance Market Ticker: Non-Existent Symbol Error Handling", async (t) => {
  const res = await globalSkillRouter.executeSkill("binance.market.ticker", {
    symbol: "INVALIDPAIRXYZ999",
  });

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "SYMBOL_NOT_FOUND");
  assert.match(res.error?.message || "", /not found on Binance/i);
});

test("2.4. Binance Orderbook Depth: Liquidity & Spread Analysis", async (t) => {
  const res = await globalSkillRouter.executeSkill("binance.market.depth", {
    symbol: "BNBUSDT",
    limit: 5,
  });

  assert.equal(res.success, true);
  assert.equal(res.skillId, "binance.market.depth");
  assert.ok(res.data.bids.length > 0);
  assert.ok(res.data.asks.length > 0);
  assert.ok(parseFloat(res.data.bestAsk) >= parseFloat(res.data.bestBid));
  assert.ok(parseFloat(res.data.spread) >= 0);
  assert.ok(parseFloat(res.data.bidDepthTotal) > 0);
});

// ==========================================
// 3. Binance Skills Hub: Token Security Scan
// ==========================================

test("3.1. Binance Token Security: Verified Blue-Chip Token Audit (WBNB)", async (t) => {
  const wbnb = "0xbb4CdB9CBD36B01bD1cBaEBF2De08d9173bc095c";
  const res = await globalSkillRouter.executeSkill("binance.token.security", {
    tokenAddress: wbnb,
  });

  assert.equal(res.success, true);
  assert.equal(res.skillId, "binance.token.security");
  assert.equal(res.data.riskLevel, "LOW");
  assert.equal(res.data.securityScore, 99);
  assert.equal(res.data.isHoneypot, false);
  assert.equal(res.data.buyTaxPercent, 0);
  assert.equal(res.data.sellTaxPercent, 0);
  assert.match(res.data.verdict, /Verified top-tier asset/i);
});

test("3.2. Binance Token Security: BSC Testnet USDC Contract Audit", async (t) => {
  const usdcTestnet = "0x64544969ed7EBf5f083679233325356EbE738930";
  const res = await globalSkillRouter.executeSkill("binance.token.security", {
    tokenAddress: usdcTestnet,
    chainId: 97,
  });

  assert.equal(res.success, true);
  assert.equal(res.data.riskLevel, "LOW");
  assert.equal(res.data.isHoneypot, false);
});

test("3.3. Binance Token Security: Malformed Address Rejection", async (t) => {
  const res = await globalSkillRouter.executeSkill("binance.token.security", {
    tokenAddress: "not-an-address",
  });

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "INVALID_PARAMETERS");
});

// ==========================================
// 4. Binance Agentic Wallet: Balance & Transfer
// ==========================================

test("4.1. Binance Wallet Balance: Read-Only Query (No Consent Required)", async (t) => {
  const targetWallet = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const res = await globalSkillRouter.executeSkill(
    "binance.wallet.balance",
    {
      address: targetWallet,
    },
    {
      testSeam: {
        balanceResponse: {
          address: targetWallet,
          nativeBalance: "1.25",
          nativeSymbol: "tBNB",
          tokenBalances: [{ symbol: "USDC", contractAddress: "0x6454...", balance: "50.0", decimals: 18 }],
          network: "bsc-testnet",
          chainId: 97,
        },
      },
    }
  );

  assert.equal(res.success, true);
  assert.equal(res.data.nativeBalance, "1.25");
  assert.equal(res.data.tokenBalances[0].symbol, "USDC");
});

test("4.2. Binance Wallet Transfer: Blocked Without User Cryptographic Authorization", async (t) => {
  const sender = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  // Attempt transfer WITHOUT authorization context
  const res = await globalSkillRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender,
      recipient,
      amount: "2.5",
      token: "USDC",
    },
    {
      callerAddress: sender,
      authorization: { isAuthorized: false },
    }
  );

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "UNAUTHORIZED_FINANCIAL_ACTION");
  assert.match(res.error?.message || "", /strictly requires interactive user cryptographic authorization/i);
});

test("4.3. Binance Wallet Transfer: Mismatched Approver vs Sender is Blocked", async (t) => {
  const sender = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const attacker = "0x59c6995e998f97a5a0044966f0945389dc9e86da";
  const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  const res = await globalSkillRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender,
      recipient,
      amount: "2.5",
      token: "USDC",
    },
    {
      callerAddress: sender,
      authorization: {
        isAuthorized: true,
        approvedBy: attacker,
        signature: "0x" + "aa".repeat(65),
      },
    }
  );

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "WALLET_AUTHORIZATION_MISMATCH");
  assert.match(res.error?.message || "", /does not match transfer sender/i);
});

test("4.4. Binance Wallet Transfer: Mainnet Execution is Strictly Blocked (Chain ID 56)", async (t) => {
  const sender = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  const res = await globalSkillRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender,
      recipient,
      amount: "1.0",
      token: "USDC",
      chainId: 56, // Mainnet
    },
    {
      callerAddress: sender,
      authorization: {
        isAuthorized: true,
        approvedBy: sender,
        signature: "0x" + "bb".repeat(65),
      },
    }
  );

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "MAINNET_SETTLEMENT_DISABLED");
  assert.match(res.error?.message || "", /BNB Mainnet live settlement is strictly disabled/i);
});

test("4.5. Binance Wallet Transfer: Authorized Execution via Binance Agentic Wallet Seam", async (t) => {
  const sender = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const mockTxHash = "0xbb11cc22dd33ee44ff556677889900112233445566778899aabbccddeeff0011";

  const res = await globalSkillRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender,
      recipient,
      amount: "5.0",
      token: "USDC",
      chainId: 97,
    },
    {
      callerAddress: sender,
      authorization: {
        isAuthorized: true,
        approvedBy: sender,
        signature: "0x" + "11".repeat(65),
      },
      testSeam: {
        executeTransfer: async ({ sender, recipient, amount, token }) => {
          return {
            data: {
              sender,
              recipient,
              resolvedRecipientAddress: recipient,
              amount,
              token,
              transactionHash: mockTxHash,
              blockNumber: 42005000,
              gasUsed: "45000",
              chainId: 97,
            },
            onChainReceipt: {
              status: "success",
              transactionHash: mockTxHash,
              blockNumber: 42005000,
              gasUsed: 45000n,
              from: sender,
              to: recipient,
            },
          };
        },
      },
    }
  );

  assert.equal(res.success, true);
  assert.equal(res.skillId, "binance.wallet.transfer");
  assert.equal(res.data.amount, "5.0");
  assert.equal(res.data.transactionHash, mockTxHash);
  assert.equal(res.onChainReceipt?.status, "success");
});

test("4.6. Binance Skill Router: Reject Non-Existent Skill ID", async (t) => {
  const res = await globalSkillRouter.executeSkill("binance.nonexistent.capability", {});
  assert.equal(res.success, false);
  assert.equal(res.error?.code, "SKILL_NOT_FOUND");
});

// ==========================================
// 5. Tool Integration (LLM_READ_TOOLS & MCP)
// ==========================================

test("5.1. LLM Tool: discover_binance_skills Integration", async (t) => {
  const { LLM_READ_TOOLS } = await import("../app/agent/src/tools.js");
  assert.ok(LLM_READ_TOOLS.discover_binance_skills, "discover_binance_skills tool must be mounted");

  const results = await LLM_READ_TOOLS.discover_binance_skills.execute({
    category: "market",
  });

  assert.ok(Array.isArray(results));
  assert.equal(results.length, 2);
  assert.ok(results.some((s) => s.id === "binance.market.ticker"));
  assert.ok(results.some((s) => s.id === "binance.market.depth"));
});

test("5.2. LLM Tool: execute_binance_skill (Read-Only Execution)", async (t) => {
  const { LLM_READ_TOOLS } = await import("../app/agent/src/tools.js");
  assert.ok(LLM_READ_TOOLS.execute_binance_skill, "execute_binance_skill tool must be mounted");

  const res = await LLM_READ_TOOLS.execute_binance_skill.execute({
    skill_id: "binance.market.ticker",
    params_json: JSON.stringify({ symbol: "BNBUSDT" }),
  });

  assert.equal(res.success, true);
  assert.equal(res.skillId, "binance.market.ticker");
  assert.equal(res.data?.symbol, "BNBUSDT");
});

test("5.3. LLM Tool: execute_binance_skill (Financial Gating Enforcement)", async (t) => {
  const { LLM_READ_TOOLS } = await import("../app/agent/src/tools.js");
  const sender = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  // Financial skill without signature
  const res = await LLM_READ_TOOLS.execute_binance_skill.execute({
    skill_id: "binance.wallet.transfer",
    params_json: JSON.stringify({ sender, recipient, amount: "1.0", token: "USDC" }),
    approver_address: sender,
  });

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "UNAUTHORIZED_FINANCIAL_ACTION");
});
