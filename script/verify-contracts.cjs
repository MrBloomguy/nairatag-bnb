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
  compilerVersion = 'v0.8.38+commit.1835d247'
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
    if (data.result && data.result.toLowerCase().includes('already verified')) {
      console.log(` -> ${contractName} is ALREADY VERIFIED on BscScan.`);
      return true;
    }
    throw new Error(`Verification submission failed for ${contractName}: ${JSON.stringify(data)}`);
  }

  const guid = data.result;
  console.log(` -> Submission accepted. GUID: ${guid}`);
  console.log(' -> Polling verification status...');

  const statusUrl = `https://api.etherscan.io/v2/api?chainid=97&module=contract&action=checkverifystatus&guid=${guid}&apikey=${apiKey}`;

  for (let attempt = 1; attempt <= 15; attempt++) {
    await sleep(4000);
    const sResp = await fetch(statusUrl);
    const sData = await sResp.json();
    console.log(`    [Attempt ${attempt}] Status: ${sData.result}`);
    if (sData.result === 'Pass - Verified' || (typeof sData.result === 'string' && sData.result.includes('Already Verified'))) {
      console.log(` -> 🎉 ${contractName} VERIFICATION PASSED!`);
      return true;
    }
    if (sData.result && sData.result.includes('Fail')) {
      throw new Error(`Verification FAILED for ${contractName}: ${sData.result}`);
    }
  }

  throw new Error(`Verification timed out for ${contractName} (GUID: ${guid})`);
}

async function main() {
  console.log('====================================================');
  console.log('   NAIRATAG PROTOCOL — BSCSCAN SOURCE VERIFICATION');
  console.log('====================================================');

  const envPath = path.resolve(__dirname, '../.env');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const keyMatch = envContent.match(/BSCSCAN_API_KEY=(.+)/);
  if (!keyMatch) {
    throw new Error('BSCSCAN_API_KEY missing in .env');
  }
  const apiKey = keyMatch[1].trim();

  // 1. Verify NairaTagRegistry
  await verifyContract({
    apiKey,
    address: '0x73434d121f46e188b7f12ef048062e79e5119cc3',
    contractName: 'src/NairaTagRegistry.sol:NairaTagRegistry',
    sourceFiles: [
      'src/NairaTagRegistry.sol',
      'src/interfaces/INairaTagRegistry.sol',
      'src/interfaces/INairaTagResolver.sol',
      'src/interfaces/IERC165.sol'
    ],
    constructorArgs: ''
  });

  // 2. Verify NairaTagResolver
  // Constructor argument is registry address padded to 32 bytes
  const resolverArg = '00000000000000000000000073434d121f46e188b7f12ef048062e79e5119cc3';
  await verifyContract({
    apiKey,
    address: '0x2ce440b6c63dc5e1128ab75ddac4d5da850de869',
    contractName: 'src/NairaTagResolver.sol:NairaTagResolver',
    sourceFiles: [
      'src/NairaTagResolver.sol',
      'src/interfaces/INairaTagResolver.sol',
      'src/interfaces/INairaTagRegistry.sol',
      'src/interfaces/IERC165.sol'
    ],
    constructorArgs: resolverArg
  });

  console.log('\n====================================================');
  console.log('   ✅ ALL CONTRACTS SUCCESSFULLY VERIFIED ON BSCSCAN');
  console.log('====================================================');
  console.log('NairaTagRegistry: https://testnet.bscscan.com/address/0x73434d121f46e188b7f12ef048062e79e5119cc3#code');
  console.log('NairaTagResolver: https://testnet.bscscan.com/address/0x2ce440b6c63dc5e1128ab75ddac4d5da850de869#code');
}

main().catch(err => {
  console.error('\n❌ VERIFICATION SCRIPT FAILED:', err);
  process.exit(1);
});
