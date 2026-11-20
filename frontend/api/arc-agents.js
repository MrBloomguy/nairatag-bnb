/**
 * @file api/arc-agents.js
 * @description BNB Agent & User Directory Endpoint for BNB Chain.
 * Returns ONLY agents that are actually claimed and active on BNB Chain / BSC Mainnet.
 */

import { encodeFunctionData, decodeFunctionResult } from 'viem';

try { process.loadEnvFile(); } catch {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bbpdupijsgdghemfpijr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_3mRhhwX9BhnJyobyCX7uWw_h2-idCPf';

const BSC_REGISTRY = '0x6d3950a390c7f60287d545cc5785c594e07439f9';
const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';
const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';

const KNOWN_AGENT_LOGOS = {
  binance: 'https://api.dicebear.com/7.x/identicon/svg?seed=binance',
  nairatag: 'https://api.dicebear.com/7.x/identicon/svg?seed=nairatag',
};

const PROTOCOL_AGENT_POINTS = {
  binance: 300,
  nairatag: 250,
};

async function fetchFromSupabase(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Supabase query failed (${response.status}): ${errorText}`);
  }
  return response.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const agentMap = new Map();

    // 1. Official Sovereign Platform Agents native to BNB Chain
    agentMap.set('binance', {
      id: 'agent_marketplace_binance',
      tag: 'binance',
      displayName: '₦BINANCE',
      name: 'Binance Agentic Markets',
      category: 'Exchange & Trading',
      description: 'Autonomous Binance market analyst and execution bridge via Binance MCP on BNB Chain.',
      role: 'Autonomous Binance market analyst and execution bridge via Binance MCP on BNB Chain.',
      avatarUrl: KNOWN_AGENT_LOGOS.binance,
      ownerType: 'platform',
      ownerWallet: '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F',
      owner: '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F',
      status: 'active',
      points: 300,
      earnings: 0,
      earningsCurrency: 'BNB',
      network: 'BNB Smart Chain',
      verifiedOnchain: true,
      identity: {
        type: 'space_id_agent_id',
        verifiedOnchain: true,
        agentIdContract: '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F',
        registry: BSC_REGISTRY,
      },
    });

    agentMap.set('nairatag', {
      id: 'agent_official_nairatag',
      tag: 'nairatag',
      displayName: '₦NAIRATAG',
      name: '₦nairatag',
      category: 'Protocol',
      description: 'Universal naming orchestrator and identity resolution engine on BNB Chain.',
      role: 'Universal naming orchestrator and identity resolution engine on BNB Chain.',
      avatarUrl: KNOWN_AGENT_LOGOS.nairatag,
      ownerType: 'platform',
      ownerWallet: '0x653f773C9062e71A6554b42a9525fcD47fCC1693',
      owner: '0x653f773C9062e71A6554b42a9525fcD47fCC1693',
      status: 'active',
      points: 250,
      earnings: 0,
      earningsCurrency: 'BNB',
      network: 'BNB Smart Chain',
      verifiedOnchain: true,
      identity: {
        type: 'erc8004',
        verifiedOnchain: true,
        registry: BSC_REGISTRY,
        owner: '0x653f773C9062e71A6554b42a9525fcD47fCC1693',
      },
    });

    // 2. Fetch user claims from public.arc_claims
    const claimsData = await fetchFromSupabase(
      'arc_claims?select=tag,wallet_address,avatar_url,auth_provider,claimed_at,network&order=claimed_at.desc'
    ).catch((err) => {
      console.warn('[bnb-agents] Failed to fetch arc_claims:', err.message);
      return [];
    });

    const candidateTags = [];
    const claimsByTag = new Map();

    for (const c of claimsData) {
      const tag = String(c.tag || '').trim().toLowerCase();
      if (!tag || tag === 'binance' || tag === 'nairatag') continue;
      claimsByTag.set(tag, c);

      const net = String(c.network || '').toLowerCase();
      // If network explicitly recorded as BNB/BSC, include immediately
      if (net.includes('bnb') || net.includes('bsc') || net === '56') {
        agentMap.set(tag, {
          id: `claim-${tag}`,
          tag,
          displayName: `₦${tag.toUpperCase()}`,
          name: `₦${tag.toUpperCase()}`,
          category: 'User Agent',
          description: 'Sovereign NairaTag user on BNB Chain',
          role: 'Sovereign NairaTag user on BNB Chain',
          avatarUrl: c.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(tag)}`,
          ownerType: 'user',
          ownerWallet: c.wallet_address,
          owner: c.wallet_address,
          status: 'active',
          points: 200,
          earnings: 0,
          earningsCurrency: 'BNB',
          createdAt: c.claimed_at,
          network: 'BNB Smart Chain',
          verifiedOnchain: true,
        });
      } else {
        // Tag might be claimed directly on the BSC contract
        candidateTags.push(tag);
      }
    }

    // 3. Verify candidate tags against BSC NairaTagRegistry contract via Multicall3
    if (candidateTags.length > 0) {
      try {
        const calls = candidateTags.map((tag) => ({
          target: BSC_REGISTRY,
          allowFailure: true,
          callData: encodeFunctionData({
            abi: [{ inputs: [{ type: 'string', name: 'tag' }], name: 'ownerOf', outputs: [{ type: 'address' }], type: 'function' }],
            functionName: 'ownerOf',
            args: [tag],
          }),
        }));

        const rpcRes = await fetch(BSC_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [
              {
                to: MULTICALL3,
                data: encodeFunctionData({
                  abi: [
                    {
                      inputs: [
                        {
                          components: [
                            { internalType: 'address', name: 'target', type: 'address' },
                            { internalType: 'bool', name: 'allowFailure', type: 'bool' },
                            { internalType: 'bytes', name: 'callData', type: 'bytes' },
                          ],
                          internalType: 'struct Multicall3.Call3[]',
                          name: 'calls',
                          type: 'tuple[]',
                        },
                      ],
                      name: 'aggregate3',
                      outputs: [
                        {
                          components: [
                            { internalType: 'bool', name: 'success', type: 'bool' },
                            { internalType: 'bytes', name: 'returnData', type: 'bytes' },
                          ],
                          internalType: 'struct Multicall3.Result[]',
                          name: 'returnData',
                          type: 'tuple[]',
                        },
                      ],
                      stateMutability: 'payable',
                      type: 'function',
                    },
                  ],
                  functionName: 'aggregate3',
                  args: [calls],
                }),
              },
              'latest',
            ],
          }),
        });

        const rpcData = await rpcRes.json();
        if (rpcData?.result) {
          const decoded = decodeFunctionResult({
            abi: [
              {
                inputs: [
                  {
                    components: [
                      { internalType: 'address', name: 'target', type: 'address' },
                      { internalType: 'bool', name: 'allowFailure', type: 'bool' },
                      { internalType: 'bytes', name: 'callData', type: 'bytes' },
                    ],
                    internalType: 'struct Multicall3.Call3[]',
                    name: 'calls',
                    type: 'tuple[]',
                  },
                ],
                name: 'aggregate3',
                outputs: [
                  {
                    components: [
                      { internalType: 'bool', name: 'success', type: 'bool' },
                      { internalType: 'bytes', name: 'returnData', type: 'bytes' },
                    ],
                    internalType: 'struct Multicall3.Result[]',
                    name: 'returnData',
                    type: 'tuple[]',
                  },
                ],
                stateMutability: 'payable',
                type: 'function',
              },
            ],
            functionName: 'aggregate3',
            data: rpcData.result,
          });

          for (let i = 0; i < candidateTags.length; i++) {
            const resItem = decoded[i];
            if (resItem.success && resItem.returnData && resItem.returnData !== '0x') {
              const owner = decodeFunctionResult({
                abi: [{ inputs: [{ type: 'string', name: 'tag' }], name: 'ownerOf', outputs: [{ type: 'address' }], type: 'function' }],
                functionName: 'ownerOf',
                data: resItem.returnData,
              });
              if (owner && owner !== '0x0000000000000000000000000000000000000000') {
                const tag = candidateTags[i];
                const c = claimsByTag.get(tag) || {};
                agentMap.set(tag, {
                  id: `claim-${tag}`,
                  tag,
                  displayName: `₦${tag.toUpperCase()}`,
                  name: `₦${tag.toUpperCase()}`,
                  category: 'User Agent',
                  description: 'Sovereign NairaTag user on BNB Chain',
                  role: 'Sovereign NairaTag user on BNB Chain',
                  avatarUrl: c.avatar_url || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(tag)}`,
                  ownerType: 'user',
                  ownerWallet: owner,
                  owner,
                  status: 'active',
                  points: 200,
                  earnings: 0,
                  earningsCurrency: 'BNB',
                  createdAt: c.claimed_at,
                  network: 'BNB Smart Chain',
                  verifiedOnchain: true,
                });
              }
            }
          }
        }
      } catch (onchainErr) {
        console.warn('[bnb-agents] Onchain registry verification warning:', onchainErr.message);
      }
    }

    const agents = Array.from(agentMap.values());
    return res.status(200).json({ ok: true, agents, count: agents.length });
  } catch (error) {
    console.error('[bnb-agents error]:', error.message);
    return res.status(500).json({ ok: false, error: 'Failed to load BNB agent directory' });
  }
}
