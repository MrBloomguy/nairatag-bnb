/**
 * Automated BscScan Source Verification Script for BNB Mainnet (Chain ID 56)
 *
 * Verifies:
 * 1. NairaTagRegistry
 * 2. NairaTagResolver (with constructor arguments)
 * 3. NairaTagAgentIDActivation (with constructor arguments)
 *
 * Uses Solidity Standard JSON Input format with exact compiler v0.8.24 / v0.8.38 and optimizer runs: 200.
 */

const fs = require('fs');
const path = require('path');
const { encodeAbiParameters, parseAbiParameters } = require('viem');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyContract({
  apiKey,
  address,
  contractName,
  sourceFiles,
  constructorArgs = '',
  compilerVersion = 'v0.8.24+commit.e11b9ed9'
}) {
  const basePath = path.resolve(__dirname, '..');
  const sources = {};
  for (const file of sourceFiles) {
    const fullPath = path.join(basePath, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error('Source file missing: ' + fullPath);
    }
    sources[file] = {
      content: fs.readFileSync(fullPath, 'utf8')
    };
  }

  const standardJson = {
    language: 'Solidity',
    sources: sources,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'metadata']
        }
      }
    }
  };

  const payload = new URLSearchParams({
    contractaddress: address,
    sourceCode: JSON.stringify(standardJson),
    codeformat: 'solidity-standard-json-input',
    contractname: contractName,
    compilerversion: compilerVersion,
    constructorArguments: constructorArgs.replace(/^0x/, ''),
    licenseType: '3' // MIT
  });

  const submitUrl = `https://api.etherscan.io/v2/api?chainid=56&module=contract&action=verifysourcecode&apikey=${apiKey}`;
  console.log(`Submitting verification for ${contractName} at ${address}...`);

  const res = await fetch(submitUrl, {
    method: 'POST',
    body: payload
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

    if (checkRes.result === 'Pass - Verified') {
      console.log(`SUCCESS: ${contractName} is verified on BscScan!`);
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
  const regAddress = deployment.contracts.NairaTagRegistry.address;
  await verifyContract({
    apiKey,
    address: regAddress,
    contractName: 'src/NairaTagRegistry.sol:NairaTagRegistry',
    sourceFiles: [
      'src/NairaTagRegistry.sol',
      'src/interfaces/INairaTagRegistry.sol',
      'src/interfaces/INairaTagResolver.sol',
      'src/interfaces/IERC165.sol'
    ]
  });

  // 2. Verify NairaTagResolver
  const resAddress = deployment.contracts.NairaTagResolver.address;
  const resConstructorArgs = encodeAbiParameters(
    parseAbiParameters('address registry'),
    [regAddress]
  );
  await verifyContract({
    apiKey,
    address: resAddress,
    contractName: 'src/NairaTagResolver.sol:NairaTagResolver',
    sourceFiles: [
      'src/NairaTagResolver.sol',
      'src/interfaces/INairaTagResolver.sol',
      'src/interfaces/INairaTagRegistry.sol',
      'src/interfaces/IERC165.sol'
    ],
    constructorArgs: resConstructorArgs
  });

  // 3. Verify NairaTagAgentIDActivation
  const actAddress = deployment.contracts.NairaTagAgentIDActivation.address;
  const actConstructorArgs = encodeAbiParameters(
    parseAbiParameters('address registry, address agentIdContract'),
    [regAddress, '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F']
  );
  await verifyContract({
    apiKey,
    address: actAddress,
    contractName: 'src/NairaTagAgentIDActivation.sol:NairaTagAgentIDActivation',
    sourceFiles: [
      'src/NairaTagAgentIDActivation.sol',
      'src/interfaces/INairaTagAgentIDActivation.sol',
      'src/interfaces/INairaTagRegistry.sol',
      'src/interfaces/IBinanceAgentID.sol',
      'src/interfaces/IERC165.sol'
    ],
    constructorArgs: actConstructorArgs
  });

  console.log('\nAll 3 contracts verified successfully on BscScan!');
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal verification error:', err.message);
    process.exit(1);
  });
}

module.exports = { verifyContract };
