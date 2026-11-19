/**
 * Pre-Flight Verification & Simulation Script: BNB Smart Chain Mainnet
 *
 * Inspects all prerequisites for deploying the NairaTag protocol stack to BSC Mainnet (Chain ID 56):
 * 1. Safe .env loading without exposing private keys.
 * 2. Cryptographic derivation of deployer address from PRIVATE_KEY.
 * 3. Strict alignment check between derived address and DEPLOYER_ADDRESS.
 * 4. RPC connectivity and Chain ID check (strictly 56).
 * 5. Official SPACE ID Agent ID contract bytecode validation on Mainnet.
 * 6. Real-time balance and gas price query.
 * 7. Accurate gas budget calculation and safety buffer recommendation.
 */

const fs = require('fs');
const path = require('path');
const { createPublicClient, http, formatEther, formatGwei } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { bsc } = require('viem/chains');

const OFFICIAL_AGENT_ID = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';
const EXPECTED_CHAIN_ID = 56;

// Measured gas consumption per contract deployment from Foundry tests & testnet receipts
const GAS_ESTIMATES = {
  NairaTagRegistry: 1226763n,
  NairaTagResolver: 1328597n,
  NairaTagAgentIDActivation: 750000n,
};
const TOTAL_ESTIMATED_GAS =
  GAS_ESTIMATES.NairaTagRegistry +
  GAS_ESTIMATES.NairaTagResolver +
  GAS_ESTIMATES.NairaTagAgentIDActivation;

/**
 * Pure evaluation function for testing and preflight checks
 */
async function evaluatePreflight(config, customClient = null) {
  const { privateKey, configuredDeployer, rpcUrl } = config;

  // 1. Validate Private Key presence & format
  if (!privateKey || !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error('DEPLOYER_KEY_INVALID: PRIVATE_KEY must be a valid 32-byte hex string (0x + 64 hex chars).');
  }

  // 2. Derive deployer address
  let derivedDeployer;
  try {
    const account = privateKeyToAccount(privateKey);
    derivedDeployer = account.address;
  } catch (err) {
    throw new Error(`DEPLOYER_DERIVATION_FAILED: Failed to derive address from private key: ${err.message}`);
  }

  // 3. Strict comparison with DEPLOYER_ADDRESS
  if (!configuredDeployer || configuredDeployer.trim() === '') {
    throw new Error(
      `DEPLOYER_ADDRESS_MISSING: DEPLOYER_ADDRESS is empty in .env.\n` +
      `  Derived Address from PRIVATE_KEY: ${derivedDeployer}\n` +
      `  Please configure DEPLOYER_ADDRESS=${derivedDeployer} in .env to confirm intended deployment account.`
    );
  }

  if (derivedDeployer.toLowerCase() !== configuredDeployer.trim().toLowerCase()) {
    throw new Error(
      `CRITICAL_DEPLOYER_MISMATCH: Address derived from PRIVATE_KEY does NOT match DEPLOYER_ADDRESS in .env!\n` +
      `  Derived Address:    ${derivedDeployer}\n` +
      `  Configured Address: ${configuredDeployer}\n` +
      `  Aborting to prevent funding or deploying from the wrong account.`
    );
  }

  // 4. RPC & Public Client
  const client = customClient || createPublicClient({
    chain: bsc,
    transport: http(rpcUrl || 'https://bsc-dataseed.binance.org', { timeout: 10000 }),
  });

  // 5. Chain ID Verification
  const chainId = await client.getChainId();
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`CHAIN_ID_MISMATCH: Connected to Chain ID ${chainId}, expected ${EXPECTED_CHAIN_ID} (BSC Mainnet).`);
  }

  // 6. Verify Official SPACE ID Agent ID Contract Bytecode
  const agentIdCode = await client.getBytecode({ address: OFFICIAL_AGENT_ID });
  if (!agentIdCode || agentIdCode === '0x') {
    throw new Error(`AGENT_ID_BYTECODE_MISSING: No bytecode found at official Agent ID address ${OFFICIAL_AGENT_ID} on Mainnet!`);
  }

  // 7. Gas & Balance
  const gasPrice = await client.getGasPrice();
  const balance = await client.getBalance({ address: derivedDeployer });

  const estimatedCostWei = TOTAL_ESTIMATED_GAS * gasPrice;
  // 50% buffer margin recommended
  const recommendedBufferWei = (estimatedCostWei * 150n) / 100n;
  const isFunded = balance >= estimatedCostWei;

  return {
    derivedDeployer,
    configuredDeployer,
    chainId,
    agentIdAddress: OFFICIAL_AGENT_ID,
    agentIdBytecodeBytes: agentIdCode.length / 2 - 1,
    gasPrice,
    gasPriceGwei: formatGwei(gasPrice),
    balance,
    balanceBnb: formatEther(balance),
    totalEstimatedGas: TOTAL_ESTIMATED_GAS,
    gasEstimates: GAS_ESTIMATES,
    estimatedCostWei,
    estimatedCostBnb: formatEther(estimatedCostWei),
    recommendedBufferWei,
    recommendedBufferBnb: formatEther(recommendedBufferWei),
    isFunded,
  };
}

async function runPreflight(options = {}) {
  const envPath = options.envPath || path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env file missing at: ' + envPath);
  }
  const envContent = fs.readFileSync(envPath, 'utf8');

  const addrMatch = envContent.match(/DEPLOYER_ADDRESS=(0x[a-fA-F0-9]{40})/);
  const pkMatch = envContent.match(/PRIVATE_KEY=(0x[a-fA-F0-9]{64})/);
  const rpcMatch = envContent.match(/BSC_MAINNET_RPC_URL=(.+)/);

  const privateKey = pkMatch ? pkMatch[1].trim() : null;
  const configuredDeployer = addrMatch ? addrMatch[1].trim() : '';
  const rpcUrl = rpcMatch ? rpcMatch[1].trim() : 'https://bsc-dataseed.binance.org';

  console.log('====================================================');
  console.log('   NAIRATAG PROTOCOL — BSC MAINNET PRE-FLIGHT CHECK');
  console.log('====================================================\n');

  console.log('[1/5] Checking Configuration & Account Derivation:');
  console.log('  Target Network   : BNB Smart Chain Mainnet (Chain ID 56)');
  console.log('  RPC Endpoint     :', rpcUrl);
  console.log('  Private Key      : [PROTECTED — 32 bytes verified]');

  const result = await evaluatePreflight({ privateKey, configuredDeployer, rpcUrl });

  console.log('  Derived Deployer :', result.derivedDeployer);
  console.log('  Configured in Env:', result.configuredDeployer);
  console.log('  Account Match    : PASS (Cryptographically verified)\n');

  console.log('[2/5] Verifying Chain ID:');
  console.log(`  Chain ID confirmed: ${result.chainId} (BSC Mainnet) [PASS]\n`);

  console.log('[3/5] Verifying Official SPACE ID Agent ID Contract:');
  console.log('  Contract Address :', result.agentIdAddress);
  console.log(`  Bytecode Size    : ${result.agentIdBytecodeBytes} bytes [PASS]\n`);

  console.log('[4/5] Checking Real-Time Gas & Deployer Balance:');
  console.log(`  Current Gas Price: ${result.gasPriceGwei} Gwei (${result.gasPrice.toString()} wei)`);
  console.log(`  Deployer Balance : ${result.balanceBnb} BNB (${result.balance.toString()} wei)\n`);

  console.log('[5/5] Calculating Deployment Gas Budget:');
  console.log('  Total Est. Gas   : ' + result.totalEstimatedGas.toString() + ' gas units');
  console.log('    - NairaTagRegistry          : ~' + result.gasEstimates.NairaTagRegistry.toString() + ' gas');
  console.log('    - NairaTagResolver          : ~' + result.gasEstimates.NairaTagResolver.toString() + ' gas');
  console.log('    - NairaTagAgentIDActivation : ~' + result.gasEstimates.NairaTagAgentIDActivation.toString() + ' gas');
  console.log('  Est. Deployment Cost : ' + result.estimatedCostBnb + ' BNB');
  console.log('  Rec. Minimum Buffer  : ' + result.recommendedBufferBnb + ' BNB (~0.005 - 0.010 BNB recommended)\n');

  console.log('====================================================');
  if (result.isFunded) {
    console.log('STATUS: READY FOR BROADCAST (Subject to user confirmation)');
  } else {
    console.log('STATUS: PREPARATION COMPLETE — AWAITING DEPLOYER FUNDING');
    console.log(`NOTICE: Deployer balance (${result.balanceBnb} BNB) is below estimated deployment cost (${result.estimatedCostBnb} BNB).`);
    console.log('Do not broadcast until funds are deposited and user approval is provided.');
  }
  console.log('====================================================');

  return result;
}

if (require.main === module) {
  runPreflight().catch(err => {
    console.error('\nPREFLIGHT ERROR:\n', err.message);
    process.exit(1);
  });
}

module.exports = {
  runPreflight,
  evaluatePreflight,
  OFFICIAL_AGENT_ID,
  EXPECTED_CHAIN_ID,
  GAS_ESTIMATES,
  TOTAL_ESTIMATED_GAS,
};
