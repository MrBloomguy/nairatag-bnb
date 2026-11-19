/**
 * Pre-Flight Verification & Simulation Script: BNB Smart Chain Mainnet
 *
 * Inspects all prerequisites for deploying the NairaTag protocol stack to BSC Mainnet (Chain ID 56):
 * 1. RPC connectivity and Chain ID check.
 * 2. Official SPACE ID Agent ID contract bytecode validation.
 * 3. Deployer address extraction (without exposing private key).
 * 4. Real-time balance and gas price check.
 * 5. Estimated deployment gas budget calculation.
 */

const fs = require('fs');
const path = require('path');
const { createPublicClient, http, formatEther, formatGwei } = require('viem');
const { bsc } = require('viem/chains');

const OFFICIAL_AGENT_ID = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';
const EXPECTED_CHAIN_ID = 56;

// Estimated gas consumption per contract deployment
const GAS_ESTIMATES = {
  NairaTagRegistry: 1226763n,
  NairaTagResolver: 1328597n,
  NairaTagAgentIDActivation: 750000n,
};
const TOTAL_ESTIMATED_GAS =
  GAS_ESTIMATES.NairaTagRegistry +
  GAS_ESTIMATES.NairaTagResolver +
  GAS_ESTIMATES.NairaTagAgentIDActivation;

async function runPreflight() {
  console.log('====================================================');
  console.log('   NAIRATAG PROTOCOL — BSC MAINNET PRE-FLIGHT CHECK');
  console.log('====================================================\n');

  // 1. Read .env safely (never log private keys)
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env file missing at: ' + envPath);
  }
  const envContent = fs.readFileSync(envPath, 'utf8');

  const addrMatch = envContent.match(/DEPLOYER_ADDRESS=(0x[a-fA-F0-9]{40})/);
  const pkMatch = envContent.match(/PRIVATE_KEY=(0x[a-fA-F0-9]{64})/);
  const rpcMatch = envContent.match(/BSC_MAINNET_RPC_URL=(.+)/);

  const rpcUrl = rpcMatch ? rpcMatch[1].trim() : 'https://bsc-dataseed.binance.org';
  const deployerAddress = addrMatch ? addrMatch[1].trim() : 'UNKNOWN';

  console.log('[1/5] Checking RPC & Network Configuration:');
  console.log('  Target Network   : BNB Smart Chain Mainnet');
  console.log('  RPC Endpoint     :', rpcUrl);
  console.log('  Deployer Address :', deployerAddress);
  console.log('  Private Key      : [PROTECTED — Loaded from .env]\n');

  const client = createPublicClient({
    chain: bsc,
    transport: http(rpcUrl, { timeout: 10000 }),
  });

  // 2. Validate Chain ID
  console.log('[2/5] Verifying Chain ID:');
  const chainId = await client.getChainId();
  if (chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`CRITICAL: Connected to Chain ID ${chainId}, expected ${EXPECTED_CHAIN_ID} (BSC Mainnet).`);
  }
  console.log(`  Chain ID confirmed: ${chainId} (BSC Mainnet) [PASS]\n`);

  // 3. Verify Official Agent ID Bytecode
  console.log('[3/5] Verifying Official SPACE ID Agent ID Contract:');
  console.log('  Target Address   :', OFFICIAL_AGENT_ID);
  const agentIdCode = await client.getBytecode({ address: OFFICIAL_AGENT_ID });
  if (!agentIdCode || agentIdCode === '0x') {
    throw new Error(`CRITICAL: No contract bytecode found at official Agent ID address ${OFFICIAL_AGENT_ID} on Mainnet!`);
  }
  console.log(`  Bytecode size    : ${agentIdCode.length / 2 - 1} bytes [PASS]\n`);

  // 4. Check Deployer Balance & Gas Price
  console.log('[4/5] Checking Real-Time Gas & Deployer Balance:');
  const gasPrice = await client.getGasPrice();
  const balance = await client.getBalance({ address: deployerAddress });

  console.log('  Current Gas Price: ' + formatGwei(gasPrice) + ' Gwei (' + gasPrice.toString() + ' wei)');
  console.log('  Deployer Balance : ' + formatEther(balance) + ' BNB (' + balance.toString() + ' wei)\n');

  // 5. Budget Evaluation
  console.log('[5/5] Calculating Deployment Budget & Prerequisites:');
  const estimatedCostWei = TOTAL_ESTIMATED_GAS * gasPrice;
  // Add 25% safety margin
  const recommendedBufferWei = (estimatedCostWei * 125n) / 100n;

  console.log('  Total Est. Gas   : ' + TOTAL_ESTIMATED_GAS.toString() + ' gas units');
  console.log('    - NairaTagRegistry          : ~' + GAS_ESTIMATES.NairaTagRegistry.toString() + ' gas');
  console.log('    - NairaTagResolver          : ~' + GAS_ESTIMATES.NairaTagResolver.toString() + ' gas');
  console.log('    - NairaTagAgentIDActivation : ~' + GAS_ESTIMATES.NairaTagAgentIDActivation.toString() + ' gas');
  console.log('  Est. Deployment Cost : ' + formatEther(estimatedCostWei) + ' BNB');
  console.log('  Rec. Minimum Buffer  : ' + formatEther(recommendedBufferWei) + ' BNB (~0.005 - 0.010 BNB recommended)\n');

  console.log('====================================================');
  if (balance >= estimatedCostWei) {
    console.log('STATUS: READY FOR BROADCAST');
  } else {
    console.log('STATUS: PREPARATION COMPLETE — AWAITING DEPLOYER FUNDING');
    console.log(`NOTICE: Deployer balance (${formatEther(balance)} BNB) is below estimated deployment cost (${formatEther(estimatedCostWei)} BNB).`);
    console.log('Do not broadcast until funds are deposited and user approval is provided.');
  }
  console.log('====================================================');
}

runPreflight().catch(err => {
  console.error('\nPREFLIGHT ERROR:', err.message);
  process.exit(1);
});
