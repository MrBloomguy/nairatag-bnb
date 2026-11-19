import test from "node:test";
import assert from "node:assert/strict";
import { DefiLlamaAdapter } from "../app/agent/src/services/specialists/defillamaAdapter.js";
import { CoinGeckoAdapter } from "../app/agent/src/services/specialists/coingeckoAdapter.js";
import { MeteoAdapter } from "../app/agent/src/services/specialists/meteoAdapter.js";
import { BloomAdapter } from "../app/agent/src/services/specialists/bloomAdapter.js";
import { SpecialistAdapterRegistry } from "../app/agent/src/services/specialists/specialistAdapterRegistry.js";

// ===================================================================
// 1. ₦DEFILLAMA SPECIALIST ADAPTER TESTS
// ===================================================================

test("1.1. DeFiLlama: Live Protocol Query (PancakeSwap)", async (t) => {
  const adapter = new DefiLlamaAdapter();
  const result = await adapter.execute({ protocol: "pancakeswap", chain: "bsc" }, { skipCache: true });

  assert.equal(result.success, true);
  assert.equal(result.specialistTag, "₦DEFILLAMA");
  assert.equal(result.capabilityId, "defi_metrics");
  assert.equal(result.metadata.classification, "LIVE");
  assert.equal(result.metadata.source, "https://api.llama.fi/protocol/pancakeswap");
  assert.ok(result.metadata.retrievedAt);

  assert.ok(result.data);
  assert.equal(result.data.protocol, "pancakeswap");
  assert.equal(result.data.name, "PancakeSwap");
  assert.ok(result.data.totalTvlUsd > 100_000_000, "TVL should exceed $100M");
  assert.ok((result.data.chainTvlUsd || 0) > 10_000_000, "BSC TVL should exceed $10M");
  assert.equal(result.data.targetChain, "bsc");
  assert.ok(result.data.sourceUrl.includes("defillama.com/protocol/pancakeswap"));
});

test("1.2. DeFiLlama: In-Memory TTL Cache Hit", async (t) => {
  const adapter = new DefiLlamaAdapter();
  // First query populates cache
  await adapter.execute({ protocol: "venus" }, { skipCache: true });

  // Second query should hit cache
  const cachedResult = await adapter.execute({ protocol: "venus" });
  assert.equal(cachedResult.success, true);
  assert.equal(cachedResult.metadata.classification, "CACHED");
  assert.ok((cachedResult.metadata.ttlSeconds || 0) > 0);
  assert.equal(cachedResult.metadata.isStale, false);
});

test("1.3. DeFiLlama: Protocol Not Found Fails Without Inventing Fallback Numbers", async (t) => {
  const adapter = new DefiLlamaAdapter();
  const result = await adapter.execute({ protocol: "completely-nonexistent-crypto-defi-xyz-1234" });

  assert.equal(result.success, false);
  assert.equal(result.metadata.classification, "LIVE");
  assert.ok(result.error);
  assert.equal(result.error.code, "PROTOCOL_NOT_FOUND");
  assert.match(result.error.message, /not found on DeFiLlama/i);
  assert.equal(result.data, undefined); // NO fake fallback values!
});

test("1.4. DeFiLlama: BSC Chain TVL Query", async (t) => {
  const adapter = new DefiLlamaAdapter();
  const result = await adapter.execute({ protocol: "bsc" }, { skipCache: true });

  assert.equal(result.success, true);
  assert.equal(result.metadata.classification, "LIVE");
  assert.ok(result.data);
  assert.equal(result.data.protocol, "bsc");
  assert.ok(result.data.totalTvlUsd > 1_000_000_000, "BSC Chain TVL should be in billions");
});

// ===================================================================
// 2. ₦COINGECKO SPECIALIST ADAPTER TESTS
// ===================================================================

test("2.1. CoinGecko: Live Spot Price Query (BNB)", async (t) => {
  const adapter = new CoinGeckoAdapter();
  const result = await adapter.execute({ token: "BNB" }, { skipCache: true });

  assert.equal(result.success, true);
  assert.equal(result.specialistTag, "₦COINGECKO");
  assert.equal(result.capabilityId, "market_pricing");
  assert.equal(result.metadata.classification, "LIVE");
  assert.ok(result.data);
  assert.equal(result.data.symbol, "BNB");
  assert.equal(result.data.coingeckoId, "binancecoin");
  assert.ok(result.data.priceUsd > 50, "BNB price should be > $50");
  assert.ok(result.data.marketCapUsd > 1_000_000_000, "BNB market cap should be > $1B");
  assert.equal(result.data.priceType, "SPOT");
  assert.equal(result.data.isStale, false);
  assert.ok(result.data.oracleTimestamp);
});

test("2.2. CoinGecko: Distinguish Cached Price from Live Spot Price", async (t) => {
  const adapter = new CoinGeckoAdapter();
  // Live query
  const live = await adapter.execute({ token: "BTC" }, { skipCache: true });
  assert.equal(live.metadata.classification, "LIVE");
  assert.equal(live.data?.priceType, "SPOT");

  // Cached query
  const cached = await adapter.execute({ token: "BTC" });
  assert.equal(cached.metadata.classification, "CACHED");
  assert.equal(cached.data?.priceType, "CACHED");
});

test("2.3. CoinGecko: Asset Not Found Error Handling", async (t) => {
  const adapter = new CoinGeckoAdapter();
  const result = await adapter.execute({ token: "TOTALLY_FAKE_TOKEN_XYZ_99999" });

  assert.equal(result.success, false);
  assert.ok(result.error);
  assert.equal(result.error.code, "ASSET_NOT_FOUND");
  assert.match(result.error.message, /not found or has no active USD pricing/i);
});

// ===================================================================
// 3. ₦METEO SPECIALIST ADAPTER TESTS
// ===================================================================

test("3.1. Open-Meteo: Live Location Weather Telemetry (Lagos)", async (t) => {
  const adapter = new MeteoAdapter();
  const result = await adapter.execute({ location: "Lagos" }, { skipCache: true });

  assert.equal(result.success, true);
  assert.equal(result.specialistTag, "₦METEO");
  assert.equal(result.capabilityId, "weather_logistics");
  assert.equal(result.metadata.classification, "LIVE");
  assert.ok(result.data);
  assert.equal(result.data.location, "Lagos");
  assert.equal(result.data.country, "Nigeria");
  assert.ok(typeof result.data.temperatureC === "number");
  assert.ok(typeof result.data.humidityPercent === "number");
  assert.ok(typeof result.data.windSpeedKmh === "number");
  assert.ok(result.data.condition.length > 0);
  assert.ok(["low", "medium", "high", "severe"].includes(result.data.transitLogisticsRiskIndex));
  assert.equal(typeof result.data.safeForDelivery, "boolean");
  assert.equal(result.data.units.temperature, "°C");
  assert.equal(result.data.units.windSpeed, "km/h");
});

test("3.2. Open-Meteo: Location-Aware Query (Nairobi)", async (t) => {
  const adapter = new MeteoAdapter();
  const result = await adapter.execute({ location: "Nairobi" }, { skipCache: true });

  assert.equal(result.success, true);
  assert.ok(result.data);
  assert.equal(result.data.location, "Nairobi");
  assert.equal(result.data.country, "Kenya");
  assert.ok(result.data.latitude < 0, "Nairobi is south of equator");
});

test("3.3. Open-Meteo: Unresolvable Location Rejection", async (t) => {
  const adapter = new MeteoAdapter();
  const result = await adapter.execute({ location: "zzzzqxxxyyy_no_such_place_on_earth" });

  assert.equal(result.success, false);
  assert.ok(result.error);
  assert.equal(result.error.code, "LOCATION_NOT_FOUND");
  assert.match(result.error.message, /could not be resolved/i);
});

test("3.4. Open-Meteo: Logistics Severe Weather Evaluation Logic", (t) => {
  const adapter = new MeteoAdapter();
  // Thunderstorm with heavy wind -> Severe, not safe
  const severe = adapter.evaluateLogisticsRisk("storm", 35, 75, 24);
  assert.equal(severe.risk, "severe");
  assert.equal(severe.safeForDelivery, false);

  // Clear sky with mild wind -> Low risk, safe
  const mild = adapter.evaluateLogisticsRisk("clear", 0, 10, 25);
  assert.equal(mild.risk, "low");
  assert.equal(mild.safeForDelivery, true);
});

// ===================================================================
// 4. ₦BLOOM SPECIALIST ADAPTER TESTS (Phase 2B Hardened Verification)
// ===================================================================

test("4.1. Bloom: Financial Execution Without Cryptographic Authorization Fails", async (t) => {
  const adapter = new BloomAdapter();
  const result = await adapter.execute({
    amount: "10.0",
    currency: "USDC",
    recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    authorization: { isAuthorized: false },
  });

  assert.equal(result.success, false);
  assert.equal(result.paymentCompleted, false);
  assert.equal(result.metadata.classification, "SIMULATED");
  assert.ok(result.error);
  assert.equal(result.error.code, "UNAUTHORIZED_SETTLEMENT");
  assert.match(result.error.message, /Identity is not Authority/i);
});

test("4.2. Bloom: Live Mainnet Settlement is Strictly Blocked (Chain ID 56)", async (t) => {
  const adapter = new BloomAdapter();
  const result = await adapter.execute(
    {
      amount: "10.0",
      currency: "USDC",
      recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      chainId: 56,
      authorization: { isAuthorized: true, signature: "0xvalid" },
    },
    { transport: "live" }
  );

  assert.equal(result.success, false);
  assert.equal(result.paymentCompleted, false);
  assert.ok(result.error);
  assert.equal(result.error.code, "MAINNET_SETTLEMENT_DISABLED");
  assert.match(result.error.message, /Mainnet settlement.*strictly prohibited/i);
});

test("4.3. Bloom: Simulation Mode Never Claims Payment Succeeded or Invents Hashes", async (t) => {
  const adapter = new BloomAdapter();
  const result = await adapter.execute({
    amount: "2.5",
    currency: "USDC",
    recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    authorization: { isAuthorized: true, signature: "0xvalid" },
    dryRun: true,
  });

  // Simulation Honesty: payment did NOT complete
  assert.equal(result.success, false);
  assert.equal(result.paymentCompleted, false);
  assert.equal(result.metadata.classification, "SIMULATED");
  assert.equal(result.onChainReceipt, undefined); // NO fake on-chain receipt!
  assert.equal(result.error?.code, "SIMULATION_ONLY");
  assert.ok(result.data);
  assert.equal(result.data.settlementStatus, "simulation");
  assert.equal(result.data.verifiedOnChain, false);
  assert.match(result.data.simulationReason || "", /No fake transaction hashes were generated/i);
});

test("4.4. Bloom: Input Safety - Amount Validation (Missing, Negative, Excessive Decimals)", async (t) => {
  const adapter = new BloomAdapter();

  // Missing amount
  const missingAmt = await adapter.execute({
    recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    authorization: { isAuthorized: true, signature: "0xvalid" },
  });
  assert.equal(missingAmt.error?.code, "MISSING_AMOUNT");

  // Negative amount
  const negAmt = await adapter.execute({
    amount: "-5.0",
    recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    authorization: { isAuthorized: true, signature: "0xvalid" },
  });
  assert.equal(negAmt.error?.code, "INVALID_AMOUNT");

  // Zero amount
  const zeroAmt = await adapter.execute({
    amount: "0",
    recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    authorization: { isAuthorized: true, signature: "0xvalid" },
  });
  assert.equal(zeroAmt.error?.code, "INVALID_AMOUNT");

  // Excessive decimal precision (> 18 decimals)
  const excessiveDecimals = await adapter.execute({
    amount: "1.00000000000000000001", // 20 decimals
    currency: "USDC",
    recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    authorization: { isAuthorized: true, signature: "0xvalid" },
  });
  assert.equal(excessiveDecimals.error?.code, "EXCESSIVE_DECIMAL_PRECISION");
});

test("4.5. Bloom: Input Safety - Recipient Validation & Tag Resolution", async (t) => {
  const adapter = new BloomAdapter();

  // Missing recipient
  const missingRecip = await adapter.execute({
    amount: "1.0",
    currency: "USDC",
    authorization: { isAuthorized: true, signature: "0xvalid" },
  });
  assert.equal(missingRecip.error?.code, "MISSING_RECIPIENT");

  // Unresolvable sovereign tag
  const unresolvable = await adapter.execute({
    amount: "1.0",
    currency: "USDC",
    recipient: "₦NON_EXISTENT_TAG_XYZ_9999",
    authorization: { isAuthorized: true, signature: "0xvalid" },
  });
  assert.equal(unresolvable.error?.code, "UNRESOLVED_RECIPIENT_TAG");
});

test("4.6. Bloom: Authentic ERC-20 Receipt & Transfer Event Verification", async (t) => {
  const adapter = new BloomAdapter();
  const mockTxHash = "0x89ab12cd34ef5678901234567890abcdef1234567890abcdef1234567890abcd";
  const mockFrom = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const mockTo = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const tokenAddress = "0x64544969ed7EBf5f083679233325356EbE738930"; // BSC Testnet USDC

  // Transfer log for 5.0 USDC (18 decimals: 5 * 10^18 = 0x4563918244f40000)
  const validTransferLog = {
    address: tokenAddress,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", // Transfer(address,address,uint256)
      "0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266", // from
      "0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8", // to
    ],
    data: "0x0000000000000000000000000000000000000000000000004563918244f40000", // 5.0 * 10^18
    logIndex: 0n,
    transactionIndex: 0n,
  };

  const result = await adapter.execute({
    amount: "5.0",
    currency: "USDC",
    recipient: mockTo,
    sender: mockFrom,
    authorization: { isAuthorized: true, signature: "0xvalid" },
    testSeam: {
      txHash: mockTxHash,
      receipt: {
        status: "success",
        blockNumber: 42001000n,
        transactionHash: mockTxHash,
        from: mockFrom,
        to: tokenAddress,
        gasUsed: 45000n,
        logs: [validTransferLog],
      },
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.paymentCompleted, true);
  assert.equal(result.metadata.classification, "LIVE");
  assert.ok(result.onChainReceipt);
  assert.equal(result.onChainReceipt.status, "success");
  assert.equal(result.onChainReceipt.chainId, 97);
  assert.equal(result.onChainReceipt.transactionHash, mockTxHash);

  // Deep transfer event assertions
  assert.ok(result.onChainReceipt.transferEvent);
  assert.equal(result.onChainReceipt.transferEvent.tokenContract.toLowerCase(), tokenAddress.toLowerCase());
  assert.equal(result.onChainReceipt.transferEvent.from.toLowerCase(), mockFrom.toLowerCase());
  assert.equal(result.onChainReceipt.transferEvent.to.toLowerCase(), mockTo.toLowerCase());
  assert.equal(result.onChainReceipt.transferEvent.amountFormatted, "5");
});

test("4.7. Bloom: Event Log Anti-Tampering - Recipient, Token, and Amount Mismatches", async (t) => {
  const adapter = new BloomAdapter();
  const mockTxHash = "0x89ab12cd34ef5678901234567890abcdef1234567890abcdef1234567890abcd";
  const mockFrom = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const mockTo = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const wrongRecipient = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  const tokenAddress = "0x64544969ed7EBf5f083679233325356EbE738930";

  // Case A: Recipient mismatch in event log
  const wrongRecipientLog = {
    address: tokenAddress,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      "0x0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc", // Wrong recipient!
    ],
    data: "0x0000000000000000000000000000000000000000000000004563918244f40000",
  };

  const recipientMismatch = await adapter.execute({
    amount: "5.0",
    currency: "USDC",
    recipient: mockTo,
    sender: mockFrom,
    authorization: { isAuthorized: true, signature: "0xvalid" },
    testSeam: {
      receipt: {
        status: "success",
        blockNumber: 42001000n,
        transactionHash: mockTxHash,
        from: mockFrom,
        to: tokenAddress,
        gasUsed: 45000n,
        logs: [wrongRecipientLog],
      },
    },
  });
  assert.equal(recipientMismatch.success, false);
  assert.equal(recipientMismatch.error?.code, "RECIPIENT_MISMATCH");

  // Case B: Amount mismatch in event log (Requested 5.0, event only transferred 1.0)
  const wrongAmountLog = {
    address: tokenAddress,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "0x000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      "0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8",
    ],
    data: "0x0000000000000000000000000000000000000000000000000de0b6b3a7640000", // Only 1.0 * 10^18!
  };

  const amountMismatch = await adapter.execute({
    amount: "5.0",
    currency: "USDC",
    recipient: mockTo,
    sender: mockFrom,
    authorization: { isAuthorized: true, signature: "0xvalid" },
    testSeam: {
      receipt: {
        status: "success",
        blockNumber: 42001000n,
        transactionHash: mockTxHash,
        from: mockFrom,
        to: tokenAddress,
        gasUsed: 45000n,
        logs: [wrongAmountLog],
      },
    },
  });
  assert.equal(amountMismatch.success, false);
  assert.equal(amountMismatch.error?.code, "TRANSFER_AMOUNT_MISMATCH");

  // Case C: Token contract mismatch
  const wrongTokenLog = {
    address: "0x1111111111111111111111111111111111111111", // Fake token
    topics: wrongAmountLog.topics,
    data: wrongAmountLog.data,
  };

  const tokenMismatch = await adapter.execute({
    amount: "5.0",
    currency: "USDC",
    recipient: mockTo,
    sender: mockFrom,
    authorization: { isAuthorized: true, signature: "0xvalid" },
    testSeam: {
      receipt: {
        status: "success",
        blockNumber: 42001000n,
        transactionHash: mockTxHash,
        from: mockFrom,
        to: tokenAddress,
        gasUsed: 45000n,
        logs: [wrongTokenLog],
      },
    },
  });
  assert.equal(tokenMismatch.success, false);
  assert.equal(tokenMismatch.error?.code, "TOKEN_CONTRACT_MISMATCH");

  // Case D: Sender mismatch in event log (Transfer.from is attacker instead of authorized sender)
  const wrongSenderLog = {
    address: tokenAddress,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "0x0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc", // Attacker sender!
      "0x00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8",
    ],
    data: "0x0000000000000000000000000000000000000000000000004563918244f40000",
  };

  const senderMismatch = await adapter.execute({
    amount: "5.0",
    currency: "USDC",
    recipient: mockTo,
    sender: mockFrom,
    authorization: { isAuthorized: true, signature: "0xvalid" },
    testSeam: {
      receipt: {
        status: "success",
        blockNumber: 42001000n,
        transactionHash: mockTxHash,
        from: mockFrom,
        to: tokenAddress,
        gasUsed: 45000n,
        logs: [wrongSenderLog],
      },
    },
  });
  assert.equal(senderMismatch.success, false);
  assert.equal(senderMismatch.error?.code, "TRANSFER_SENDER_MISMATCH");
});

test("4.8. Bloom: Reverted On-Chain Transaction Detection", async (t) => {
  const adapter = new BloomAdapter();
  const mockTxHash = "0xdeadbeef12345678901234567890abcdef1234567890abcdef1234567890abcd";
  const mockFrom = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const mockTo = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  const result = await adapter.execute({
    amount: "5.0",
    currency: "USDC",
    recipient: mockTo,
    sender: mockFrom,
    authorization: { isAuthorized: true, signature: "0xvalid" },
    testSeam: {
      receipt: {
        status: "reverted",
        blockNumber: 42001002n,
        transactionHash: mockTxHash,
        from: mockFrom,
        to: mockTo,
        gasUsed: 21000n,
        logs: [],
      },
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.paymentCompleted, false);
  assert.ok(result.onChainReceipt);
  assert.equal(result.onChainReceipt.status, "reverted");
  assert.equal(result.error?.code, "TRANSACTION_REVERTED");
});

test("4.9. Bloom: Native BNB Deep Settlement Verification (Valid & Negative Checks)", async (t) => {
  const adapter = new BloomAdapter();
  const mockTxHash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
  const mockFrom = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const mockTo = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  const attacker = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  const expectedAtomic = 500000000000000000n; // 0.5 BNB (18 decimals)

  // 1. Valid Native BNB Transfer
  const validNative = await adapter.execute({
    amount: "0.5",
    currency: "BNB",
    recipient: mockTo,
    sender: mockFrom,
    authorization: { isAuthorized: true, signature: "0xvalid" },
    testSeam: {
      receipt: {
        status: "success",
        blockNumber: 42001005n,
        transactionHash: mockTxHash,
        from: mockFrom,
        to: mockTo,
        gasUsed: 21000n,
        logs: [],
      },
      transaction: {
        from: mockFrom,
        to: mockTo,
        value: expectedAtomic,
        chainId: 97,
      },
    },
  });

  assert.equal(validNative.success, true);
  assert.equal(validNative.paymentCompleted, true);
  assert.equal(validNative.data?.amount, "0.5");
  assert.equal(validNative.data?.currency, "BNB");
  assert.equal(validNative.data?.protocolRail, "NairaTag Direct Payment (BSC Testnet)");

  // 2. Native Sender Mismatch (Broadcaster / tx.from is attacker)
  const senderMismatch = await adapter.execute({
    amount: "0.5",
    currency: "BNB",
    recipient: mockTo,
    sender: mockFrom,
    authorization: { isAuthorized: true, signature: "0xvalid" },
    testSeam: {
      receipt: {
        status: "success",
        blockNumber: 42001005n,
        transactionHash: mockTxHash,
        from: attacker,
        to: mockTo,
        gasUsed: 21000n,
        logs: [],
      },
      transaction: {
        from: attacker,
        to: mockTo,
        value: expectedAtomic,
      },
    },
  });
  assert.equal(senderMismatch.success, false);
  assert.equal(senderMismatch.error?.code, "NATIVE_SENDER_MISMATCH");

  // 3. Native Recipient Mismatch (Funds went to attacker)
  const recipientMismatch = await adapter.execute({
    amount: "0.5",
    currency: "BNB",
    recipient: mockTo,
    sender: mockFrom,
    authorization: { isAuthorized: true, signature: "0xvalid" },
    testSeam: {
      receipt: {
        status: "success",
        blockNumber: 42001005n,
        transactionHash: mockTxHash,
        from: mockFrom,
        to: attacker,
        gasUsed: 21000n,
        logs: [],
      },
      transaction: {
        from: mockFrom,
        to: attacker,
        value: expectedAtomic,
      },
    },
  });
  assert.equal(recipientMismatch.success, false);
  assert.equal(recipientMismatch.error?.code, "NATIVE_RECIPIENT_MISMATCH");

  // 4. Native Amount Mismatch (Only sent 0.1 BNB instead of 0.5)
  const amountMismatch = await adapter.execute({
    amount: "0.5",
    currency: "BNB",
    recipient: mockTo,
    sender: mockFrom,
    authorization: { isAuthorized: true, signature: "0xvalid" },
    testSeam: {
      receipt: {
        status: "success",
        blockNumber: 42001005n,
        transactionHash: mockTxHash,
        from: mockFrom,
        to: mockTo,
        gasUsed: 21000n,
        logs: [],
      },
      transaction: {
        from: mockFrom,
        to: mockTo,
        value: 100000000000000000n, // 0.1 BNB
      },
    },
  });
  assert.equal(amountMismatch.success, false);
  assert.equal(amountMismatch.error?.code, "NATIVE_AMOUNT_MISMATCH");
});

test("4.10. Bloom: Wallet Authorization Binding (Unapproved Key Substitution Blocked)", async (t) => {
  const adapter = new BloomAdapter();
  const authorizedUser = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const substituteKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // Attacker account

  const origKey = process.env.BNB_TESTNET_PRIVATE_KEY;
  try {
    process.env.BNB_TESTNET_PRIVATE_KEY = substituteKey;

    const res = await adapter.execute(
      {
        amount: "1.0",
        currency: "USDC",
        recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        sender: authorizedUser, // User authorized their own wallet
        authorization: { isAuthorized: true, signature: "0xvalid" },
      },
      { transport: "live" }
    );

    assert.equal(res.success, false);
    assert.equal(res.error?.code, "WALLET_AUTHORIZATION_MISMATCH");
    assert.match(res.error?.message || "", /does not match authorized sender/i);
  } finally {
    process.env.BNB_TESTNET_PRIVATE_KEY = origKey;
  }
});

test("4.11. Bloom: Tag Normalization & Namehash Parity with NairaTagRegistry.sol", async (t) => {
  const { canonicalizeTag, computeTagNode } = await import(
    "../app/agent/src/services/specialists/bloomAdapter.js"
  );

  // 1. Prohibited character '@'
  assert.throws(() => canonicalizeTag("@alice"), /'@' is prohibited/i);

  // 2. Leading and trailing underscore prohibited
  assert.throws(() => canonicalizeTag("_alice"), /underscores cannot be at the start or end/i);
  assert.throws(() => canonicalizeTag("alice_"), /underscores cannot be at the start or end/i);

  // 3. Consecutive underscores prohibited
  assert.throws(() => canonicalizeTag("al__ice"), /consecutive underscores are prohibited/i);

  // 4. Length bounds (3..32)
  assert.throws(() => canonicalizeTag("ab"), /must be between 3 and 32 characters/i);
  assert.throws(() => canonicalizeTag("a".repeat(33)), /must be between 3 and 32 characters/i);

  // 5. Valid tags normalized identically
  assert.equal(canonicalizeTag("₦ALICE"), "alice");
  assert.equal(canonicalizeTag("₦Alice_123"), "alice_123");
  assert.equal(canonicalizeTag("bob"), "bob");

  // 6. Namehash computation parity
  const node1 = computeTagNode("₦ALICE");
  const node2 = computeTagNode("alice");
  assert.equal(node1, node2);
  assert.ok(node1.startsWith("0x") && node1.length === 66);
});

// ===================================================================
// 5. SPECIALIST ADAPTER REGISTRY INTEGRATION TESTS
// ===================================================================

test("5.1. Registry: Multi-Specialist Unified Routing", async (t) => {
  const registry = SpecialistAdapterRegistry.getInstance();

  assert.equal(registry.hasAdapter("₦DEFILLAMA"), true);
  assert.equal(registry.hasAdapter("defillama"), true);
  assert.equal(registry.hasAdapter("₦COINGECKO"), true);
  assert.equal(registry.hasAdapter("coingecko"), true);
  assert.equal(registry.hasAdapter("₦METEO"), true);
  assert.equal(registry.hasAdapter("meteo"), true);
  assert.equal(registry.hasAdapter("₦BLOOM"), true);
  assert.equal(registry.hasAdapter("bloom"), true);

  // Unknown specialist handling
  const unknown = await registry.executeSpecialist("₦NONEXISTENT", {});
  assert.equal(unknown.success, false);
  assert.equal(unknown.error?.code, "ADAPTER_NOT_FOUND");
});
