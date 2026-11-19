/**
 * Test Suite: NairaTag Open Specialist Agent Directory & Profile Service (Step 7B)
 *
 * Verifies:
 * 1. Tag normalization and canonical formatting (rejection of @ symbol, proper ₦ formatting).
 * 2. Pre-seeded ecosystem agents (₦BLOOM, ₦DEFILLAMA, ₦METEO, ₦COINGECKO).
 * 3. Dynamic third-party agent registration (open ecosystem architecture).
 * 4. Multi-dimensional discovery (by category, capability, keyword, latency, and trust tier).
 * 5. Anti-spoofing dual-sided identity verification.
 * 6. Update and unregistration permissions (enforcing tag ownership boundaries).
 * 7. On-chain resolution sync simulation.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTag,
  formatCanonicalTag,
  computeTagNode,
  AgentProfileService,
} from "../app/agent/src/services/agentProfileService.ts";
import {
  SpecialistAgentDirectory,
  REFERENCE_ECOSYSTEM_AGENTS,
} from "../app/agent/src/services/specialistDirectory.ts";

test("1. Tag Normalization & Validation", async (t) => {
  // Canonical normalization
  assert.equal(normalizeTag("₦BLOOM"), "bloom");
  assert.equal(normalizeTag("bloom"), "bloom");
  assert.equal(normalizeTag("₦DeFi_Llama"), "defi_llama");
  assert.equal(formatCanonicalTag("bloom"), "₦BLOOM");
  assert.equal(formatCanonicalTag("₦bloom"), "₦BLOOM");

  // Rejection of '@' symbol
  assert.throws(() => normalizeTag("@bloom"), /@.*strictly prohibited/);
  assert.throws(() => normalizeTag("bloom@tag"), /@.*strictly prohibited/);

  // Rejection of invalid lengths & characters
  assert.throws(() => normalizeTag("a"), /length/);
  assert.throws(() => normalizeTag("a".repeat(33)), /length/);
  assert.throws(() => normalizeTag("_bloom"), /Invalid tag format/);
  assert.throws(() => normalizeTag("bloom_"), /Invalid tag format/);
  assert.throws(() => normalizeTag("bloom__agent"), /Invalid tag format/);

  // Compute tag node hash is deterministic 32-byte hex
  const node = computeTagNode("bloom");
  assert.match(node, /^0x[0-9a-f]{64}$/);
});

test("2. Seed Reference Ecosystem Agents Initialization", async () => {
  const directory = new SpecialistAgentDirectory();
  await directory.init();

  const allAgents = await directory.listAllAgents();
  assert.equal(allAgents.length, 4, "Should initialize with 4 reference ecosystem agents");

  // Verify ₦BLOOM
  const bloom = await directory.getAgentByTag("₦BLOOM");
  assert.ok(bloom, "₦BLOOM should be found");
  assert.equal(bloom.tag, "₦BLOOM");
  assert.equal(bloom.canonicalName, "bloom");
  assert.equal(bloom.capabilities[0].id, "settlement.usdc");

  // Verify case-insensitive lookup
  const defillama = await directory.getAgentByTag("defillama");
  assert.ok(defillama, "defillama should be found via lowercase string");
  assert.equal(defillama.tag, "₦DEFILLAMA");

  // Verify address lookup
  const meteoByAddr = await directory.getAgentByAddress("0x235d6C2DEE61536B8f0c97d6B00c2E299Cdfae36");
  assert.ok(meteoByAddr, "₦METEO should be resolved by address");
  assert.equal(meteoByAddr.tag, "₦METEO");
});

test("3. Open Ecosystem: Third-Party Agent Registration", async () => {
  const directory = new SpecialistAgentDirectory();
  await directory.init();

  const thirdPartyOwner = "0x1111111111111111111111111111111111111111";

  // Register independent security audit agent
  const registered = await directory.registerAgent(
    {
      tag: "₦SECUREAUDIT",
      name: "SecureAudit Bytecode Inspector",
      description: "Automated bytecode analysis and smart contract vulnerability scanner.",
      author: "Third-Party Security Labs",
      version: "1.0.0",
      owner: thirdPartyOwner,
      capabilities: [
        {
          id: "security.audit",
          category: "security",
          name: "Smart Contract Vulnerability Scan",
          description: "Detects reentrancy, access control flaws, and unhandled exceptions.",
          tags: ["security", "audit", "vulnerability", "solidity"],
          pricing: { model: "fixed_per_request", amount: "0.05", currency: "BNB" },
          estimatedLatencyMs: 1200,
        },
      ],
      endpoints: {
        a2a: "https://audit.secureservice.io/a2a",
        mcp: "https://audit.secureservice.io/mcp",
      },
    },
    { verifyAgentIdOnChain: false }
  );

  assert.equal(registered.tag, "₦SECUREAUDIT");
  assert.equal(registered.canonicalName, "secureaudit");

  // Verify agent is now in the directory
  const found = await directory.getAgentByTag("secureaudit");
  assert.ok(found, "Third-party agent should be discoverable in directory");
  assert.equal(found.owner.toLowerCase(), thirdPartyOwner.toLowerCase());

  // Check total agents count increased to 5
  const all = await directory.listAllAgents();
  assert.equal(all.length, 5);
});

test("4. Semantic Capability Discovery & Multi-Dimensional Filtering", async () => {
  const directory = new SpecialistAgentDirectory();
  await directory.init();

  // A. Category filter: "payments"
  const paymentResults = await directory.discoverAgents({ category: "payments" });
  assert.ok(paymentResults.totalMatches >= 1);
  assert.equal(paymentResults.results[0].agent.tag, "₦BLOOM");
  assert.ok(paymentResults.results[0].relevanceScore > 0);

  // B. Category filter: "defi"
  const defiResults = await directory.discoverAgents({ category: "defi" });
  const defiTags = defiResults.results.map((r) => r.agent.tag);
  assert.ok(defiTags.includes("₦DEFILLAMA"));
  assert.ok(defiTags.includes("₦COINGECKO"));

  // C. Specific capability: "weather.logistics"
  const weatherResults = await directory.discoverAgents({ capability: "weather.logistics" });
  assert.equal(weatherResults.totalMatches, 1);
  assert.equal(weatherResults.results[0].agent.tag, "₦METEO");

  // D. Keyword search: "TVL"
  const tvlResults = await directory.discoverAgents({ keyword: "TVL" });
  assert.ok(tvlResults.totalMatches >= 1);
  assert.equal(tvlResults.results[0].agent.tag, "₦DEFILLAMA");

  // E. Keyword search across capability tags: "oracle"
  const oracleResults = await directory.discoverAgents({ keyword: "oracle" });
  assert.ok(oracleResults.totalMatches >= 1);
  assert.equal(oracleResults.results[0].agent.tag, "₦COINGECKO");

  // F. Max latency filter
  const lowLatencyResults = await directory.discoverAgents({ maxLatencyMs: 300 });
  const lowLatencyTags = lowLatencyResults.results.map((r) => r.agent.tag);
  assert.ok(lowLatencyTags.includes("₦COINGECKO"));
  assert.ok(!lowLatencyTags.includes("₦METEO")); // Meteo min latency is 350ms
});

test("5. Anti-Spoofing Dual-Sided Verification Check", async () => {
  const directory = new SpecialistAgentDirectory();
  const owner = "0x2222222222222222222222222222222222222222";
  const celebrityIdentity = "0x961d16fD035d0367DC4A08b6c0d41061901A14AA";

  // Case A: Owner equals designated identity address -> Verified
  const selfClaimed = await directory.registerAgent(
    {
      tag: "₦SELFBOUND",
      name: "Self Bound Agent",
      description: "Owner is designated identity",
      owner,
      designatedIdentityAddress: owner,
      capabilities: [],
      endpoints: {},
    },
    { verifyAgentIdOnChain: false }
  );
  assert.equal(selfClaimed.isDualSidedVerified, true);

  // Case B: Owner designates someone else without consent signature -> NOT verified
  const unconsented = await directory.registerAgent(
    {
      tag: "₦SPOOFATTEMPT",
      name: "Spoof Attempt Agent",
      description: "Owner claims celebrity identity address without consent",
      owner,
      designatedIdentityAddress: celebrityIdentity,
      capabilities: [],
      endpoints: {},
    },
    { verifyAgentIdOnChain: false }
  );
  assert.equal(
    unconsented.isDualSidedVerified,
    false,
    "Designating third party without consent must fail dual-sided verification"
  );

  // Case C: Owner designates third party WITH valid consent from third party -> Verified
  const consented = await directory.registerAgent(
    {
      tag: "₦CONSENTEDAGENT",
      name: "Consented Agent",
      description: "Owner provides valid dual-sided consent",
      owner,
      designatedIdentityAddress: celebrityIdentity,
      capabilities: [],
      endpoints: {},
      dualSidedConsent: {
        signedBy: celebrityIdentity,
        timestamp: new Date().toISOString(),
      },
    },
    { verifyAgentIdOnChain: false }
  );
  assert.equal(
    consented.isDualSidedVerified,
    true,
    "Consented third-party binding must pass dual-sided verification"
  );
});

test("6. Update and Unregistration Authorization Boundaries", async () => {
  const directory = new SpecialistAgentDirectory();
  const owner = "0x3333333333333333333333333333333333333333";
  const impostor = "0x4444444444444444444444444444444444444444";

  await directory.registerAgent(
    {
      tag: "₦AUTHCHECK",
      name: "Auth Check Agent",
      description: "Tests update permissions",
      owner,
      capabilities: [],
      endpoints: {},
    },
    { verifyAgentIdOnChain: false }
  );

  // Impostor attempts update -> Unauthorized
  await assert.rejects(
    async () => {
      await directory.updateAgent("₦AUTHCHECK", { name: "Hacked Name" }, impostor);
    },
    /Unauthorized/
  );

  // Genuine owner updates -> Success
  const updated = await directory.updateAgent(
    "₦AUTHCHECK",
    { name: "Updated by Owner", description: "New Description" },
    owner
  );
  assert.equal(updated.name, "Updated by Owner");

  // Impostor attempts unregister -> Unauthorized
  await assert.rejects(
    async () => {
      await directory.unregisterAgent("₦AUTHCHECK", impostor);
    },
    /Unauthorized/
  );

  // Owner unregisters -> Success
  const removed = await directory.unregisterAgent("₦AUTHCHECK", owner);
  assert.equal(removed, true);

  const lookup = await directory.getAgentByTag("₦AUTHCHECK");
  assert.equal(lookup, null, "Agent should no longer exist after unregistration");
});

test("7. On-Chain Tag Resolver Sync Simulation", async () => {
  const directory = new SpecialistAgentDirectory();

  // Mock public client that simulates NairaTagRegistry & NairaTagResolver
  const mockNode = computeTagNode("onchainagent");
  const mockOwner = "0x5555555555555555555555555555555555555555";
  const mockPayout = "0x6666666666666666666666666666666666666666";

  const mockClient = {
    async readContract({ address, functionName, args }) {
      if (functionName === "owner") {
        if (args[0] === mockNode) return mockOwner;
        return "0x0000000000000000000000000000000000000000";
      }
      if (functionName === "addr") return mockPayout;
      if (functionName === "text") {
        const key = args[1];
        if (key === "agent.endpoint") return "https://onchain.agent.io/a2a";
        if (key === "agent.kind") return "specialist";
        if (key === "agent.identity_address") return mockOwner;
        return "";
      }
      return "";
    },
    async getBytecode() {
      return "0x1234";
    },
  };

  const synced = await directory.syncWithOnChain("₦ONCHAINAGENT", "bsc-testnet", mockClient);
  assert.ok(synced, "Should successfully sync on-chain agent");
  assert.equal(synced.tag, "₦ONCHAINAGENT");
  assert.equal(synced.owner.toLowerCase(), mockOwner.toLowerCase());
  assert.equal(synced.executionAddress.toLowerCase(), mockPayout.toLowerCase());
  assert.equal(synced.isTagOwnerVerified, true);
  assert.equal(synced.endpoints.a2a, "https://onchain.agent.io/a2a");
});
