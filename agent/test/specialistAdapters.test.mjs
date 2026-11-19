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
// 4. ₦BLOOM SPECIALIST ADAPTER TESTS
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
  assert.ok(result.error);
  assert.equal(result.error.code, "MAINNET_SETTLEMENT_DISABLED");
  assert.match(result.error.message, /Mainnet settlement.*is strictly blocked/i);
});

test("4.3. Bloom: Simulation Mode Never Synthesizes Fake Hashes", async (t) => {
  const adapter = new BloomAdapter();
  const result = await adapter.execute({
    amount: "2.5",
    currency: "USDC",
    recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    authorization: { isAuthorized: true, signature: "0xvalid" },
    dryRun: true,
  });

  assert.equal(result.success, true);
  assert.equal(result.metadata.classification, "SIMULATED");
  assert.equal(result.onChainReceipt, undefined); // NO fake on-chain receipt!
  assert.ok(result.data);
  assert.equal(result.data.settlementStatus, "simulated_dry_run");
  assert.equal(result.data.verifiedOnChain, false);
  assert.match(result.data.simulationReason || "", /No fake hash synthesized/i);
});

test("4.4. Bloom: Authentic Receipt Verification (Testnet)", async (t) => {
  const adapter = new BloomAdapter();
  const mockTxHash = "0x89ab12cd34ef5678901234567890abcdef1234567890abcdef1234567890abcd";
  const mockFrom = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  const mockTo = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  const result = await adapter.execute({
    amount: "5.0",
    currency: "USDC",
    recipient: mockTo,
    sender: mockFrom,
    authorization: { isAuthorized: true, signature: "0xvalid" },
    testTxHash: mockTxHash,
    testReceipt: {
      status: "success",
      blockNumber: 42001000n,
      transactionHash: mockTxHash,
      from: mockFrom,
      to: mockTo,
      gasUsed: 21000n,
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.metadata.classification, "LIVE");
  assert.ok(result.onChainReceipt);
  assert.equal(result.onChainReceipt.status, "success");
  assert.equal(result.onChainReceipt.chainId, 97);
  assert.equal(result.onChainReceipt.blockNumber, 42001000);
  assert.equal(result.onChainReceipt.transactionHash, mockTxHash);
  assert.equal(result.onChainReceipt.from.toLowerCase(), mockFrom.toLowerCase());
  assert.equal(result.onChainReceipt.to.toLowerCase(), mockTo.toLowerCase());
  assert.ok((result.onChainReceipt.verifiedOnExplorerUrl || "").includes("testnet.bscscan.com"));
});

test("4.5. Bloom: Reverted On-Chain Transaction Detection", async (t) => {
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
    testTxHash: mockTxHash,
    testReceipt: {
      status: "reverted",
      blockNumber: 42001002n,
      transactionHash: mockTxHash,
      from: mockFrom,
      to: mockTo,
      gasUsed: 21000n,
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.metadata.classification, "LIVE");
  assert.ok(result.onChainReceipt);
  assert.equal(result.onChainReceipt.status, "reverted");
  assert.equal(result.error?.code, "TRANSACTION_REVERTED");
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
