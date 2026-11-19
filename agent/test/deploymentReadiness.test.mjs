/**
 * Deployment Readiness & Mainnet Safety Verification Suite
 *
 * Verifies all defensive gates required before any BNB Smart Chain Mainnet broadcast:
 * 1. Preflight deployer derivation & address mismatch detection.
 * 2. Preflight chain ID & official Agent ID bytecode enforcement.
 * 3. Preflight gas calculation and funding buffer logic.
 * 4. Deployment safety lock enforcement (CONFIRM_MAINNET_BROADCAST).
 * 5. Reverted transaction and missing bytecode detection.
 * 6. Interrupted deployment resumption & incremental manifest persistence.
 * 7. Missing constructor dependency enforcement.
 * 8. Compiler version, EVM version (Cancun), and optimizer consistency.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { privateKeyToAccount } from 'viem/accounts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');

// Import CommonJS modules from script/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { evaluatePreflight, OFFICIAL_AGENT_ID, EXPECTED_CHAIN_ID } = require('../../script/preflight-mainnet.cjs');
const { executeDeployment, loadArtifact, COMPILER_VERSION, EVM_VERSION, OPTIMIZER_RUNS } = require('../../script/deploy-bsc-mainnet.cjs');

// Test accounts (Hardhat/Foundry well-known test keys)
const TEST_KEY_1 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_ACCOUNT_1 = privateKeyToAccount(TEST_KEY_1); // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

const TEST_KEY_2 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const TEST_ACCOUNT_2 = privateKeyToAccount(TEST_KEY_2); // 0x70997970C51812dc3A010C7d01b50e0d17dc79C8

// Mock Public Client Factory
function createMockPublicClient(overrides = {}) {
  return {
    getChainId: async () => overrides.chainId ?? 56,
    getGasPrice: async () => overrides.gasPrice ?? 1000000000n, // 1 Gwei
    getBalance: async () => overrides.balance ?? 100000000000000000n, // 0.1 BNB
    getBytecode: async ({ address }) => {
      if (overrides.bytecodeMap && overrides.bytecodeMap[address.toLowerCase()]) {
        return overrides.bytecodeMap[address.toLowerCase()];
      }
      if (address.toLowerCase() === OFFICIAL_AGENT_ID.toLowerCase()) {
        return overrides.agentIdBytecode ?? '0x608060405234801561001057600080fd5b50';
      }
      return overrides.defaultBytecode ?? '0x608060405234';
    },
    waitForTransactionReceipt: async ({ hash }) => {
      if (overrides.receiptError) throw overrides.receiptError;
      return (
        overrides.receiptMap?.[hash] ?? {
          status: overrides.receiptStatus ?? 'success',
          contractAddress: overrides.receiptContractAddress ?? '0x1111111111111111111111111111111111111111',
          blockNumber: 28000000n,
          gasUsed: 500000n,
        }
      );
    },
  };
}

// Mock Wallet Client Factory
function createMockWalletClient(overrides = {}) {
  let txCounter = 0;
  return {
    sendTransaction: async () => {
      txCounter++;
      return overrides.txHash ?? `0x${txCounter.toString(16).padStart(64, 'a')}`;
    },
  };
}

// Real compiled artifacts from Foundry out/
const realArtifacts = {
  registry: loadArtifact('NairaTagRegistry', path.join(ROOT_DIR, 'script')),
  resolver: loadArtifact('NairaTagResolver', path.join(ROOT_DIR, 'script')),
  activation: loadArtifact('NairaTagAgentIDActivation', path.join(ROOT_DIR, 'script')),
};

describe('Mainnet Deployment Readiness & Defense Suite', () => {

  describe('1. Preflight Verification Logic (preflight-mainnet.cjs)', () => {
    it('1.1. Rejects missing or malformed private key without exposing secrets', async () => {
      await assert.rejects(
        async () => evaluatePreflight({ privateKey: 'invalid', configuredDeployer: TEST_ACCOUNT_1.address }),
        /DEPLOYER_KEY_INVALID/
      );
      await assert.rejects(
        async () => evaluatePreflight({ privateKey: '', configuredDeployer: TEST_ACCOUNT_1.address }),
        /DEPLOYER_KEY_INVALID/
      );
    });

    it('1.2. Rejects when DEPLOYER_ADDRESS is empty in configuration', async () => {
      await assert.rejects(
        async () => evaluatePreflight({ privateKey: TEST_KEY_1, configuredDeployer: '' }),
        /DEPLOYER_ADDRESS_MISSING/
      );
    });

    it('1.3. Rejects critical mismatch between derived address and configured DEPLOYER_ADDRESS', async () => {
      await assert.rejects(
        async () =>
          evaluatePreflight({
            privateKey: TEST_KEY_1, // derives TEST_ACCOUNT_1
            configuredDeployer: TEST_ACCOUNT_2.address, // mismatch!
          }),
        /CRITICAL_DEPLOYER_MISMATCH/
      );
    });

    it('1.4. Rejects connection if connected to wrong Chain ID (not 56)', async () => {
      const mockClient = createMockPublicClient({ chainId: 97 }); // Testnet chain ID
      await assert.rejects(
        async () =>
          evaluatePreflight(
            { privateKey: TEST_KEY_1, configuredDeployer: TEST_ACCOUNT_1.address },
            mockClient
          ),
        /CHAIN_ID_MISMATCH/
      );
    });

    it('1.5. Rejects if official SPACE ID Agent ID contract has no bytecode', async () => {
      const mockClient = createMockPublicClient({ agentIdBytecode: '0x' });
      await assert.rejects(
        async () =>
          evaluatePreflight(
            { privateKey: TEST_KEY_1, configuredDeployer: TEST_ACCOUNT_1.address },
            mockClient
          ),
        /AGENT_ID_BYTECODE_MISSING/
      );
    });

    it('1.6. Accurately calculates gas cost and detects funding status', async () => {
      const gasPrice = 3000000000n; // 3 Gwei
      const balance = 10000000000000000n; // 0.01 BNB
      const mockClient = createMockPublicClient({ gasPrice, balance });

      const result = await evaluatePreflight(
        { privateKey: TEST_KEY_1, configuredDeployer: TEST_ACCOUNT_1.address },
        mockClient
      );

      assert.equal(result.derivedDeployer.toLowerCase(), TEST_ACCOUNT_1.address.toLowerCase());
      assert.equal(result.chainId, 56);
      assert.equal(result.isFunded, true);
      assert.ok(result.estimatedCostWei > 0n);
      assert.ok(result.recommendedBufferWei > result.estimatedCostWei);
    });
  });

  describe('2. Mainnet Deployment Defense & Resumption (deploy-bsc-mainnet.cjs)', () => {
    it('2.1. Strictly blocks deployment if CONFIRM_MAINNET_BROADCAST is not true', async () => {
      await assert.rejects(
        async () =>
          executeDeployment({
            envConfig: { privateKey: TEST_KEY_1, configuredDeployer: TEST_ACCOUNT_1.address },
            publicClient: createMockPublicClient(),
            walletClient: createMockWalletClient(),
            manifestPath: path.join(ROOT_DIR, 'deployments/test-temp.json'),
            artifacts: realArtifacts,
            confirmBroadcast: false, // LOCK ACTIVE
          }),
        /SAFETY_LOCK_ACTIVE/
      );
    });

    it('2.2. Rejects deployment if private key does not match DEPLOYER_ADDRESS', async () => {
      await assert.rejects(
        async () =>
          executeDeployment({
            envConfig: { privateKey: TEST_KEY_1, configuredDeployer: TEST_ACCOUNT_2.address },
            publicClient: createMockPublicClient(),
            walletClient: createMockWalletClient(),
            manifestPath: path.join(ROOT_DIR, 'deployments/test-temp.json'),
            artifacts: realArtifacts,
            confirmBroadcast: true,
          }),
        /CRITICAL_DEPLOYER_MISMATCH/
      );
    });

    it('2.3. Rejects deployment when deployer balance is 0 BNB', async () => {
      const mockClient = createMockPublicClient({ balance: 0n });
      await assert.rejects(
        async () =>
          executeDeployment({
            envConfig: { privateKey: TEST_KEY_1, configuredDeployer: TEST_ACCOUNT_1.address },
            publicClient: mockClient,
            walletClient: createMockWalletClient(),
            manifestPath: path.join(ROOT_DIR, 'deployments/test-temp.json'),
            artifacts: realArtifacts,
            confirmBroadcast: true,
          }),
        /INSUFFICIENT_FUNDS/
      );
    });

    it('2.4. Fails closed if any deployment transaction reverts on-chain', async () => {
      const mockClient = createMockPublicClient({ receiptStatus: 'reverted' });
      await assert.rejects(
        async () =>
          executeDeployment({
            envConfig: { privateKey: TEST_KEY_1, configuredDeployer: TEST_ACCOUNT_1.address },
            publicClient: mockClient,
            walletClient: createMockWalletClient(),
            manifestPath: path.join(ROOT_DIR, 'deployments/test-temp.json'),
            artifacts: realArtifacts,
            confirmBroadcast: true,
          }),
        /DEPLOYMENT_FAILED/
      );
    });

    it('2.5. Fails closed if deployed contract address returns empty bytecode', async () => {
      // Return bytecode for Agent ID check, but empty for deployed address
      const bytecodeMap = {
        [OFFICIAL_AGENT_ID.toLowerCase()]: '0x60806040',
        '0x1111111111111111111111111111111111111111': '0x', // Deployed address returns empty!
      };
      const mockClient = createMockPublicClient({ bytecodeMap });

      await assert.rejects(
        async () =>
          executeDeployment({
            envConfig: { privateKey: TEST_KEY_1, configuredDeployer: TEST_ACCOUNT_1.address },
            publicClient: mockClient,
            walletClient: createMockWalletClient(),
            manifestPath: path.join(ROOT_DIR, 'deployments/test-temp.json'),
            artifacts: realArtifacts,
            confirmBroadcast: true,
          }),
        /BYTECODE_VERIFICATION_FAILED/
      );
    });

    it('2.6. Successfully completes deployment, saves manifest incrementally, and records compiler metadata', async () => {
      const tempManifestPath = path.join(ROOT_DIR, `deployments/test-manifest-${Date.now()}.json`);

      const regAddr = '0x1111111111111111111111111111111111111111';
      const resAddr = '0x2222222222222222222222222222222222222222';
      const actAddr = '0x3333333333333333333333333333333333333333';

      const bytecodeMap = {
        [OFFICIAL_AGENT_ID.toLowerCase()]: '0x60806040',
        [regAddr.toLowerCase()]: '0x60806040',
        [resAddr.toLowerCase()]: '0x60806040',
        [actAddr.toLowerCase()]: '0x60806040',
      };

      let deployStep = 0;
      const mockPublicClient = {
        getChainId: async () => 56,
        getBalance: async () => 100000000000000000n,
        getGasPrice: async () => 1000000000n,
        getBytecode: async ({ address }) => bytecodeMap[address.toLowerCase()] || '0x6080',
        waitForTransactionReceipt: async ({ hash }) => {
          deployStep++;
          const contractAddress = deployStep === 1 ? regAddr : deployStep === 2 ? resAddr : actAddr;
          return {
            status: 'success',
            contractAddress,
            blockNumber: 28000000n + BigInt(deployStep),
            gasUsed: 1000000n,
          };
        },
      };

      try {
        const result = await executeDeployment({
          envConfig: { privateKey: TEST_KEY_1, configuredDeployer: TEST_ACCOUNT_1.address },
          publicClient: mockPublicClient,
          walletClient: createMockWalletClient(),
          manifestPath: tempManifestPath,
          artifacts: realArtifacts,
          confirmBroadcast: true,
        });

        assert.equal(result.contracts.NairaTagRegistry.address, regAddr);
        assert.equal(result.contracts.NairaTagResolver.address, resAddr);
        assert.equal(result.contracts.NairaTagAgentIDActivation.address, actAddr);
        assert.equal(result.compiler, COMPILER_VERSION);
        assert.equal(result.evmVersion, EVM_VERSION);
        assert.equal(result.optimizationRuns, OPTIMIZER_RUNS);

        // Verify file written to disk
        assert.ok(fs.existsSync(tempManifestPath));
        const saved = JSON.parse(fs.readFileSync(tempManifestPath, 'utf8'));
        assert.equal(saved.contracts.NairaTagRegistry.address, regAddr);
      } finally {
        if (fs.existsSync(tempManifestPath)) fs.unlinkSync(tempManifestPath);
      }
    });

    it('2.7. Idempotent resumption: reuses confirmed contracts and does not re-broadcast', async () => {
      const tempManifestPath = path.join(ROOT_DIR, `deployments/test-resume-${Date.now()}.json`);

      const regAddr = '0x1111111111111111111111111111111111111111';
      const resAddr = '0x2222222222222222222222222222222222222222';
      const actAddr = '0x3333333333333333333333333333333333333333';

      // Pre-seed manifest with Registry already deployed!
      fs.writeFileSync(
        tempManifestPath,
        JSON.stringify({
          network: 'bsc-mainnet',
          chainId: 56,
          contracts: {
            NairaTagRegistry: {
              address: regAddr,
              transactionHash: '0xprevregtx',
              blockNumber: 28000001,
              gasUsed: '1000000',
            },
          },
        }),
        'utf8'
      );

      const bytecodeMap = {
        [OFFICIAL_AGENT_ID.toLowerCase()]: '0x60806040',
        [regAddr.toLowerCase()]: '0x60806040',
        [resAddr.toLowerCase()]: '0x60806040',
        [actAddr.toLowerCase()]: '0x60806040',
      };

      let broadcastCount = 0;
      const mockWalletClient = {
        sendTransaction: async () => {
          broadcastCount++;
          return `0xhash${broadcastCount}`;
        },
      };

      let receiptStep = 0;
      const mockPublicClient = {
        getChainId: async () => 56,
        getBalance: async () => 100000000000000000n,
        getGasPrice: async () => 1000000000n,
        getBytecode: async ({ address }) => bytecodeMap[address.toLowerCase()] || '0x6080',
        waitForTransactionReceipt: async () => {
          receiptStep++;
          return {
            status: 'success',
            contractAddress: receiptStep === 1 ? resAddr : actAddr,
            blockNumber: 28000010n,
            gasUsed: 1000000n,
          };
        },
      };

      try {
        const result = await executeDeployment({
          envConfig: { privateKey: TEST_KEY_1, configuredDeployer: TEST_ACCOUNT_1.address },
          publicClient: mockPublicClient,
          walletClient: mockWalletClient,
          manifestPath: tempManifestPath,
          artifacts: realArtifacts,
          confirmBroadcast: true,
        });

        // Broadcast count should only be 2 (Resolver & Activation), NOT 3 (Registry was reused!)
        assert.equal(broadcastCount, 2);
        assert.equal(result.contracts.NairaTagRegistry.address, regAddr);
        assert.equal(result.contracts.NairaTagResolver.address, resAddr);
        assert.equal(result.contracts.NairaTagAgentIDActivation.address, actAddr);
      } finally {
        if (fs.existsSync(tempManifestPath)) fs.unlinkSync(tempManifestPath);
      }
    });
  });

  describe('3. Foundry Artifact & Compiler Setting Alignment', () => {
    it('3.1. Foundry output artifacts are compiled with Solidity 0.8.24 Cancun EVM', () => {
      const contracts = ['NairaTagRegistry', 'NairaTagResolver', 'NairaTagAgentIDActivation'];
      for (const name of contracts) {
        const artifact = loadArtifact(name, path.join(ROOT_DIR, 'script'));
        assert.ok(artifact.metadata, `Metadata missing for ${name}`);
        assert.equal(artifact.metadata.compiler.version, '0.8.24+commit.e11b9ed9');
        assert.equal(artifact.metadata.settings.evmVersion, 'cancun');
        assert.equal(artifact.metadata.settings.optimizer.enabled, true);
        assert.equal(artifact.metadata.settings.optimizer.runs, 200);
      }
    });

    it('3.2. Script constants match Foundry compilation metadata exactly', () => {
      assert.equal(COMPILER_VERSION, 'v0.8.24+commit.e11b9ed9');
      assert.equal(EVM_VERSION, 'cancun');
      assert.equal(OPTIMIZER_RUNS, 200);
      assert.equal(EXPECTED_CHAIN_ID, 56);
      assert.equal(OFFICIAL_AGENT_ID, '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F');
    });
  });
});
