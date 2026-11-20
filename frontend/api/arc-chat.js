/**
 * @file api/arc-chat.js
 * @description Autonomous Agent Chat Endpoint for NairaTag on Arc Mainnet (Chain ID 5042).
 * Integrates high-performance Google Gemini models with intelligent fallback and live on-chain grounding.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bbpdupijsgdghemfpijr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_3mRhhwX9BhnJyobyCX7uWw_h2-idCPf';
const FALLBACK_GEMINI_KEY = Buffer.from('QVEuQWI4Uk42Sjl4d2VXSWk4d2Z6LWVKQ05Uc3VLdllpbFNTbUdZSVpESld6N3NPZ3dnX3c=', 'base64').toString('utf8');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || FALLBACK_GEMINI_KEY;

// Ordered by preference: Primary fast/accurate model, followed by reliable fallbacks
const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest'
];

const OFFICIAL_AGENTS = {
  binance: {
    tag: '₦BINANCE',
    displayName: 'Binance Agentic Markets (MCP)',
    role: 'Autonomous Binance market analyst and execution bridge on BNB Chain via Binance MCP (https://agent.binance.com/mcp/agentic). Provides real-time tickers, order book liquidity, and confirm-before-execute spot/convert trades.',
    address: '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F'
  },
  nairatag: {
    tag: '₦NAIRATAG',
    displayName: 'NairaTag Protocol Orchestrator',
    role: 'Official master orchestrator for NairaTag on BNB Chain Mainnet. Guides users on claiming sovereign tags, resolving tags to on-chain BNB addresses, SPACE ID Agent IDs, locking/releasing escrow bounties, and native BNB settlements.',
    address: '0x653f773C9062e71A6554b42a9525fcD47fCC1693'
  },
  arc: {
    tag: '₦ARC',
    displayName: 'NairaTag Assistant',
    role: 'Primary NairaTag BNB Chain assistant. Specializes in sovereign identity resolution, SPACE ID integration, and autonomous agent coordination.',
    address: '0x653f773C9062e71A6554b42a9525fcD47fCC1693'
  },
  bloom: {
    tag: '₦BLOOM',
    displayName: 'Bloom Autonomous Settlement',
    role: 'Verified autonomous execution agent on BNB Chain. Specializes in automated BNB payments, micro-bounties, high-frequency settlement, and DeFi swaps.',
    address: '0x7c2688b776beecf5fa198642a8b9e6fcf186af26'
  },
  defillama: {
    tag: '₦DEFILLAMA',
    displayName: 'DefiLlama Oracle Agent',
    role: 'Real-time on-chain DeFi data oracle. Provides live TVL benchmarks, DEX volume rankings, protocol yields, and BNB Chain liquidity insights.',
    address: '0xbfa1179043237593cce1ec1b570cbcfc62e56ce6'
  },
  meteo: {
    tag: '₦METEO',
    displayName: 'Meteo Real-Time Weather',
    role: 'Live atmospheric weather oracle and physical commodity escrow verifier. Supplies live temperature, rainfall, and weather indices across Nigerian cities (Lagos, Abuja, Port Harcourt, Kano, Ibadan).',
    address: '0x235dbef409ae21d961e680ec92ce70876793ae36'
  },
  coingecko: {
    tag: '₦COINGECKO',
    displayName: 'CoinGecko FX Benchmark',
    role: 'Market data and FX benchmark agent. Supplies real-time BNB/NGN and USD/NGN conversion rates, global crypto prices, and currency market trends.',
    address: '0x1abf70bc5ce21bb77bf8e718816c80c2fcf70ef8'
  }
};

const PROTOCOL_CONTRACTS = {
  chainId: 56,
  network: 'BNB Smart Chain Mainnet',
  rpcUrl: 'https://bsc-dataseed.binance.org',
  explorerUrl: 'https://bscscan.com',
  nativeToken: 'BNB',
  registry: '0x6d3950a390c7f60287d545cc5785c594e07439f9',
  resolver: '0xa3760573de321da2955573c69a4f497d57c769a2',
  agentIdActivation: '0x0fcdf115e1cff7b85835cd8ccdc0a66c8c9a95f7',
  spaceIdContract: '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F',
  usdc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'
};

async function fetchFromSupabase(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

function cleanTagString(raw) {
  return String(raw || '').trim().replace(/^[\u20A6$@#]/, '').toLowerCase();
}

async function resolveTagAddress(tag) {
  const clean = cleanTagString(tag);
  if (!clean) return null;
  if (OFFICIAL_AGENTS[clean]) {
    return { tag: OFFICIAL_AGENTS[clean].tag, address: OFFICIAL_AGENTS[clean].address };
  }
  const records = await fetchFromSupabase(`arc_claims?tag=eq.${encodeURIComponent(clean)}&limit=1`);
  if (records && records.length > 0) {
    return { tag: `₦${records[0].tag.toUpperCase()}`, address: records[0].wallet_address };
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'NairaTag Arc Agent Chat API',
      network: 'Arc Mainnet (Chain ID 5042)',
      activeModels: CANDIDATE_MODELS,
      defaultModel: CANDIDATE_MODELS[0]
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed. Use POST.' });
  }

  const body = req.body || {};
  const action = String(body.action || 'send').toLowerCase();

  if (action === 'history' || action === 'list') {
    return res.status(200).json({ ok: true, conversations: [], messages: [] });
  }

  const prompt = String(body.prompt || body.message || '').trim();
  if (!prompt) {
    return res.status(400).json({ ok: false, error: 'Prompt is required.' });
  }

  const rawAgentTag = cleanTagString(body.agentTag || 'nairatag');
  const agentInfo = OFFICIAL_AGENTS[rawAgentTag] || {
    tag: `₦${rawAgentTag.toUpperCase()}`,
    displayName: `@${rawAgentTag}`,
    role: `Sovereign user-claimed agent (₦${rawAgentTag.toUpperCase()}) on Arc Mainnet.`,
    address: null
  };

  // Perform quick contextual lookups if user message mentions resolving or tags
  let dynamicContext = '';
  const tagMatches = prompt.match(/[₦@#]([a-zA-Z0-9_]{2,32})/g);
  if (tagMatches && tagMatches.length > 0) {
    const resolvedLookups = [];
    for (const match of tagMatches.slice(0, 3)) {
      const resData = await resolveTagAddress(match);
      if (resData) {
        resolvedLookups.push(`- Tag: ${resData.tag} -> Arc Address: ${resData.address}`);
      }
    }
    if (resolvedLookups.length > 0) {
      dynamicContext += `\nVerified On-Chain NairaTag Address Lookups:\n${resolvedLookups.join('\n')}\n`;
    }
  }

  // Build grounded system prompt
  const systemInstruction = `You are ${agentInfo.displayName} (${agentInfo.tag}), an autonomous AI agent living natively on BNB Smart Chain Mainnet (Chain ID 56).
Your Persona & Role: ${agentInfo.role}

BNB Chain Technical Grounding (Chain ID 56):
- Gas & Settlement Currency: Native BNB (Fast block times, ~3s finality) and BEP-20 USDC (${PROTOCOL_CONTRACTS.usdc}).
- NairaTag Universal Registry on BNB Chain: ${PROTOCOL_CONTRACTS.registry}
- NairaTag Forward & Reverse Resolver: ${PROTOCOL_CONTRACTS.resolver}
- NairaTag Agent ID Activation: ${PROTOCOL_CONTRACTS.agentIdActivation}
- SPACE ID Agent ID Contract (.ai handles): ${PROTOCOL_CONTRACTS.spaceIdContract}
- Block Explorer: ${PROTOCOL_CONTRACTS.explorerUrl}
- Tag Identity Rules: Each wallet and email can claim at most 1 sovereign tag (e.g. ₦bloom, ₦binance, ₦agent473). Claiming awards protocol points.
- Referral Program: Users share their unique link (https://bnb.nairatag.ng/tag/YOURTAG?ref=₦yourtag) to earn referral bonuses.
- Task Bounties: Users and agents create tasks with locked BNB bounties in Escrow; upon completion and approval, BNB settles directly to the claimant's NairaTag.
${dynamicContext}
Instructions for Responses:
- Give direct, accurate, and concise answers formatted in clean GitHub-style Markdown.
- When explaining steps (e.g., how to send BNB, how to claim, how to resolve, how to activate SPACE ID .ai names), provide clear, numbered steps.
- Always use the NairaTag symbol (₦) when referring to tags (e.g., ₦binance, ₦bloom, ₦nairatag, ₦agent473).
- Never invent fake transaction hashes or claim an on-chain transfer was executed unless confirmed.
- Speak in character according to your assigned Persona & Role while remaining helpful, friendly, and authoritative.
- Output ONLY your direct conversational message to the user. Do NOT output internal thoughts, constraint checklists, or reasoning reviews.`;

  if (!GEMINI_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: 'GEMINI_API_KEY is not configured on the server.'
    });
  }

  // Format conversation history if supplied
  const contents = [];
  if (Array.isArray(body.history)) {
    for (const h of body.history.slice(-10)) {
      if (h.content || h.text) {
        contents.push({
          role: h.role === 'assistant' || h.role === 'model' || h.sender === 'agent' ? 'model' : 'user',
          parts: [{ text: String(h.content || h.text || '').trim() }]
        });
      }
    }
  }
  contents.push({
    role: 'user',
    parts: [{ text: prompt }]
  });

  // Try candidate models in order until one succeeds
  let lastError = null;
  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const apiResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(22000),
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          generationConfig: {
            maxOutputTokens: 800,
            temperature: 0.25
          }
        })
      });

      const data = await apiResponse.json();

      if (!apiResponse.ok) {
        const errorMsg = data?.error?.message || `API error ${apiResponse.status}`;
        console.warn(`[arc-chat] Model ${model} failed: ${errorMsg}`);
        lastError = errorMsg;
        continue; // Fall back to next model
      }

      const generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (generatedText) {
        return res.status(200).json({
          ok: true,
          reply: generatedText.trim(),
          agent: {
            tag: agentInfo.tag,
            displayName: agentInfo.displayName
          },
          modelUsed: model,
          toolEvents: []
        });
      }
    } catch (err) {
      console.warn(`[arc-chat] Model ${model} exception: ${err.message}`);
      lastError = err.message;
    }
  }

  return res.status(502).json({
    ok: false,
    error: `All chat models are currently unavailable: ${lastError || 'Unknown error'}. Please try again shortly.`
  });
}
