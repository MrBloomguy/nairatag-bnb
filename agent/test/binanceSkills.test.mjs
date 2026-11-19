import test from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  globalSkillRegistry,
  SkillRegistry,
} from "../app/agent/src/services/skills/skillRegistry.js";
import {
  globalSkillRouter,
  SkillRouter,
} from "../app/agent/src/services/skills/skillRouter.js";
import {
  SKILL_AUTH_DOMAIN_NAME,
  SKILL_AUTH_VERSION,
  BINANCE_SKILL_AUTH_TYPES,
  buildCanonicalSkillAuthMessage,
  SkillAuthorizationVerifier,
  globalSkillAuthVerifier,
} from "../app/agent/src/services/skills/skillAuthorizationVerifier.js";
import { DurableExecutionStore } from "../app/agent/src/services/durableExecutionStore.js";

// Isolated test store and router to prevent cross-suite disk state collisions
const testStorePath = join(tmpdir(), `nairatag-skills-test-${randomUUID()}.json`);
const testStore = new DurableExecutionStore(testStorePath);
const testVerifier = new SkillAuthorizationVerifier(testStore);
const testRouter = new SkillRouter(globalSkillRegistry, testVerifier);

// Standard deterministic test accounts
const USER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const userAccount = privateKeyToAccount(USER_PK);

const ATTACKER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const attackerAccount = privateKeyToAccount(ATTACKER_PK);

const RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

/** Helper: Generate valid EIP-712 typed-data signature */
async function signSkillAuthEIP712(signerAccount, params) {
  const domain = {
    name: SKILL_AUTH_DOMAIN_NAME,
    version: SKILL_AUTH_VERSION,
    chainId: params.chainId,
  };
  const message = {
    skillId: params.skillId,
    sender: params.sender,
    recipient: params.recipient,
    amount: params.amount,
    token: params.token,
    chainId: BigInt(params.chainId),
    nonce: BigInt(params.nonce),
    expiresAt: BigInt(params.expiresAt),
  };
  return signerAccount.signTypedData({
    domain,
    types: BINANCE_SKILL_AUTH_TYPES,
    primaryType: "NairaTagSkillAuthorization",
    message,
  });
}

/** Helper: Generate valid EIP-191 personal_sign signature */
async function signSkillAuthEIP191(signerAccount, params) {
  const message = buildCanonicalSkillAuthMessage(params);
  return signerAccount.signMessage({ message });
}

// ==========================================
// 1. Skill Discovery & Catalog Tests
// ==========================================

test("1.1. Skill Registry: Discover Binance Skills Hub & Agentic Wallet Capabilities", async (t) => {
  const registry = globalSkillRegistry;
  const allSkills = registry.listSkills();

  assert.ok(allSkills.length >= 5, "Expected at least 5 registered Binance skills");

  assert.ok(registry.hasSkill("binance.market.ticker"));
  assert.ok(registry.hasSkill("binance.market.depth"));
  assert.ok(registry.hasSkill("binance.token.security"));
  assert.ok(registry.hasSkill("binance.wallet.balance"));
  assert.ok(registry.hasSkill("binance.wallet.transfer"));

  const marketSkills = registry.listSkills({ category: "market" });
  assert.equal(marketSkills.length, 2);

  const walletSkills = registry.listSkills({ category: "wallet" });
  assert.equal(walletSkills.length, 2);

  const securitySkills = registry.listSkills({ category: "security" });
  assert.equal(securitySkills.length, 1);

  // Only financial execution requires user consent
  const consentRequired = registry.listSkills({ requiresUserConsent: true });
  assert.equal(consentRequired.length, 1);
  assert.equal(consentRequired[0].id, "binance.wallet.transfer");

  const readOnlySkills = registry.listSkills({ requiresUserConsent: false });
  assert.ok(readOnlySkills.length >= 4);

  const searchResults = registry.searchSkills("depth");
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].id, "binance.market.depth");
});

// ==========================================
// 2. Binance Skills Hub: Live Market Data Tests
// ==========================================

test("2.1. Binance Market Ticker: Live Spot & 24hr Metrics Query (BNBUSDT)", async (t) => {
  const res = await testRouter.executeSkill("binance.market.ticker", {
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
  const res1 = await globalSkillRouter.executeSkill("binance.market.ticker", {
    symbol: "BTCUSDT",
  });
  assert.equal(res1.success, true);

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
  const res = await testRouter.executeSkill("binance.market.ticker", {
    symbol: "INVALIDPAIRXYZ999",
  });

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "SYMBOL_NOT_FOUND");
  assert.match(res.error?.message || "", /not found on Binance/i);
});

test("2.4. Binance Orderbook Depth: Liquidity & Spread Analysis", async (t) => {
  const res = await testRouter.executeSkill("binance.market.depth", {
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
// 3. Binance Skills Hub: Token Security Reporting (Remediated)
// ==========================================

test("3.1. Token Security: Distinguish Verified On-Chain Telemetry from Unavailable Checks", async (t) => {
  // Mock client providing verifiable ERC-20 contract readings
  const mockClient = {
    getBytecode: async () => "0x608060405234801561001057600080fd5b5061...",
    readContract: async ({ functionName }) => {
      if (functionName === "name") return "Wrapped BNB";
      if (functionName === "symbol") return "WBNB";
      if (functionName === "decimals") return 18;
      if (functionName === "totalSupply") return 2000000000000000000000000n;
      if (functionName === "owner") return "0x0000000000000000000000000000000000000000";
      throw new Error("Method not found");
    },
  };

  const wbnb = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
  const res = await testRouter.executeSkill(
    "binance.token.security",
    { tokenAddress: wbnb, chainId: 56 },
    { testSeam: { client: mockClient } }
  );

  assert.equal(res.success, true);
  assert.equal(res.skillId, "binance.token.security");

  // Verify verified on-chain findings
  const findings = res.data.verifiedOnChainFindings;
  assert.equal(findings.isContract, true);
  assert.ok(findings.bytecodeSizeBytes > 0);
  assert.equal(findings.tokenName, "Wrapped BNB");
  assert.equal(findings.tokenSymbol, "WBNB");
  assert.equal(findings.decimals, 18);
  assert.equal(findings.implementsStandardERC20, true);

  // Verify unavailable checks are explicitly listed
  assert.ok(Array.isArray(res.data.unavailableChecks));
  assert.ok(res.data.unavailableChecks.includes("honeypot_dynamic_sell_simulation"));
  assert.ok(res.data.unavailableChecks.includes("custom_fee_router_tax_logic"));

  // Verify disclaimer is present
  assert.match(res.data.disclaimer, /does NOT constitute a formal smart contract security audit/i);
});

test("3.2. Token Security: EOA (Non-Contract) Address Detection", async (t) => {
  const mockEoaClient = {
    getBytecode: async () => "0x",
  };

  const eoaAddress = userAccount.address;
  const res = await testRouter.executeSkill(
    "binance.token.security",
    { tokenAddress: eoaAddress, chainId: 56 },
    { testSeam: { client: mockEoaClient } }
  );

  assert.equal(res.success, true);
  assert.equal(res.data.verifiedOnChainFindings.isContract, false);
  assert.equal(res.data.assessment, "NOT_A_CONTRACT");
  assert.ok(res.data.heuristicWarnings.some((w) => w.includes("EOA")));
});

test("3.3. Token Security: Malformed Address Rejection", async (t) => {
  const res = await testRouter.executeSkill("binance.token.security", {
    tokenAddress: "not-an-address",
  });

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "INVALID_PARAMETERS");
});

// ==========================================
// 4. Binance Agentic Wallet: Balance Network Handling
// ==========================================

test("4.1. Wallet Balance: Respect Network Configuration (BSC Testnet vs BSC Mainnet)", async (t) => {
  const targetWallet = userAccount.address;

  // BSC Testnet
  const resTestnet = await globalSkillRouter.executeSkill(
    "binance.wallet.balance",
    { address: targetWallet, network: "bsc-testnet" },
    {
      testSeam: {
        balanceResponse: {
          address: targetWallet,
          nativeBalance: "1.5",
          nativeSymbol: "tBNB",
          tokenBalances: [{ symbol: "USDC", contractAddress: "0x6454...", balance: "25.0", decimals: 18 }],
          network: "bsc-testnet",
          chainId: 97,
        },
      },
    }
  );
  assert.equal(resTestnet.success, true);
  assert.equal(resTestnet.data.network, "bsc-testnet");
  assert.equal(resTestnet.data.chainId, 97);
  assert.equal(resTestnet.data.nativeSymbol, "tBNB");

  // BSC Mainnet
  const resMainnet = await globalSkillRouter.executeSkill(
    "binance.wallet.balance",
    { address: targetWallet, network: "bsc-mainnet" },
    {
      testSeam: {
        balanceResponse: {
          address: targetWallet,
          nativeBalance: "0.45",
          nativeSymbol: "BNB",
          tokenBalances: [{ symbol: "USDT", contractAddress: "0x55d3...", balance: "150.0", decimals: 18 }],
          network: "bsc-mainnet",
          chainId: 56,
        },
      },
    }
  );
  assert.equal(resMainnet.success, true);
  assert.equal(resMainnet.data.network, "bsc-mainnet");
  assert.equal(resMainnet.data.chainId, 56);
  assert.equal(resMainnet.data.nativeSymbol, "BNB");
});

test("4.2. Wallet Balance: Unsupported Network Rejection", async (t) => {
  const res = await testRouter.executeSkill("binance.wallet.balance", {
    address: userAccount.address,
    network: "polygon-mainnet",
  });

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "UNSUPPORTED_NETWORK");
  assert.match(res.error?.message || "", /Unsupported network/i);
});

// ==========================================
// 5. Binance Agentic Wallet: Central Cryptographic Authorization Tests
// ==========================================

test("5.1. Wallet Transfer: Blocked Without User Confirmation", async (t) => {
  const res = await testRouter.executeSkill("binance.wallet.transfer", {
    sender: userAccount.address,
    recipient: RECIPIENT,
    amount: "1.0",
    token: "USDC",
    confirmationAccepted: false, // User confirmation NOT provided
  });

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "CONFIRMATION_REQUIRED");
  assert.match(res.error?.message || "", /User confirmation required/i);
});

test("5.2. Wallet Transfer: Blocked Without Cryptographic Authorization", async (t) => {
  const res = await testRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender: userAccount.address,
      recipient: RECIPIENT,
      amount: "1.0",
      token: "USDC",
      confirmationAccepted: true,
    },
    {
      callerAddress: userAccount.address,
      // No authProof provided
    }
  );

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "UNAUTHORIZED_FINANCIAL_ACTION");
  assert.match(res.error?.message || "", /strictly requires verified user cryptographic consent/i);
});

test("5.3. Wallet Transfer: Forged Attacker Signature is Rejected", async (t) => {
  const authParams = {
    skillId: "binance.wallet.transfer",
    sender: userAccount.address,
    recipient: RECIPIENT,
    amount: "1.0",
    token: "USDC",
    chainId: 97,
    nonce: 101,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };

  // Attacker signs using their own key pretending to be userAccount
  const forgedSignature = await signSkillAuthEIP712(attackerAccount, authParams);

  const res = await testRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender: userAccount.address,
      recipient: RECIPIENT,
      amount: "1.0",
      token: "USDC",
      confirmationAccepted: true,
    },
    {
      callerAddress: userAccount.address,
      authProof: {
        approvedBy: userAccount.address,
        signature: forgedSignature,
        nonce: authParams.nonce,
        expiresAt: authParams.expiresAt,
        chainId: 97,
      },
    }
  );

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "CRYPTOGRAPHIC_SIGNATURE_INVALID");
  assert.match(res.error?.message || "", /recovered signer .* does not match approvedBy/i);
});

test("5.4. Wallet Transfer: Parameter Manipulation (Amount Tampering) is Rejected", async (t) => {
  // User signed for 1.0 USDC
  const authParams = {
    skillId: "binance.wallet.transfer",
    sender: userAccount.address,
    recipient: RECIPIENT,
    amount: "1.0",
    token: "USDC",
    chainId: 97,
    nonce: 102,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  const validSig = await signSkillAuthEIP712(userAccount, authParams);

  // Attacker alters execution request to 50.0 USDC
  const res = await testRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender: userAccount.address,
      recipient: RECIPIENT,
      amount: "50.0", // Altered!
      token: "USDC",
      confirmationAccepted: true,
    },
    {
      callerAddress: userAccount.address,
      authProof: {
        approvedBy: userAccount.address,
        signature: validSig,
        nonce: authParams.nonce,
        expiresAt: authParams.expiresAt,
        chainId: 97,
      },
    }
  );

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "CRYPTOGRAPHIC_SIGNATURE_INVALID");
});

test("5.5. Wallet Transfer: Parameter Manipulation (Recipient Tampering) is Rejected", async (t) => {
  const authParams = {
    skillId: "binance.wallet.transfer",
    sender: userAccount.address,
    recipient: RECIPIENT,
    amount: "1.0",
    token: "USDC",
    chainId: 97,
    nonce: 103,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  const validSig = await signSkillAuthEIP712(userAccount, authParams);
  const alteredRecipient = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

  // Attacker alters recipient to alteredRecipient
  const res = await testRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender: userAccount.address,
      recipient: alteredRecipient, // Altered!
      amount: "1.0",
      token: "USDC",
      confirmationAccepted: true,
    },
    {
      callerAddress: userAccount.address,
      authProof: {
        approvedBy: userAccount.address,
        signature: validSig,
        nonce: authParams.nonce,
        expiresAt: authParams.expiresAt,
        chainId: 97,
      },
    }
  );

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "CRYPTOGRAPHIC_SIGNATURE_INVALID");
});

test("5.6. Wallet Transfer: Chain ID Mismatch is Rejected", async (t) => {
  // Signed for Chain 97
  const authParams = {
    skillId: "binance.wallet.transfer",
    sender: userAccount.address,
    recipient: RECIPIENT,
    amount: "1.0",
    token: "USDC",
    chainId: 97,
    nonce: 104,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  const validSig = await signSkillAuthEIP712(userAccount, authParams);

  // Executed for chain 970 with chain 97 signature
  const res = await testRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender: userAccount.address,
      recipient: RECIPIENT,
      amount: "1.0",
      token: "USDC",
      chainId: 970, // Different test chain!
      confirmationAccepted: true,
    },
    {
      callerAddress: userAccount.address,
      authProof: {
        approvedBy: userAccount.address,
        signature: validSig,
        nonce: authParams.nonce,
        expiresAt: authParams.expiresAt,
        chainId: 97, // Auth proof is for 97, but execution requested 970
      },
    }
  );

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "CHAIN_ID_MISMATCH");
});

test("5.6b. Wallet Transfer: Mainnet Execution is Strictly Blocked (Chain ID 56)", async (t) => {
  // Signed for Chain 56
  const authParams = {
    skillId: "binance.wallet.transfer",
    sender: userAccount.address,
    recipient: RECIPIENT,
    amount: "1.0",
    token: "USDC",
    chainId: 56,
    nonce: 105,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  const validSig = await signSkillAuthEIP712(userAccount, authParams);

  // Executed for chain 56 with matching chain 56 signature
  const res = await testRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender: userAccount.address,
      recipient: RECIPIENT,
      amount: "1.0",
      token: "USDC",
      chainId: 56,
      confirmationAccepted: true,
    },
    {
      callerAddress: userAccount.address,
      authProof: {
        approvedBy: userAccount.address,
        signature: validSig,
        nonce: authParams.nonce,
        expiresAt: authParams.expiresAt,
        chainId: 56,
      },
    }
  );

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "MAINNET_SETTLEMENT_DISABLED");
  assert.match(res.error?.message || "", /BNB Mainnet live settlement is strictly disabled/i);
});

test("5.7. Wallet Transfer: Expired Authorization is Rejected", async (t) => {
  const expiredTime = Math.floor(Date.now() / 1000) - 30; // 30 seconds ago
  const authParams = {
    skillId: "binance.wallet.transfer",
    sender: userAccount.address,
    recipient: RECIPIENT,
    amount: "1.0",
    token: "USDC",
    chainId: 97,
    nonce: 105,
    expiresAt: expiredTime,
  };
  const validSig = await signSkillAuthEIP712(userAccount, authParams);

  const res = await testRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender: userAccount.address,
      recipient: RECIPIENT,
      amount: "1.0",
      token: "USDC",
      confirmationAccepted: true,
    },
    {
      callerAddress: userAccount.address,
      authProof: {
        approvedBy: userAccount.address,
        signature: validSig,
        nonce: authParams.nonce,
        expiresAt: expiredTime,
        chainId: 97,
      },
    }
  );

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "AUTHORIZATION_EXPIRED");
  assert.match(res.error?.message || "", /Authorization expired/i);
});

test("5.8. Wallet Transfer: Reused Nonce Replay Attack is Rejected", async (t) => {
  const replayStorePath = join(tmpdir(), `nairatag-replay-test-${randomUUID()}.json`);
  const replayStore = new DurableExecutionStore(replayStorePath);
  const replayVerifier = new SkillAuthorizationVerifier(replayStore);
  const replayRouter = new SkillRouter(globalSkillRegistry, replayVerifier);

  const authParams = {
    skillId: "binance.wallet.transfer",
    sender: userAccount.address,
    recipient: RECIPIENT,
    amount: "1.0",
    token: "USDC",
    chainId: 97,
    nonce: 201,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  const sig = await signSkillAuthEIP712(userAccount, authParams);

  // First execution records nonce 201
  replayVerifier.recordExecution({
    skillId: authParams.skillId,
    sender: authParams.sender,
    recipient: authParams.recipient,
    amount: authParams.amount,
    token: authParams.token,
    chainId: authParams.chainId,
    authProof: {
      approvedBy: userAccount.address,
      signature: sig,
      nonce: authParams.nonce,
      expiresAt: authParams.expiresAt,
    },
  });

  // Replay attempt with same nonce 201
  const res = await replayRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender: userAccount.address,
      recipient: RECIPIENT,
      amount: "1.0",
      token: "USDC",
      confirmationAccepted: true,
    },
    {
      callerAddress: userAccount.address,
      authProof: {
        approvedBy: userAccount.address,
        signature: sig,
        nonce: 201, // Replayed!
        expiresAt: authParams.expiresAt,
        chainId: 97,
      },
    }
  );

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "NONCE_REPLAY_DETECTED");
  assert.match(res.error?.message || "", /Nonce replay detected/i);
});

// ==========================================
// 6. Binance Agentic Wallet: Studio Runtime & Execution
// ==========================================

test("6.1. Wallet Transfer: Honest Reporting When Studio Wallet Is Uninitialized", async (t) => {
  const authParams = {
    skillId: "binance.wallet.transfer",
    sender: userAccount.address,
    recipient: RECIPIENT,
    amount: "1.0",
    token: "USDC",
    chainId: 97,
    nonce: 301,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  const sig = await signSkillAuthEIP712(userAccount, authParams);

  const res = await testRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender: userAccount.address,
      recipient: RECIPIENT,
      amount: "1.0",
      token: "USDC",
      confirmationAccepted: true,
    },
    {
      callerAddress: userAccount.address,
      authProof: {
        approvedBy: userAccount.address,
        signature: sig,
        nonce: authParams.nonce,
        expiresAt: authParams.expiresAt,
        chainId: 97,
      },
      // No Studio wallet in this environment
    }
  );

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "STUDIO_WALLET_NOT_INITIALIZED");
  assert.match(res.error?.message || "", /Studio wallet is not available in this execution environment/i);
});

test("6.2. Wallet Transfer: Simulation Seam Never Claims Payment Completed", async (t) => {
  const authParams = {
    skillId: "binance.wallet.transfer",
    sender: userAccount.address,
    recipient: RECIPIENT,
    amount: "1.0",
    token: "USDC",
    chainId: 97,
    nonce: 302,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  const sig = await signSkillAuthEIP712(userAccount, authParams);

  const res = await testRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender: userAccount.address,
      recipient: RECIPIENT,
      amount: "1.0",
      token: "USDC",
      confirmationAccepted: true,
    },
    {
      callerAddress: userAccount.address,
      authProof: {
        approvedBy: userAccount.address,
        signature: sig,
        nonce: authParams.nonce,
        expiresAt: authParams.expiresAt,
        chainId: 97,
      },
      testSeam: {
        simulateExecution: true,
      },
    }
  );

  assert.equal(res.success, true);
  assert.equal(res.classification, "SIMULATED");
  assert.equal(res.data.paymentCompleted, false);
  assert.match(res.data.statusText, /No on-chain funds moved/i);
});

test("6.3. Wallet Transfer: Positive Studio Wallet Execution via Viem Adapter", async (t) => {
  const mockTxHash = "0xaa11bb22cc33dd44ee55ff6677889900112233445566778899aabbccddeeff00";
  const authParams = {
    skillId: "binance.wallet.transfer",
    sender: userAccount.address,
    recipient: RECIPIENT,
    amount: "2.5",
    token: "USDC",
    chainId: 97,
    nonce: 303,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  const sig = await signSkillAuthEIP712(userAccount, authParams);

  let signTxCalled = false;
  const mockStudioWallet = {
    address: userAccount.address,
    signTransaction: async (tx) => {
      signTxCalled = true;
      return { rawTransaction: "0x02f870mockrawtx" };
    },
    signMessage: async () => ({ signature: "0xmsgsig" }),
    signTypedData: async () => ({ signature: "0xtypedsig" }),
  };

  const mockPublicClient = {
    waitForTransactionReceipt: async ({ hash }) => ({
      status: "success",
      blockNumber: 42006000n,
      transactionHash: hash,
      gasUsed: 42000n,
      from: userAccount.address,
      to: "0x64544969ed7EBf5f083679233325356EbE738930",
    }),
  };

  const mockWalletClient = (account) => ({
    account,
    writeContract: async () => {
      await account.signTransaction({ to: RECIPIENT, chainId: 97 });
      return mockTxHash;
    },
  });

  const res = await testRouter.executeSkill(
    "binance.wallet.transfer",
    {
      sender: userAccount.address,
      recipient: RECIPIENT,
      amount: "2.5",
      token: "USDC",
      confirmationAccepted: true,
    },
    {
      callerAddress: userAccount.address,
      authProof: {
        approvedBy: userAccount.address,
        signature: sig,
        nonce: authParams.nonce,
        expiresAt: authParams.expiresAt,
        chainId: 97,
      },
      testSeam: {
        studioWallet: mockStudioWallet,
        client: mockPublicClient,
        walletClient: mockWalletClient,
      },
    }
  );

  assert.equal(res.success, true);
  assert.equal(res.classification, "LIVE");
  assert.equal(res.data.paymentCompleted, true);
  assert.equal(signTxCalled, true);
  assert.equal(res.data.transactionHash, mockTxHash);
  assert.equal(res.onChainReceipt?.status, "success");
});

// ==========================================
// 7. Tool Integration (LLM_READ_TOOLS & MCP)
// ==========================================

test("7.1. LLM Tool: discover_binance_skills Integration", async (t) => {
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

test("7.2. LLM Tool: execute_binance_skill (Read-Only Execution)", async (t) => {
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

test("7.3. LLM Tool: execute_binance_skill (Financial Execution Blocked Without Signature)", async (t) => {
  const { LLM_READ_TOOLS } = await import("../app/agent/src/tools.js");

  const res = await LLM_READ_TOOLS.execute_binance_skill.execute({
    skill_id: "binance.wallet.transfer",
    params_json: JSON.stringify({
      sender: userAccount.address,
      recipient: RECIPIENT,
      amount: "1.0",
      token: "USDC",
      confirmationAccepted: true,
    }),
    approver_address: userAccount.address,
    // No signature
  });

  assert.equal(res.success, false);
  assert.equal(res.error?.code, "UNAUTHORIZED_FINANCIAL_ACTION");
});

test("7.4. LLM Tool: execute_binance_skill (Financial Execution with Valid Cryptographic Signature)", async (t) => {
  const { LLM_READ_TOOLS } = await import("../app/agent/src/tools.js");
  const authParams = {
    skillId: "binance.wallet.transfer",
    sender: userAccount.address,
    recipient: RECIPIENT,
    amount: "1.0",
    token: "USDC",
    chainId: 97,
    nonce: 401,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
  const sig = await signSkillAuthEIP712(userAccount, authParams);

  const res = await LLM_READ_TOOLS.execute_binance_skill.execute({
    skill_id: "binance.wallet.transfer",
    params_json: JSON.stringify({
      sender: userAccount.address,
      recipient: RECIPIENT,
      amount: "1.0",
      token: "USDC",
      confirmationAccepted: true,
    }),
    approver_address: userAccount.address,
    signature: sig,
    nonce: authParams.nonce,
    expires_at: authParams.expiresAt,
    chain_id: 97,
    auth_type: "eip712",
  });

  // Since live studio keystore is not loaded in this node process,
  // it correctly and honestly fails at the Studio wallet boundary with STUDIO_WALLET_NOT_INITIALIZED
  // proving that it passed cryptographic verification!
  assert.equal(res.success, false);
  assert.equal(res.error?.code, "STUDIO_WALLET_NOT_INITIALIZED");
});
