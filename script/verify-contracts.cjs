const fs = require('fs');
const path = require('path');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyContract({
  apiKey,
  address,
  contractName,
  sourceFiles,
  constructorArgs = '',
  compilerVersion = 'v0.8.24+commit.e11b9ed9',
  evmVersion = 'cancun',
  optimizerRuns = 200,
}) {
  const basePath = path.resolve(__dirname, '..');
  const sources = {};
  for (const file of sourceFiles) {
    const fullPath = path.join(basePath, file);
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
        runs: optimizerRuns
      },
      evmVersion: evmVersion,
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
    licenseType: '3'
  });

  const url = `https://api.etherscan.io/v2/api?chainid=97&module=contract&action=verifysourcecode&apikey=${apiKey}`;
  console.log(`\nSubmitting verification for ${contractName} (${address})...`);

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: payload.toString()
  });

  const data = await resp.json();
  if (data.status !== '1') {
    throw new Error(`Verification submission failed: ${data.message} - ${data.result}`);
  }

  const guid = data.result;
  console.log(`Submitted successfully! GUID: ${guid}`);
  console.log('Polling verification status on BscScan Testnet...');

  for (let attempt = 1; attempt <= 30; attempt++) {
    await sleep(5000);
    const checkUrl = `https://api.etherscan.io/v2/api?chainid=97&module=contract&action=checkverifystatus&guid=${guid}&apikey=${apiKey}`;
    const checkResp = await fetch(checkUrl);
    const checkData = await checkResp.json();

    if (checkData.result === 'Pass - Verified' || checkData.result.includes('Already Verified')) {
      console.log(`SUCCESS: ${contractName} is verified on BscScan Testnet!`);
      return { verified: true, guid };
    } else if (checkData.result.includes('Pending in queue')) {
      process.stdout.write('.');
    } else {
      throw new Error(`Verification failed for ${contractName}: ${checkData.result}`);
    }
  }

  throw new Error(`Verification timeout after 150 seconds for GUID: ${guid}`);
}

async function main() {
  const envPath = path.resolve(__dirname, '../.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const keyMatch = envContent.match(/BSCSCAN_API_KEY=(.+)/);
  if (!keyMatch) throw new Error('BSCSCAN_API_KEY missing in .env');
  const apiKey = keyMatch[1].trim();

  const deployPath = path.resolve(__dirname, '../deployments/bsc-testnet.json');
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
  const resConstructorArgs = regAddress.toLowerCase().replace('0x', '').padStart(64, '0');
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

  console.log('\nAll testnet contracts verified on BscScan!');
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal verification error:', err.message);
    process.exit(1);
  });
}

module.exports = { verifyContract };
