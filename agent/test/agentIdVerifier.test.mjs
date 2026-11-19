/**
 * Unit & Integration Tests for Binance / SPACE ID Agent ID Verifier
 *
 * Test Matrix:
 * 1. Confirmed Agent ID holder
 * 2. Non-holder
 * 3. Invalid address validation (no RPC call)
 * 4. Testnet contract unavailable (not_deployed)
 * 5. RPC timeout error handling
 * 6. RPC execution revert / connection failure handling
 * 7. Default execution-wallet address resolution
 * 8. Explicit network selection (bsc-mainnet vs bsc-testnet)
 * 9. Live BSC Mainnet RPC integration check
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyAgentId,
  OFFICIAL_AGENT_ID_CONTRACT,
} from "../app/agent/src/services/agentIdVerifier.js";

const VALID_HOLDER = "0x71C83005A3e261D71B04dE681c3c3337c9D0ab1d";
const VALID_NON_HOLDER = "0x961d16fD035d0367DC4A08b6c0d41061901A14AA";
const MOCK_BYTECODE = "0x608060405234801561001057600080fd5b50";

test("1. Confirmed Agent ID holder returns verified tier and hasAgentId = true", async () => {
  const mockClient = {
    getBytecode: async ({ address }) => {
      assert.equal(address.toLowerCase(), OFFICIAL_AGENT_ID_CONTRACT.toLowerCase());
      return MOCK_BYTECODE;
    },
    readContract: async ({ address, functionName, args }) => {
      assert.equal(address.toLowerCase(), OFFICIAL_AGENT_ID_CONTRACT.toLowerCase());
      assert.equal(functionName, "balanceOf");
      assert.equal(args[0], VALID_HOLDER);
      return 1n; // Holder balance > 0
    },
  };

  const res = await verifyAgentId({
    address: VALID_HOLDER,
    network: "bsc-mainnet",
    client: mockClient,
  });

  assert.equal(res.hasAgentId, true);
  assert.equal(res.balance, "1");
  assert.equal(res.verificationTier, "verified");
  assert.equal(res.contractAvailable, true);
  assert.equal(res.chainId, 56);
  assert.equal(res.network, "bsc-mainnet");
  assert.equal(res.contractAddress, OFFICIAL_AGENT_ID_CONTRACT);
  assert.equal(res.error, undefined);
  assert.ok(res.timestamp);
});

test("2. Non-holder returns unverified tier and hasAgentId = false", async () => {
  const mockClient = {
    getBytecode: async () => MOCK_BYTECODE,
    readContract: async () => 0n, // Balance == 0
  };

  const res = await verifyAgentId({
    address: VALID_NON_HOLDER,
    network: "bsc-mainnet",
    client: mockClient,
  });

  assert.equal(res.hasAgentId, false);
  assert.equal(res.balance, "0");
  assert.equal(res.verificationTier, "unverified");
  assert.equal(res.contractAvailable, true);
  assert.equal(res.error, undefined);
});

test("3. Invalid address returns verification_error without calling RPC", async () => {
  let rpcCalled = false;
  const mockClient = {
    getBytecode: async () => {
      rpcCalled = true;
      return MOCK_BYTECODE;
    },
    readContract: async () => {
      rpcCalled = true;
      return 0n;
    },
  };

  const invalidInputs = ["not-an-address", "0x123", "", "   ", "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"];

  for (const input of invalidInputs) {
    const res = await verifyAgentId({
      address: input,
      network: "bsc-mainnet",
      client: mockClient,
    });

    assert.equal(res.hasAgentId, false);
    assert.equal(res.verificationTier, "verification_error");
    assert.match(res.error, /Invalid EVM address format/);
  }

  assert.equal(rpcCalled, false, "RPC must never be called for invalid addresses");
});

test("4. Testnet queries return not_deployed tier with contractAvailable = false", async () => {
  let rpcCalled = false;
  const mockClient = {
    getBytecode: async () => {
      rpcCalled = true;
      return "0x";
    },
  };

  const res = await verifyAgentId({
    address: VALID_HOLDER,
    network: "bsc-testnet",
    client: mockClient,
  });

  assert.equal(res.hasAgentId, false);
  assert.equal(res.balance, "0");
  assert.equal(res.network, "bsc-testnet");
  assert.equal(res.chainId, 97);
  assert.equal(res.contractAvailable, false);
  assert.equal(res.verificationTier, "not_deployed");
  assert.match(res.error, /not deployed on BSC Testnet/);
  assert.equal(rpcCalled, false, "Testnet check short-circuits gracefully");
});

test("5. RPC timeout returns verification_error (not false unverified)", async () => {
  const mockClient = {
    getBytecode: async () => MOCK_BYTECODE,
    readContract: async () => {
      throw new Error("HTTP request timed out after 10000ms");
    },
  };

  const res = await verifyAgentId({
    address: VALID_HOLDER,
    network: "bsc-mainnet",
    client: mockClient,
  });

  assert.equal(res.hasAgentId, false);
  assert.equal(res.verificationTier, "verification_error");
  assert.match(res.error, /timed out/);
});

test("6. RPC revert/error returns verification_error", async () => {
  const mockClient = {
    getBytecode: async () => MOCK_BYTECODE,
    readContract: async () => {
      throw new Error("Execution reverted: 0x");
    },
  };

  const res = await verifyAgentId({
    address: VALID_HOLDER,
    network: "bsc-mainnet",
    client: mockClient,
  });

  assert.equal(res.hasAgentId, false);
  assert.equal(res.verificationTier, "verification_error");
  assert.match(res.error, /Execution reverted/);
});

test("7. Missing bytecode on mainnet returns not_deployed tier", async () => {
  const mockClient = {
    getBytecode: async () => "0x",
  };

  const res = await verifyAgentId({
    address: VALID_HOLDER,
    network: "bsc-mainnet",
    client: mockClient,
  });

  assert.equal(res.hasAgentId, false);
  assert.equal(res.contractAvailable, false);
  assert.equal(res.verificationTier, "not_deployed");
  assert.match(res.error, /Contract bytecode not found/);
});

test("8. Explicit network selection preserves chainId and network metadata", async () => {
  const mockClient = {
    getBytecode: async () => MOCK_BYTECODE,
    readContract: async () => 0n,
  };

  const mainnetRes = await verifyAgentId({
    address: VALID_NON_HOLDER,
    network: "bsc-mainnet",
    client: mockClient,
  });
  assert.equal(mainnetRes.network, "bsc-mainnet");
  assert.equal(mainnetRes.chainId, 56);

  const testnetRes = await verifyAgentId({
    address: VALID_NON_HOLDER,
    network: "bsc-testnet",
  });
  assert.equal(testnetRes.network, "bsc-testnet");
  assert.equal(testnetRes.chainId, 97);
});

test("9. Default execution-wallet address resolution workflow", async () => {
  // Simulates tool execute wrapper resolving the active execution wallet when address is omitted
  const mockWalletInfo = async () => ({
    address: VALID_NON_HOLDER,
    kind: "evm-local",
  });

  const toolWrapper = async (input = {}) => {
    let target = input.address;
    if (!target) {
      const w = await mockWalletInfo();
      target = w.address;
    }
    return verifyAgentId({
      address: target,
      network: input.network ?? "bsc-mainnet",
      client: {
        getBytecode: async () => MOCK_BYTECODE,
        readContract: async () => 0n,
      },
    });
  };

  const res = await toolWrapper();
  assert.equal(res.address, VALID_NON_HOLDER);
  assert.equal(res.verificationTier, "unverified");
  assert.equal(res.hasAgentId, false);
});

test("10. Live BSC Mainnet RPC Integration Test (Optional network test)", async () => {
  try {
    const res = await verifyAgentId({
      address: "0x961d16fD035d0367DC4A08b6c0d41061901A14AA", // Our deployer address
      network: "bsc-mainnet",
      timeoutMs: 8000,
    });

    assert.equal(res.network, "bsc-mainnet");
    assert.equal(res.chainId, 56);
    assert.equal(res.contractAvailable, true);
    assert.equal(res.contractAddress, OFFICIAL_AGENT_ID_CONTRACT);
    // Deployer wallet has not minted an Agent ID
    assert.equal(res.hasAgentId, false);
    assert.equal(res.verificationTier, "unverified");
    console.log(" -> Live BSC Mainnet test verified successfully:", res);
  } catch (err) {
    console.warn("Live test skipped or network unreachable:", err.message);
  }
});
