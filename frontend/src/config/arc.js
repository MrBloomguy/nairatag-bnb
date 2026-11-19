/**
 * @file arc.js
 * @description BNB Smart Chain configurations and NairaTag protocol contract parameters.
 * Deployed on BNB Mainnet (Chain ID 56)
 */

import { defineChain } from 'viem';

/**
 * BNB Smart Chain Testnet (Chain ID 97)
 */
export const arcTestnet = defineChain({
  id: 97,
  name: 'BNB Smart Chain Testnet',
  nativeCurrency: {
    name: 'tBNB',
    symbol: 'tBNB',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
    },
    public: {
      http: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
    },
  },
  blockExplorers: {
    default: {
      name: 'BscScan Testnet',
      url: 'https://testnet.bscscan.com',
    },
  },
  testnet: true,
});

/**
 * BNB Smart Chain Mainnet (Chain ID 56)
 */
export const arcMainnet = defineChain({
  id: 56,
  name: 'BNB Smart Chain',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://bsc-dataseed.binance.org', 'https://bsc-dataseed1.defibit.io', 'https://rpc.ankr.com/bsc'],
    },
    public: {
      http: ['https://bsc-dataseed.binance.org', 'https://bsc-dataseed1.defibit.io', 'https://rpc.ankr.com/bsc'],
    },
  },
  blockExplorers: {
    default: {
      name: 'BscScan',
      url: 'https://bscscan.com',
    },
  },
  testnet: false,
});

/**
 * Canonical USDC BEP-20 address on BNB Smart Chain.
 * Decimals: 18
 */
export const ARC_USDC_ADDRESS = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
export const ARC_USDC_DECIMALS = 18;

/**
 * Deployed Canonical NairaTag Contracts on BNB Smart Chain Mainnet (Chain ID 56)
 */
export const ARC_MAINNET_REGISTRY_ADDRESS = '0x6d3950a390c7f60287d545cc5785c594e07439f9';
export const ARC_MAINNET_RESOLVER_ADDRESS = '0xa3760573de321da2955573c69a4f497d57c769a2';
export const ARC_MAINNET_ESCROW_ADDRESS = '0x0fcdf115e1cff7b85835cd8ccdc0a66c8c9a95f7';

export const BNB_ACTIVATION_ADDRESS = '0x0fcdf115e1cff7b85835cd8ccdc0a66c8c9a95f7';
export const BNB_OFFICIAL_AGENT_ID = '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';

export const ARC_TESTNET_REGISTRY_ADDRESS = '0x73434d121f46e188b7f12ef048062e79e5119cc3';
export const ARC_TESTNET_RESOLVER_ADDRESS = '0x2ce440b6c63dc5e1128ab75ddac4d5da850de869';
export const ARC_TESTNET_ESCROW_ADDRESS = '0x0000000000000000000000000000000000000000';

export const isArcMainnet = true; // Permanent BNB Smart Chain Mainnet (Chain ID 56)
export const activeArcChain = arcMainnet;

export const ARC_NAIRATAG_REGISTRY_ADDRESS = isArcMainnet ? ARC_MAINNET_REGISTRY_ADDRESS : ARC_TESTNET_REGISTRY_ADDRESS;
export const ARC_NAIRATAG_RESOLVER_ADDRESS = isArcMainnet ? ARC_MAINNET_RESOLVER_ADDRESS : ARC_TESTNET_RESOLVER_ADDRESS;
export const ARC_NAIRATAG_ESCROW_ADDRESS = isArcMainnet ? ARC_MAINNET_ESCROW_ADDRESS : ARC_TESTNET_ESCROW_ADDRESS;

/**
 * Arc Protocol Constants & Predeployed Infrastructure
 * Reference: https://docs.arc.io/arc/references/evm-differences.md
 *            https://docs.arc.io/arc/references/contract-addresses.md
 */
export const ARC_SYSTEM_EMITTER = '0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE';
export const ARC_MEMPOOL_MIN_MAX_FEE_PER_GAS = 20000000000n; // 20 Gwei floor required by Arc mempool

/**
 * Arc Predeployed Transaction Extension: Memo
 * Attaches memo metadata to contract calls (e.g. USDC transfers) while preserving msg.sender via CallFrom precompile.
 */
export const ARC_MEMO_ADDRESS = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505';

/**
 * Official ERC-8004 Agentic Economy Registries on Arc Testnet
 * Reference: https://docs.arc.io/arc/tutorials/register-your-first-ai-agent.md
 */
export const ARC_ERC8004_IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
export const ARC_ERC8004_REPUTATION_REGISTRY = '0x8004B663056A597Dffe9eCcC1965A193B7388713';
export const ARC_ERC8004_VALIDATION_REGISTRY = '0x8004Cb1BF31DAf7788923b405b754f57acEB4272';

/**
 * Supported Arc Tokens for App Kit Swap & Collateral
 */
export const ARC_EURC_ADDRESS = '0xe4d3ff5390F240Eb765954a72d377b21E01766a3';
export const ARC_CIRBTC_ADDRESS = '0x8b548bF79E8853b9DEfa29d47aF5d8525b6a7aE4';

export const ARC_TESTNET_CONFIG = {
  chainId: 56,
  name: 'BNB Smart Chain',
  rpcUrl: 'https://bsc-dataseed.binance.org',
  explorerUrl: 'https://bscscan.com',
  contracts: {
    usdcNative: ARC_USDC_ADDRESS,
    eurc: ARC_EURC_ADDRESS,
    cirBTC: ARC_CIRBTC_ADDRESS,
    nairatagRegistry: ARC_NAIRATAG_REGISTRY_ADDRESS,
    nairatagResolver: ARC_NAIRATAG_RESOLVER_ADDRESS,
    memo: ARC_MEMO_ADDRESS,
    activation: BNB_ACTIVATION_ADDRESS,
    officialAgentId: BNB_OFFICIAL_AGENT_ID,
    erc8004Identity: ARC_ERC8004_IDENTITY_REGISTRY,
    erc8004Reputation: ARC_ERC8004_REPUTATION_REGISTRY,
    erc8004Validation: ARC_ERC8004_VALIDATION_REGISTRY,
  },
};

/**
 * Minimal ERC-20 ABI for USDC transfers and balance reading on Arc.
 */
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
];

/**
 * Arc Memo Precompile Contract ABI
 */
export const ARC_MEMO_ABI = [
  {
    type: 'function',
    name: 'memo',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'data', type: 'bytes' },
      { name: 'memoId', type: 'bytes32' },
      { name: 'memoData', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'Memo',
    anonymous: false,
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'target', type: 'address', indexed: true },
      { name: 'callDataHash', type: 'bytes32', indexed: false },
      { name: 'memoId', type: 'bytes32', indexed: true },
      { name: 'memo', type: 'bytes', indexed: false },
      { name: 'memoIndex', type: 'uint256', indexed: false },
    ],
  },
];

/**
 * ERC-8004 Identity Registry ABI
 */
export const ERC8004_IDENTITY_ABI = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'metadataURI', type: 'string' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenURI',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'setAgentURI',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentId', type: 'uint256' }, { name: 'newURI', type: 'string' }],
    outputs: [],
  },
  {
    type: 'event',
    name: 'Transfer',
    anonymous: false,
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
];

/**
 * ERC-8004 Reputation Registry ABI
 */
export const ERC8004_REPUTATION_ABI = [
  {
    type: 'function',
    name: 'giveFeedback',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'score', type: 'int128' },
      { name: 'feedbackType', type: 'uint8' },
      { name: 'tag', type: 'string' },
      { name: 'metadataURI', type: 'string' },
      { name: 'evidenceURI', type: 'string' },
      { name: 'comment', type: 'string' },
      { name: 'feedbackHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'Feedback',
    anonymous: false,
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'sender', type: 'address', indexed: true },
      { name: 'score', type: 'int128', indexed: false },
      { name: 'tag', type: 'string', indexed: false },
    ],
  },
];

/**
 * ERC-8004 Validation Registry ABI
 */
export const ERC8004_VALIDATION_ABI = [
  {
    type: 'function',
    name: 'validationRequest',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'validator', type: 'address' },
      { name: 'agentId', type: 'uint256' },
      { name: 'requestURI', type: 'string' },
      { name: 'requestHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'validationResponse',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'requestHash', type: 'bytes32' },
      { name: 'response', type: 'uint8' },
      { name: 'responseURI', type: 'string' },
      { name: 'responseHash', type: 'bytes32' },
      { name: 'tag', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getValidationStatus',
    stateMutability: 'view',
    inputs: [{ name: 'requestHash', type: 'bytes32' }],
    outputs: [
      { name: 'validatorAddress', type: 'address' },
      { name: 'agentId', type: 'uint256' },
      { name: 'response', type: 'uint8' },
      { name: 'responseHash', type: 'bytes32' },
      { name: 'tag', type: 'string' },
      { name: 'lastUpdate', type: 'uint256' },
    ],
  },
];

/**
 * NairaTagBountyEscrow ABI
 * Deployed on Arc Mainnet at 0x69f1af5b02703ad0f9e59892e6bc472b6c5599ab
 */
export const NAIRATAG_BOUNTY_ESCROW_ABI = [
  {
    type: 'function',
    name: 'lockBounty',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'id', type: 'bytes32' },
      { name: 'creatorTag', type: 'string' },
      { name: 'token', type: 'address' },
      { name: 'reward', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'assignAgent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'id', type: 'bytes32' },
      { name: 'assignee', type: 'address' },
      { name: 'assigneeTag', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'submitDeliverable',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'id', type: 'bytes32' },
      { name: 'deliverableHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'releaseBounty',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'id', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'refundBounty',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'id', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getBounty',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'id', type: 'bytes32' },
          { name: 'creator', type: 'address' },
          { name: 'creatorTag', type: 'string' },
          { name: 'token', type: 'address' },
          { name: 'reward', type: 'uint256' },
          { name: 'assignee', type: 'address' },
          { name: 'assigneeTag', type: 'string' },
          { name: 'deadline', type: 'uint64' },
          { name: 'status', type: 'uint8' },
          { name: 'deliverableHash', type: 'bytes32' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'bounties',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [
      { name: 'id', type: 'bytes32' },
      { name: 'creator', type: 'address' },
      { name: 'creatorTag', type: 'string' },
      { name: 'token', type: 'address' },
      { name: 'reward', type: 'uint256' },
      { name: 'assignee', type: 'address' },
      { name: 'assigneeTag', type: 'string' },
      { name: 'deadline', type: 'uint64' },
      { name: 'status', type: 'uint8' },
      { name: 'deliverableHash', type: 'bytes32' },
    ],
  },
  {
    type: 'event',
    name: 'BountyLocked',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'creatorTag', type: 'string', indexed: false },
      { name: 'token', type: 'address', indexed: false },
      { name: 'reward', type: 'uint256', indexed: false },
      { name: 'deadline', type: 'uint64', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AgentAssigned',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'assignee', type: 'address', indexed: true },
      { name: 'assigneeTag', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DeliverableSubmitted',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'deliverableHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BountyReleased',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BountyRefunded',
    inputs: [
      { name: 'id', type: 'bytes32', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
];

