/**
 * Production Deployment Script for NairaTag Network on BNB Smart Chain Mainnet (Chain ID 56)
 *
 * SAFETY GUARD:
 * This script will NOT broadcast any transaction unless the environment variable
 * CONFIRM_MAINNET_BROADCAST=true is explicitly set.
 *
 * Deploys in strict dependency order:
 * 1. NairaTagRegistry
 * 2. NairaTagResolver (with registry address)
 * 3. NairaTagAgentIDActivation (with registry address and official Agent ID address)
 *
 * Saves verified deployment metadata to deployments/bsc-mainnet.json.
 */

const fs = require('fs');
const path = require('path');
const { createWalletClient, createPublicClient, http, encodeDeployData, parseAbi } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { bsc } = require('viem/chains');

const OFFICIAL_AGENT_ID = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';
const EXPECTED_CHAIN_ID = 56;

// Load compiled artifacts from Foundry out/ directory
function loadArtifact(contractName) {
  const artifactPath = path.resolve(__dirname, `../out/${contractName}.sol/${contractName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact missing for ${contractName} at ${artifactPath}. Run "forge build" first.`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
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
  const envContent = fs.readFileSync(envPath, 'utf8');
  const pkMatch = envContent.match(/PRIVATE_KEY=(0x[a-fA-F0-9]{64})/);
  const rpcMatch = envContent.match(/BSC_MAINNET_RPC_URL=(.+)/);

  if (!pkMatch) throw new Error('PRIVATE_KEY missing or invalid in .env');
  const rpcUrl = rpcMatch ? rpcMatch[1].trim() : 'https://bsc-dataseed.binance.org';

  const account = privateKeyToAccount(pkMatch[1]);
  console.log('Deployer Address :', account.address);
  console.log('Network          :', bsc.name, `(Chain ID: ${bsc.id})`);
  console.log('RPC Endpoint     :', rpcUrl);

  const publicClient = createPublicClient({ chain: bsc, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: bsc, transport: http(rpcUrl) });

  const chainId = await publicClient.getChainId();
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`CRITICAL: Connected to wrong Chain ID: ${chainId}. Expected 56 (BSC Mainnet). Aborting.`);
  }

  // Pre-flight balance check
  const balance = await publicClient.getBalance({ address: account.address });
  const gasPrice = await publicClient.getGasPrice();
  console.log(`Current Balance  : ${balance.toString()} wei (${(Number(balance) / 1e18).toFixed(6)} BNB)`);
  console.log(`Current Gas Price: ${gasPrice.toString()} wei (${(Number(gasPrice) / 1e9).toFixed(2)} Gwei)\n`);

  if (balance === 0n) {
    throw new Error('CRITICAL: Deployer balance is 0 BNB. Deployment cannot proceed without funds.');
  }

  // Check official Agent ID bytecode exists on-chain
  const agentIdCode = await publicClient.getBytecode({ address: OFFICIAL_AGENT_ID });
  if (!agentIdCode || agentIdCode === '0x') {
    throw new Error(`CRITICAL: No bytecode found at official Agent ID ${OFFICIAL_AGENT_ID} on Mainnet!`);
  }

  const artifacts = {
    registry: loadArtifact('NairaTagRegistry'),
    resolver: loadArtifact('NairaTagResolver'),
    activation: loadArtifact('NairaTagAgentIDActivation'),
  };

  const deployment = {
    network: 'bsc-mainnet',
    chainId: EXPECTED_CHAIN_ID,
    deployer: account.address,
    timestamp: new Date().toISOString(),
    contracts: {},
    explorers: {},
  };

  // ----------------------------------------------------
  // Step 1: Deploy NairaTagRegistry
  // ----------------------------------------------------
  console.log('Deploying NairaTagRegistry...');
  const regDeployData = encodeDeployData({
    abi: artifacts.registry.abi,
    bytecode: artifacts.registry.bytecode.object,
    args: [],
  });
  const regTxHash = await walletClient.sendTransaction({ data: regDeployData });
  console.log(`  Tx Broadcast: ${regTxHash}`);
  const regReceipt = await publicClient.waitForTransactionReceipt({ hash: regTxHash });
  const registryAddress = regReceipt.contractAddress;
  console.log(`  Deployed At : ${registryAddress} (Block ${regReceipt.blockNumber}, Gas: ${regReceipt.gasUsed})\n`);

  deployment.contracts.NairaTagRegistry = {
    address: registryAddress,
    transactionHash: regTxHash,
    blockNumber: Number(regReceipt.blockNumber),
    gasUsed: regReceipt.gasUsed.toString(),
  };

  // ----------------------------------------------------
  // Step 2: Deploy NairaTagResolver
  // ----------------------------------------------------
  console.log('Deploying NairaTagResolver...');
  const resDeployData = encodeDeployData({
    abi: artifacts.resolver.abi,
    bytecode: artifacts.resolver.bytecode.object,
    args: [registryAddress],
  });
  const resTxHash = await walletClient.sendTransaction({ data: resDeployData });
  console.log(`  Tx Broadcast: ${resTxHash}`);
  const resReceipt = await publicClient.waitForTransactionReceipt({ hash: resTxHash });
  const resolverAddress = resReceipt.contractAddress;
  console.log(`  Deployed At : ${resolverAddress} (Block ${resReceipt.blockNumber}, Gas: ${resReceipt.gasUsed})\n`);

  deployment.contracts.NairaTagResolver = {
    address: resolverAddress,
    transactionHash: resTxHash,
    blockNumber: Number(resReceipt.blockNumber),
    gasUsed: resReceipt.gasUsed.toString(),
    constructorArgs: { registry: registryAddress },
  };

  // ----------------------------------------------------
  // Step 3: Deploy NairaTagAgentIDActivation
  // ----------------------------------------------------
  console.log('Deploying NairaTagAgentIDActivation...');
  const actDeployData = encodeDeployData({
    abi: artifacts.activation.abi,
    bytecode: artifacts.activation.bytecode.object,
    args: [registryAddress, OFFICIAL_AGENT_ID],
  });
  const actTxHash = await walletClient.sendTransaction({ data: actDeployData });
  console.log(`  Tx Broadcast: ${actTxHash}`);
  const actReceipt = await publicClient.waitForTransactionReceipt({ hash: actTxHash });
  const activationAddress = actReceipt.contractAddress;
  console.log(`  Deployed At : ${activationAddress} (Block ${actReceipt.blockNumber}, Gas: ${actReceipt.gasUsed})\n`);

  deployment.contracts.NairaTagAgentIDActivation = {
    address: activationAddress,
    transactionHash: actTxHash,
    blockNumber: Number(actReceipt.blockNumber),
    gasUsed: actReceipt.gasUsed.toString(),
    constructorArgs: {
      registry: registryAddress,
      agentIdContract: OFFICIAL_AGENT_ID,
    },
  };

  // Set explorer links
  deployment.explorers = {
    registryUrl: `https://bscscan.com/address/${registryAddress}#code`,
    resolverUrl: `https://bscscan.com/address/${resolverAddress}#code`,
    activationUrl: `https://bscscan.com/address/${activationAddress}#code`,
  };

  // Save manifest
  const manifestPath = path.resolve(__dirname, '../deployments/bsc-mainnet.json');
  fs.writeFileSync(manifestPath, JSON.stringify(deployment, null, 2), 'utf8');
  console.log(`Deployment manifest written to ${manifestPath}`);
  console.log('Deployment complete! Ready for BscScan source verification.');
}

main().catch(err => {
  console.error('Fatal deployment error:', err.message);
  process.exit(1);
});
