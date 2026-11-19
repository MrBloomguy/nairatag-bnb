import { parseAbi } from 'viem';

export const BNB_MAINNET_CONFIG = {
  chainId: 56,
  chainName: 'BNB Smart Chain Mainnet',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: ['https://bsc-dataseed.binance.org', 'https://bsc-dataseed1.defibit.io'],
  blockExplorerUrls: ['https://bscscan.com'],
};

export const CONTRACT_ADDRESSES = {
  // BSC Mainnet (Chain ID 56) — Production Deployed
  mainnet: {
    registry: '0x6d3950a390c7f60287d545cc5785c594e07439f9',
    resolver: '0xa3760573de321da2955573c69a4f497d57c769a2',
    activation: '0x0fcdf115e1cff7b85835cd8ccdc0a66c8c9a95f7',
    officialAgentId: '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F',
  },
  // BSC Testnet (Chain ID 97) — Staging
  testnet: {
    registry: '0x73434d121f46e188b7f12ef048062e79e5119cc3',
    resolver: '0x2ce440b6c63dc5e1128ab75ddac4d5da850de869',
    activation: '0x0000000000000000000000000000000000000000',
    officialAgentId: '0x0000000000000000000000000000000000000000',
  },
};

export const REGISTRY_ABI = parseAbi([
  'function normalize(string) pure returns (string)',
  'function namehash(string) pure returns (bytes32)',
  'function exists(bytes32) view returns (bool)',
  'function owner(bytes32) view returns (address)',
  'function ownerOf(string) view returns (address)',
  'function primaryTagOf(address) view returns (bytes32)',
  'function claim(string, address) returns (bytes32)',
  'function claim(string) returns (bytes32)',
  'function resolve(string) view returns (address)',
  'function transfer(bytes32, address)',
  'function release(bytes32)',
]);

export const RESOLVER_ABI = parseAbi([
  'function addr(bytes32) view returns (address)',
  'function setAddr(bytes32, address)',
  'function name(bytes32) view returns (string)',
  'function setNameForAddr(address, string)',
  'function text(bytes32, string) view returns (string)',
  'function setText(bytes32, string, string)',
]);

export const ACTIVATION_ABI = parseAbi([
  'function checkValidity(bytes32) view returns (uint8)',
  'function activate(bytes32) returns (uint256)',
  'function activateWithTag(string) returns (bytes32, uint256)',
  'function totalUniqueHolders() view returns (uint256)',
  'function totalActiveActivations() view returns (uint256)',
  'function primaryActivatedNodeOf(address) view returns (bytes32)',
  'function getActivation(bytes32) view returns ((address holder, bytes32 node, uint64 activatedAt, uint32 historicalCount, bool isActive, uint8 lastDeactivationReason))',
]);

export const AGENT_ID_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
]);

export const VALIDITY_STATUS_MAP = {
  0: { label: 'VALID', color: 'emerald', description: 'Active & Verified Holder' },
  1: { label: 'NOT_ACTIVATED', color: 'slate', description: 'Tag not yet activated' },
  2: { label: 'TAG_DOES_NOT_EXIST', color: 'red', description: 'Tag not registered' },
  3: { label: 'TAG_OWNERSHIP_CHANGED', color: 'amber', description: 'Owner mismatch' },
  4: { label: 'AGENT_ID_LOST', color: 'red', description: 'Wallet lacks Agent ID' },
  5: { label: 'VOLUNTARILY_DEACTIVATED', color: 'zinc', description: 'Deactivated by owner' },
};
