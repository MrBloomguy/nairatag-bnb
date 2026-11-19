const fs = require('fs');
const path = require('path');
const { createWalletClient, createPublicClient, http } = require('c:/Users/olusegun/.gemini/antigravity-ide/scratch/nairatag-network/node_modules/viem');
const { privateKeyToAccount } = require('c:/Users/olusegun/.gemini/antigravity-ide/scratch/nairatag-network/node_modules/viem/accounts');
const { bscTestnet } = require('c:/Users/olusegun/.gemini/antigravity-ide/scratch/nairatag-network/node_modules/viem/chains');

async function main() {
  console.log('====================================================');
  console.log('   NAIRATAG PROTOCOL — BSC TESTNET DEPLOYMENT');
  console.log('====================================================\n');

  // 1. Load and parse .env safely
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env file not found at: ' + envPath);
  }
  const envContent = fs.readFileSync(envPath, 'utf8');
  const pkMatch = envContent.match(/PRIVATE_KEY=(0x[a-fA-F0-9]{64})/);
  const rpcMatch = envContent.match(/BSC_TESTNET_RPC_URL=(.+)/);

  if (!pkMatch) throw new Error('PRIVATE_KEY missing or invalid in .env');
  const rpcUrl = rpcMatch ? rpcMatch[1].trim() : 'https://bsc-testnet-dataseed.bnbchain.org';

  const account = privateKeyToAccount(pkMatch[1]);
  console.log('Deployer Address :', account.address);
  console.log('Network          :', bscTestnet.name, '(Chain ID: ' + bscTestnet.id + ')');
  console.log('RPC URL          :', rpcUrl);

  const publicClient = createPublicClient({
    chain: bscTestnet,
    transport: http(rpcUrl)
  });

  const walletClient = createWalletClient({
    account,
    chain: bscTestnet,
    transport: http(rpcUrl)
  });

  // Verify chain ID
  const chainId = await publicClient.getChainId();
  if (chainId !== 97) {
    throw new Error(`CRITICAL: Connected to wrong chain ID ${chainId}. Expected 97 (BSC Testnet). Aborting.`);
  }

  // 2. Check balance and gas price
  const balance = await publicClient.getBalance({ address: account.address });
  const gasPrice = await publicClient.getGasPrice();
  console.log('\nCurrent Balance  :', balance.toString(), 'wei (' + (Number(balance) / 1e18).toFixed(6) + ' tBNB)');
  console.log('Current Gas Price:', gasPrice.toString(), 'wei (' + (Number(gasPrice) / 1e9).toFixed(2) + ' Gwei)');

  if (balance === 0n) {
    throw new Error('Deployer wallet has 0 balance. Please fund before deploying.');
  }

  // 3. Load compiled artifacts
  const outDir = path.resolve(__dirname, '../out');
  const registryBin = '0x' + fs.readFileSync(path.join(outDir, 'src_NairaTagRegistry_sol_NairaTagRegistry.bin'), 'utf8').trim();
  const registryAbi = JSON.parse(fs.readFileSync(path.join(outDir, 'src_NairaTagRegistry_sol_NairaTagRegistry.abi'), 'utf8'));

  const resolverBin = '0x' + fs.readFileSync(path.join(outDir, 'src_NairaTagResolver_sol_NairaTagResolver.bin'), 'utf8').trim();
  const resolverAbi = JSON.parse(fs.readFileSync(path.join(outDir, 'src_NairaTagResolver_sol_NairaTagResolver.abi'), 'utf8'));

  // 4. Deploy NairaTagRegistry
  console.log('\n[1/4] Broadcasting NairaTagRegistry deployment...');
  const registryTxHash = await walletClient.deployContract({
    abi: registryAbi,
    bytecode: registryBin,
    gasPrice
  });
  console.log(' -> Transaction Hash:', registryTxHash);
  console.log(' -> Waiting for block confirmation...');

  const registryReceipt = await publicClient.waitForTransactionReceipt({
    hash: registryTxHash,
    confirmations: 1
  });

  if (registryReceipt.status !== 'success') {
    throw new Error('NairaTagRegistry deployment transaction failed on-chain: ' + registryTxHash);
  }

  const registryAddress = registryReceipt.contractAddress;
  console.log(' -> NairaTagRegistry DEPLOYED at:', registryAddress);
  console.log(' -> Gas used:', registryReceipt.gasUsed.toString(), 'Block:', registryReceipt.blockNumber.toString());

  // 5. Deploy NairaTagResolver (with registry constructor argument)
  console.log('\n[2/4] Broadcasting NairaTagResolver deployment (bound to registry)...');
  const resolverTxHash = await walletClient.deployContract({
    abi: resolverAbi,
    bytecode: resolverBin,
    args: [registryAddress],
    gasPrice
  });
  console.log(' -> Transaction Hash:', resolverTxHash);
  console.log(' -> Waiting for block confirmation...');

  const resolverReceipt = await publicClient.waitForTransactionReceipt({
    hash: resolverTxHash,
    confirmations: 1
  });

  if (resolverReceipt.status !== 'success') {
    throw new Error('NairaTagResolver deployment transaction failed on-chain: ' + resolverTxHash);
  }

  const resolverAddress = resolverReceipt.contractAddress;
  console.log(' -> NairaTagResolver DEPLOYED at:', resolverAddress);
  console.log(' -> Gas used:', resolverReceipt.gasUsed.toString(), 'Block:', resolverReceipt.blockNumber.toString());

  // 6. On-chain Verification
  console.log('\n[3/4] Verifying contract states and binding on-chain...');
  const boundRegistry = await publicClient.readContract({
    address: resolverAddress,
    abi: resolverAbi,
    functionName: 'registry'
  });

  console.log(' -> resolver.registry() on-chain:', boundRegistry);
  if (boundRegistry.toLowerCase() !== registryAddress.toLowerCase()) {
    throw new Error(`CRITICAL: Resolver bound registry mismatch! Expected ${registryAddress}, got ${boundRegistry}`);
  }
  console.log(' -> Binding verification: PASSED (100% matched)');

  // Quick sanity check on normalization
  const normalizedTest = await publicClient.readContract({
    address: registryAddress,
    abi: registryAbi,
    functionName: 'normalize',
    args: ['₦MICHEAL']
  });
  console.log(' -> registry.normalize("₦MICHEAL"):', normalizedTest);

  // 7. Save deployment artifact
  console.log('\n[4/4] Writing deployment artifact to deployments/bsc-testnet.json...');
  const deploymentsDir = path.resolve(__dirname, '../deployments');
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentData = {
    network: 'bsc-testnet',
    chainId: 97,
    deployer: account.address,
    timestamp: new Date().toISOString(),
    contracts: {
      NairaTagRegistry: {
        address: registryAddress,
        transactionHash: registryTxHash,
        blockNumber: Number(registryReceipt.blockNumber),
        gasUsed: registryReceipt.gasUsed.toString()
      },
      NairaTagResolver: {
        address: resolverAddress,
        transactionHash: resolverTxHash,
        blockNumber: Number(resolverReceipt.blockNumber),
        gasUsed: resolverReceipt.gasUsed.toString(),
        constructorArgs: {
          registry: registryAddress
        }
      }
    },
    explorers: {
      registryUrl: `https://testnet.bscscan.com/address/${registryAddress}`,
      resolverUrl: `https://testnet.bscscan.com/address/${resolverAddress}`,
      registryTxUrl: `https://testnet.bscscan.com/tx/${registryTxHash}`,
      resolverTxUrl: `https://testnet.bscscan.com/tx/${resolverTxHash}`
    }
  };

  const artifactPath = path.join(deploymentsDir, 'bsc-testnet.json');
  fs.writeFileSync(artifactPath, JSON.stringify(deploymentData, null, 2));
  console.log(' -> Saved artifact to:', artifactPath);

  console.log('\n====================================================');
  console.log('   🎉 DEPLOYMENT COMPLETE & VERIFIED SUCCESSFULLY');
  console.log('====================================================');
  console.log('NairaTagRegistry  :', registryAddress);
  console.log('NairaTagResolver  :', resolverAddress);
  console.log('Registry Tx       :', `https://testnet.bscscan.com/tx/${registryTxHash}`);
  console.log('Resolver Tx       :', `https://testnet.bscscan.com/tx/${resolverTxHash}`);
  console.log('Registry Explorer :', `https://testnet.bscscan.com/address/${registryAddress}`);
  console.log('Resolver Explorer :', `https://testnet.bscscan.com/address/${resolverAddress}`);
}

main().catch(err => {
  console.error('\n❌ DEPLOYMENT FAILED:', err);
  process.exit(1);
});
