/**
 * Automated BscScan Source Verification Script for BNB Mainnet (Chain ID 56)
 *
 * Verifies:
 * 1. NairaTagRegistry
 * 2. NairaTagResolver (with constructor arguments)
 * 3. NairaTagAgentIDActivation (with constructor arguments)
 *
 * Uses Solidity Standard JSON Input format with exact Foundry build parameters:
 * - Compiler: v0.8.24+commit.e11b9ed9
 * - Optimizer: enabled: true, runs: 200
 * - EVM Version: cancun
 * - License: MIT
 */

const fs = require('fs');
const path = require('path');
const { encodeAbiParameters, parseAbiParameters } = require('viem');

const OFFICIAL_AGENT_ID = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';
const COMPILER_VERSION = 'v0.8.24+commit.e11b9ed9';
const EVM_VERSION = 'cancun';
const OPTIMIZER_RUNS = 200;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyContract({
  apiKey,
  address,
  contractName,
  sourceFiles,
  constructorArgs = '',
  compilerVersion = COMPILER_VERSION,
  evmVersion = EVM_VERSION,
  optimizerRuns = OPTIMIZER_RUNS,
}) {
  const basePath = path.resolve(__dirname, '..');
  const sources = {};
  for (const file of sourceFiles) {
    const fullPath = path.join(basePath, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error('Source file missing: ' + fullPath);
    }
    sources[file] = {
      content: fs.readFileSync(fullPath, 'utf8'),
    };
  }

  const standardJson = {
    language: 'Solidity',
    sources: sources,
    settings: {
      optimizer: {
        enabled: true,
        runs: optimizerRuns,
      },
      evmVersion: evmVersion,
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'metadata'],
        },
      },
    },
  };

  const payload = new URLSearchParams({
    contractaddress: address,
    sourceCode: JSON.stringify(standardJson),
    codeformat: 'solidity-standard-json-input',
    contractname: contractName,
    compilerversion: compilerVersion,
    constructorArguments: constructorArgs.replace(/^0x/, ''),
    licenseType: '3', // MIT
  });

  const submitUrl = `https://api.etherscan.io/v2/api?chainid=56&module=contract&action=verifysourcecode&apikey=${apiKey}`;
  console.log(`Submitting verification for ${contractName} at ${address}...`);
  console.log(`  Compiler: ${compilerVersion} | EVM: ${evmVersion} | Runs: ${optimizerRuns}`);

  const res = await fetch(submitUrl, {
    method: 'POST',
    body: payload,
  }).then(r => r.json());

  if (res.status !== '1') {
    throw new Error(`Verification submission failed for ${contractName}: ${res.message} - ${res.result}`);
  }

  const guid = res.result;
  console.log(`Submitted successfully! GUID: ${guid}`);
  console.log('Polling verification status on BscScan...');

  for (let attempt = 1; attempt <= 30; attempt++) {
    await sleep(5000);
    const checkUrl = `https://api.etherscan.io/v2/api?chainid=56&module=contract&action=checkverifystatus&guid=${guid}&apikey=${apiKey}`;
    const checkRes = await fetch(checkUrl).then(r => r.json());

    if (checkRes.result === 'Pass - Verified' || checkRes.result.includes('Already Verified')) {
      console.log(`\nSUCCESS: ${contractName} is verified on BscScan!`);
      return { verified: true, guid };
    } else if (checkRes.result.includes('Pending in queue')) {
      process.stdout.write('.');
    } else {
      throw new Error(`Verification failed for ${contractName}: ${checkRes.result}`);
    }
  }

  throw new Error(`Verification timeout after 150 seconds for GUID: ${guid}`);
}

async function main() {
  console.log('====================================================');
  console.log('   NAIRATAG PROTOCOL — BSC MAINNET SOURCE VERIFICATION');
  console.log('====================================================\n');

  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env file missing at: ' + envPath);
  }
  const envContent = fs.readFileSync(envPath, 'utf8');
  const keyMatch = envContent.match(/BSCSCAN_API_KEY=(.+)/);
  if (!keyMatch) throw new Error('BSCSCAN_API_KEY missing in .env');
  const apiKey = keyMatch[1].trim();

  const deployPath = path.resolve(__dirname, '../deployments/bsc-mainnet.json');
  if (!fs.existsSync(deployPath)) {
    throw new Error('deployments/bsc-mainnet.json not found. Run deployment script first.');
  }

  const deployment = JSON.parse(fs.readFileSync(deployPath, 'utf8'));

  // 1. Verify NairaTagRegistry
  const regAddress = deployment.contracts.NairaTagRegistry?.address;
  if (!regAddress) throw new Error('NairaTagRegistry address missing in deployments/bsc-mainnet.json');

  const regVer = await verifyContract({
    apiKey,
    address: regAddress,
    contractName: 'src/NairaTagRegistry.sol:NairaTagRegistry',
    sourceFiles: [
      'src/NairaTagRegistry.sol',
      'src/interfaces/INairaTagRegistry.sol',
      'src/interfaces/INairaTagResolver.sol',
      'src/interfaces/IERC165.sol',
    ],
  });
  deployment.contracts.NairaTagRegistry.verified = true;
  deployment.contracts.NairaTagRegistry.guid = regVer.guid;
  fs.writeFileSync(deployPath, JSON.stringify(deployment, null, 2), 'utf8');

  // 2. Verify NairaTagResolver
  const resAddress = deployment.contracts.NairaTagResolver?.address;
  if (!resAddress) throw new Error('NairaTagResolver address missing in deployments/bsc-mainnet.json');

  const resConstructorArgs = encodeAbiParameters(
    parseAbiParameters('address registry'),
    [regAddress]
  );
  const resVer = await verifyContract({
    apiKey,
    address: resAddress,
    contractName: 'src/NairaTagResolver.sol:NairaTagResolver',
    sourceFiles: [
      'src/NairaTagResolver.sol',
      'src/interfaces/INairaTagResolver.sol',
      'src/interfaces/INairaTagRegistry.sol',
      'src/interfaces/IERC165.sol',
    ],
    constructorArgs: resConstructorArgs,
  });
  deployment.contracts.NairaTagResolver.verified = true;
  deployment.contracts.NairaTagResolver.guid = resVer.guid;
  fs.writeFileSync(deployPath, JSON.stringify(deployment, null, 2), 'utf8');

  // 3. Verify NairaTagAgentIDActivation
  const actAddress = deployment.contracts.NairaTagAgentIDActivation?.address;
  if (!actAddress) throw new Error('NairaTagAgentIDActivation address missing in deployments/bsc-mainnet.json');

  const actConstructorArgs = encodeAbiParameters(
    parseAbiParameters('address registry, address agentIdContract'),
    [regAddress, OFFICIAL_AGENT_ID]
  );
  const actVer = await verifyContract({
    apiKey,
    address: actAddress,
    contractName: 'src/NairaTagAgentIDActivation.sol:NairaTagAgentIDActivation',
    sourceFiles: [
      'src/NairaTagAgentIDActivation.sol',
      'src/interfaces/INairaTagAgentIDActivation.sol',
      'src/interfaces/INairaTagRegistry.sol',
      'src/interfaces/INairaTagResolver.sol',
      'src/interfaces/IBinanceAgentID.sol',
      'src/interfaces/IERC165.sol',
    ],
    constructorArgs: actConstructorArgs,
  });
  deployment.contracts.NairaTagAgentIDActivation.verified = true;
  deployment.contracts.NairaTagAgentIDActivation.guid = actVer.guid;
  fs.writeFileSync(deployPath, JSON.stringify(deployment, null, 2), 'utf8');

  console.log('\nAll 3 contracts verified successfully on BscScan!');
}

if (require.main === module) {
  main().catch(err => {
    console.error('\nFatal verification error:\n', err.message);
    process.exit(1);
  });
}

module.exports = {
  verifyContract,
  COMPILER_VERSION,
  EVM_VERSION,
  OPTIMIZER_RUNS,
  OFFICIAL_AGENT_ID,
};
