/**
 * Production Deployment Script for NairaTag Protocol on BNB Smart Chain Mainnet (Chain ID 56)
 *
 * SAFETY GUARD:
 * This script will NOT broadcast any transaction unless the environment variable
 * CONFIRM_MAINNET_BROADCAST=true is explicitly set.
 *
 * KEY DEFENSIVE ENGINEERING:
 * 1. Derives deployer from PRIVATE_KEY and enforces strict match with DEPLOYER_ADDRESS.
 * 2. Pre-flight bytecode verification of external dependencies (SPACE ID Agent ID).
 * 3. Atomic step-by-step progress persistence to deployments/bsc-mainnet.json.
 * 4. Idempotent resumption: skips already deployed and bytecode-verified contracts.
 * 5. Strict receipt status verification (reverts fail closed).
 * 6. Deployed contract bytecode verification before proceeding to dependent steps.
 * 7. Precise compiler metadata recording (v0.8.24+commit.e11b9ed9, Cancun, 200 runs).
 */

const fs = require('fs');
const path = require('path');
const { createWalletClient, createPublicClient, http, encodeDeployData } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { bsc } = require('viem/chains');

const OFFICIAL_AGENT_ID = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';
const EXPECTED_CHAIN_ID = 56;
const COMPILER_VERSION = 'v0.8.24+commit.e11b9ed9';
const EVM_VERSION = 'cancun';
const OPTIMIZER_RUNS = 200;

function loadArtifact(contractName, baseDir = __dirname) {
  const artifactPath = path.resolve(baseDir, `../out/${contractName}.sol/${contractName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact missing for ${contractName} at ${artifactPath}. Run "forge build" first.`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

function loadManifest(manifestPath) {
  if (fs.existsSync(manifestPath)) {
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

function saveManifest(manifestPath, deploymentData) {
  const dir = path.dirname(manifestPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(manifestPath, JSON.stringify(deploymentData, null, 2), 'utf8');
}

/**
 * Core deployment execution engine (supports dependency injection for testing)
 */
async function executeDeployment({
  envConfig,
  publicClient,
  walletClient,
  manifestPath,
  artifacts,
  confirmBroadcast = false,
}) {
  if (!confirmBroadcast) {
    throw new Error('SAFETY_LOCK_ACTIVE: CONFIRM_MAINNET_BROADCAST is not set to "true". No transactions will be sent.');
  }

  const { privateKey, configuredDeployer } = envConfig;

  // 1. Account derivation and address mismatch protection
  if (!privateKey || !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error('DEPLOYER_KEY_INVALID: PRIVATE_KEY must be a valid 32-byte hex string.');
  }

  const account = privateKeyToAccount(privateKey);
  const derivedAddress = account.address;

  if (!configuredDeployer || configuredDeployer.trim() === '') {
    throw new Error(`DEPLOYER_ADDRESS_MISSING: DEPLOYER_ADDRESS is missing or empty in .env. Derived: ${derivedAddress}`);
  }

  if (derivedAddress.toLowerCase() !== configuredDeployer.trim().toLowerCase()) {
    throw new Error(
      `CRITICAL_DEPLOYER_MISMATCH: Derived deployer (${derivedAddress}) does not match configured DEPLOYER_ADDRESS (${configuredDeployer})!`
    );
  }

  // 2. Chain ID verification
  const chainId = await publicClient.getChainId();
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`CHAIN_ID_MISMATCH: Connected to Chain ID ${chainId}. Expected 56 (BSC Mainnet). Aborting.`);
  }

  // 3. Balance verification
  const balance = await publicClient.getBalance({ address: derivedAddress });
  if (balance === 0n) {
    throw new Error(`INSUFFICIENT_FUNDS: Deployer balance is 0 BNB (${derivedAddress}). Cannot deploy.`);
  }

  // 4. Verify official Agent ID contract on Mainnet
  const agentIdCode = await publicClient.getBytecode({ address: OFFICIAL_AGENT_ID });
  if (!agentIdCode || agentIdCode === '0x') {
    throw new Error(`AGENT_ID_BYTECODE_MISSING: No bytecode found at official Agent ID ${OFFICIAL_AGENT_ID} on Mainnet!`);
  }

  // 5. Load or initialize deployment manifest
  let deployment = loadManifest(manifestPath) || {
    network: 'bsc-mainnet',
    chainId: EXPECTED_CHAIN_ID,
    deployer: derivedAddress,
    timestamp: new Date().toISOString(),
    compiler: COMPILER_VERSION,
    evmVersion: EVM_VERSION,
    optimizationRuns: OPTIMIZER_RUNS,
    contracts: {},
    explorers: {},
  };

  deployment.deployer = derivedAddress;
  deployment.lastRun = new Date().toISOString();

  // Helper to verify deployed bytecode on-chain
  async function verifyBytecodeOnChain(contractName, address) {
    if (!address || address === '0x0000000000000000000000000000000000000000') {
      return false;
    }
    const code = await publicClient.getBytecode({ address });
    return code && code !== '0x' && code.length > 2;
  }

  // ----------------------------------------------------
  // Step 1: NairaTagRegistry
  // ----------------------------------------------------
  let registryAddress = deployment.contracts?.NairaTagRegistry?.address;
  const isRegistryLive = registryAddress ? await verifyBytecodeOnChain('NairaTagRegistry', registryAddress) : false;

  if (isRegistryLive) {
    console.log(`[1/3] NairaTagRegistry already deployed & verified at: ${registryAddress} (Skipping broadcast)`);
  } else {
    console.log('[1/3] Deploying NairaTagRegistry...');
    const regDeployData = encodeDeployData({
      abi: artifacts.registry.abi,
      bytecode: artifacts.registry.bytecode.object,
      args: [],
    });

    const regTxHash = await walletClient.sendTransaction({ data: regDeployData });
    console.log(`  Tx Broadcast: ${regTxHash}`);
    const regReceipt = await publicClient.waitForTransactionReceipt({ hash: regTxHash });

    if (regReceipt.status !== 'success') {
      throw new Error(`DEPLOYMENT_FAILED: NairaTagRegistry deployment transaction reverted! Hash: ${regTxHash}`);
    }

    registryAddress = regReceipt.contractAddress;
    if (!registryAddress) {
      throw new Error(`CONTRACT_ADDRESS_MISSING: Receipt for ${regTxHash} did not return contractAddress!`);
    }

    const hasBytecode = await verifyBytecodeOnChain('NairaTagRegistry', registryAddress);
    if (!hasBytecode) {
      throw new Error(`BYTECODE_VERIFICATION_FAILED: No bytecode found at ${registryAddress} after deployment!`);
    }

    console.log(`  Deployed At : ${registryAddress} (Block ${regReceipt.blockNumber}, Gas: ${regReceipt.gasUsed})\n`);

    deployment.contracts.NairaTagRegistry = {
      address: registryAddress,
      transactionHash: regTxHash,
      blockNumber: Number(regReceipt.blockNumber),
      gasUsed: regReceipt.gasUsed.toString(),
      compiler: COMPILER_VERSION,
      evmVersion: EVM_VERSION,
      optimizationRuns: OPTIMIZER_RUNS,
      verified: false,
    };
    saveManifest(manifestPath, deployment);
  }

  // ----------------------------------------------------
  // Step 2: NairaTagResolver
  // ----------------------------------------------------
  // Verify dependency on-chain
  const regDepOk = await verifyBytecodeOnChain('NairaTagRegistry', registryAddress);
  if (!regDepOk) {
    throw new Error(`DEPENDENCY_MISSING: Cannot deploy Resolver. Registry at ${registryAddress} has no on-chain bytecode.`);
  }

  let resolverAddress = deployment.contracts?.NairaTagResolver?.address;
  const isResolverLive = resolverAddress ? await verifyBytecodeOnChain('NairaTagResolver', resolverAddress) : false;

  if (isResolverLive) {
    console.log(`[2/3] NairaTagResolver already deployed & verified at: ${resolverAddress} (Skipping broadcast)`);
  } else {
    console.log('[2/3] Deploying NairaTagResolver...');
    const resDeployData = encodeDeployData({
      abi: artifacts.resolver.abi,
      bytecode: artifacts.resolver.bytecode.object,
      args: [registryAddress],
    });

    const resTxHash = await walletClient.sendTransaction({ data: resDeployData });
    console.log(`  Tx Broadcast: ${resTxHash}`);
    const resReceipt = await publicClient.waitForTransactionReceipt({ hash: resTxHash });

    if (resReceipt.status !== 'success') {
      throw new Error(`DEPLOYMENT_FAILED: NairaTagResolver deployment transaction reverted! Hash: ${resTxHash}`);
    }

    resolverAddress = resReceipt.contractAddress;
    if (!resolverAddress) {
      throw new Error(`CONTRACT_ADDRESS_MISSING: Receipt for ${resTxHash} did not return contractAddress!`);
    }

    const hasBytecode = await verifyBytecodeOnChain('NairaTagResolver', resolverAddress);
    if (!hasBytecode) {
      throw new Error(`BYTECODE_VERIFICATION_FAILED: No bytecode found at ${resolverAddress} after deployment!`);
    }

    console.log(`  Deployed At : ${resolverAddress} (Block ${resReceipt.blockNumber}, Gas: ${resReceipt.gasUsed})\n`);

    deployment.contracts.NairaTagResolver = {
      address: resolverAddress,
      transactionHash: resTxHash,
      blockNumber: Number(resReceipt.blockNumber),
      gasUsed: resReceipt.gasUsed.toString(),
      compiler: COMPILER_VERSION,
      evmVersion: EVM_VERSION,
      optimizationRuns: OPTIMIZER_RUNS,
      constructorArgs: { registry: registryAddress },
      verified: false,
    };
    saveManifest(manifestPath, deployment);
  }

  // ----------------------------------------------------
  // Step 3: NairaTagAgentIDActivation
  // ----------------------------------------------------
  // Verify both dependencies on-chain
  const agentIdDepOk = await verifyBytecodeOnChain('SPACE_ID_AgentID', OFFICIAL_AGENT_ID);
  if (!agentIdDepOk) {
    throw new Error(`DEPENDENCY_MISSING: Cannot deploy Activation. Official Agent ID at ${OFFICIAL_AGENT_ID} has no bytecode.`);
  }

  let activationAddress = deployment.contracts?.NairaTagAgentIDActivation?.address;
  const isActivationLive = activationAddress ? await verifyBytecodeOnChain('NairaTagAgentIDActivation', activationAddress) : false;

  if (isActivationLive) {
    console.log(`[3/3] NairaTagAgentIDActivation already deployed & verified at: ${activationAddress} (Skipping broadcast)`);
  } else {
    console.log('[3/3] Deploying NairaTagAgentIDActivation...');
    const actDeployData = encodeDeployData({
      abi: artifacts.activation.abi,
      bytecode: artifacts.activation.bytecode.object,
      args: [registryAddress, OFFICIAL_AGENT_ID],
    });

    const actTxHash = await walletClient.sendTransaction({ data: actDeployData });
    console.log(`  Tx Broadcast: ${actTxHash}`);
    const actReceipt = await publicClient.waitForTransactionReceipt({ hash: actTxHash });

    if (actReceipt.status !== 'success') {
      throw new Error(`DEPLOYMENT_FAILED: NairaTagAgentIDActivation deployment transaction reverted! Hash: ${actTxHash}`);
    }

    activationAddress = actReceipt.contractAddress;
    if (!activationAddress) {
      throw new Error(`CONTRACT_ADDRESS_MISSING: Receipt for ${actTxHash} did not return contractAddress!`);
    }

    const hasBytecode = await verifyBytecodeOnChain('NairaTagAgentIDActivation', activationAddress);
    if (!hasBytecode) {
      throw new Error(`BYTECODE_VERIFICATION_FAILED: No bytecode found at ${activationAddress} after deployment!`);
    }

    console.log(`  Deployed At : ${activationAddress} (Block ${actReceipt.blockNumber}, Gas: ${actReceipt.gasUsed})\n`);

    deployment.contracts.NairaTagAgentIDActivation = {
      address: activationAddress,
      transactionHash: actTxHash,
      blockNumber: Number(actReceipt.blockNumber),
      gasUsed: actReceipt.gasUsed.toString(),
      compiler: COMPILER_VERSION,
      evmVersion: EVM_VERSION,
      optimizationRuns: OPTIMIZER_RUNS,
      constructorArgs: {
        registry: registryAddress,
        agentIdContract: OFFICIAL_AGENT_ID,
      },
      verified: false,
    };
    saveManifest(manifestPath, deployment);
  }

  // Update explorer URLs
  deployment.explorers = {
    registryUrl: `https://bscscan.com/address/${registryAddress}#code`,
    resolverUrl: `https://bscscan.com/address/${resolverAddress}#code`,
    activationUrl: `https://bscscan.com/address/${activationAddress}#code`,
  };

  saveManifest(manifestPath, deployment);

  console.log('====================================================');
  console.log('DEPLOYMENT COMPLETE — ALL 3 CONTRACTS LIVE ON BSC MAINNET');
  console.log(`  NairaTagRegistry          : ${registryAddress}`);
  console.log(`  NairaTagResolver          : ${resolverAddress}`);
  console.log(`  NairaTagAgentIDActivation : ${activationAddress}`);
  console.log(`Manifest written to: ${manifestPath}`);
  console.log('====================================================');

  return deployment;
}

async function main() {
  console.log('====================================================');
  console.log('   NAIRATAG PROTOCOL — BSC MAINNET DEPLOYMENT');
  console.log('====================================================\n');

  // SAFETY GUARD
  if (process.env.CONFIRM_MAINNET_BROADCAST !== 'true') {
    console.log('SAFETY LOCK ACTIVE: CONFIRM_MAINNET_BROADCAST is not set to "true".');
    console.log('No transactions will be sent. Set CONFIRM_MAINNET_BROADCAST=true when authorized.');
    process.exit(0);
  }

  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env file missing at: ' + envPath);
  }
  const envContent = fs.readFileSync(envPath, 'utf8');

  const pkMatch = envContent.match(/PRIVATE_KEY=(0x[a-fA-F0-9]{64})/);
  const addrMatch = envContent.match(/DEPLOYER_ADDRESS=(0x[a-fA-F0-9]{40})/);
  const rpcMatch = envContent.match(/BSC_MAINNET_RPC_URL=(.+)/);

  if (!pkMatch) throw new Error('PRIVATE_KEY missing or invalid format in .env');

  const privateKey = pkMatch[1].trim();
  const configuredDeployer = addrMatch ? addrMatch[1].trim() : '';
  const rpcUrl = rpcMatch ? rpcMatch[1].trim() : 'https://bsc-dataseed.binance.org';

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain: bsc, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: bsc, transport: http(rpcUrl) });

  const manifestPath = path.resolve(__dirname, '../deployments/bsc-mainnet.json');
  const artifacts = {
    registry: loadArtifact('NairaTagRegistry'),
    resolver: loadArtifact('NairaTagResolver'),
    activation: loadArtifact('NairaTagAgentIDActivation'),
  };

  await executeDeployment({
    envConfig: { privateKey, configuredDeployer, rpcUrl },
    publicClient,
    walletClient,
    manifestPath,
    artifacts,
    confirmBroadcast: true,
  });
}

if (require.main === module) {
  main().catch(err => {
    console.error('\nFATAL DEPLOYMENT ERROR:\n', err.message);
    process.exit(1);
  });
}

module.exports = {
  executeDeployment,
  loadArtifact,
  loadManifest,
  saveManifest,
  OFFICIAL_AGENT_ID,
  EXPECTED_CHAIN_ID,
  COMPILER_VERSION,
  EVM_VERSION,
  OPTIMIZER_RUNS,
};
