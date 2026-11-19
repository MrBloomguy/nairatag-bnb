/**
 * @file api/arc-tasks.js
 * @description Sovereign Arc Task & Bounty Escrow Management Endpoint.
 * Directly interacts with Supabase arc_tasks and arc_task_progress tables on Arc Mainnet (5042).
 */

import { isAddress, verifyMessage } from 'viem';
import { createHash } from 'node:crypto';

const ARC_CHAIN_ID = 56;
const BNB_MAINNET_ESCROW = '0x0fcdf115e1cff7b85835cd8ccdc0a66c8c9a95f7';
const MAX_SIGNATURE_AGE_MS = 15 * 60 * 1000; // 15 minutes window for clock skew

try { process.loadEnvFile(); } catch {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bbpdupijsgdghemfpijr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_3mRhhwX9BhnJyobyCX7uWw_h2-idCPf';

const TASK_CATEGORIES = {
  dev: 'Engineering',
  design: 'Design',
  data: 'Data & AI',
  content: 'Content',
  test: 'Testing',
  community: 'Community',
  analytics: 'Analytics & DeFi',
  logistics: 'Logistics & Weather',
  bounty: 'Bounty',
};

const DEFAULT_BNB_TASKS = [
  {
    id: 'bnb_task_agent_id_verification',
    chain_id: 56,
    title: 'Verify Agent ID (SPACE ID) Integration & Resolve name.ai Tag',
    description: 'Interact with the SPACE ID Agent ID contract (0x60B9...022F) on BNB Chain. Bind a .ai agentic wallet identity to a NairaTag sovereign profile and verify sub-second routing.',
    category: 'dev',
    category_label: 'Engineering',
    creator_tag: 'nairatag',
    deliverable: 'Submit transaction hash or resolved .ai name proof on BNB Chain.',
    reward_usdc: 0.005,
    reward_bnb: 0.005,
    reward_token: 'BNB',
    assigned_agent_tag: null,
    points: 50,
    deadline_label: 'Open bounty',
    status: 'open',
    escrow_status: 'escrow_active',
    escrow_contract: BNB_MAINNET_ESCROW,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    participant_count: 3,
  },
  {
    id: 'bnb_task_defi_tvl_rankings',
    chain_id: 56,
    title: 'Supply DeFi TVL & Protocol Liquidity Rankings for BNB Agents',
    description: 'Prepare a verifiable ranking of BNB Chain DeFi total value locked, PancakeSwap pools, and autonomous liquidity feeds for AI agents settling in BNB.',
    category: 'analytics',
    category_label: 'Analytics & DeFi',
    creator_tag: 'defillama',
    deliverable: 'Submit a public analytics report or on-chain data telemetry for BNB Chain liquidity.',
    reward_usdc: 0.002,
    reward_bnb: 0.002,
    reward_token: 'BNB',
    assigned_agent_tag: null,
    points: 30,
    deadline_label: 'Open bounty',
    status: 'open',
    escrow_status: 'escrow_active',
    escrow_contract: BNB_MAINNET_ESCROW,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    participant_count: 5,
  },
  {
    id: 'bnb_task_settlement_benchmark',
    chain_id: 56,
    title: 'Sub-Second BNB Settlement & Autonomous Escrow Benchmark',
    description: 'Execute a micro-settlement via NairaTag smart contracts on BNB Chain. Measure block inclusion speed, gas efficiency, and multi-agent escrow release.',
    category: 'test',
    category_label: 'Testing',
    creator_tag: 'nairatag',
    deliverable: 'Submit BscScan transaction hash verifying escrow lock and release in BNB.',
    reward_usdc: 0.003,
    reward_bnb: 0.003,
    reward_token: 'BNB',
    assigned_agent_tag: null,
    points: 40,
    deadline_label: 'Open bounty',
    status: 'open',
    escrow_status: 'escrow_active',
    escrow_contract: BNB_MAINNET_ESCROW,
    created_at: new Date(Date.now() - 10800000).toISOString(),
    participant_count: 2,
  },
  {
    id: 'bnb_task_weather_oracle',
    chain_id: 56,
    title: 'Weather & Real-World Commerce Telemetry for BNB Logistics',
    description: 'Autonomous sensor verification and real-world temperature oracle feed for supply-chain milestone clearance settled natively in BNB.',
    category: 'logistics',
    category_label: 'Logistics & Weather',
    creator_tag: 'meteo',
    deliverable: 'Provide structured weather oracle payload and signed telemetry log.',
    reward_usdc: 0.001,
    reward_bnb: 0.001,
    reward_token: 'BNB',
    assigned_agent_tag: null,
    points: 20,
    deadline_label: 'Open bounty',
    status: 'open',
    escrow_status: 'escrow_active',
    escrow_contract: BNB_MAINNET_ESCROW,
    created_at: new Date(Date.now() - 14400000).toISOString(),
    participant_count: 4,
  },
  {
    id: 'bnb_task_pancakeswap_agentic_swap',
    chain_id: 56,
    title: 'Automate On-Chain Agentic Swaps on PancakeSwap v3',
    description: 'Implement an autonomous liquidity swap route using PancakeSwap v3 on BNB Smart Chain, initiated directly from an Agent ID (.ai) wallet with automated slippage management.',
    category: 'dev',
    category_label: 'Engineering',
    creator_tag: 'nairatag',
    deliverable: 'Submit open-source repository link and confirmed BscScan transaction hash.',
    reward_usdc: 0.008,
    reward_bnb: 0.008,
    reward_token: 'BNB',
    assigned_agent_tag: null,
    points: 60,
    deadline_label: 'Open bounty',
    status: 'open',
    escrow_status: 'escrow_active',
    escrow_contract: BNB_MAINNET_ESCROW,
    created_at: new Date(Date.now() - 1800000).toISOString(),
    participant_count: 2,
  },
  {
    id: 'bnb_task_erc8004_identity_proof',
    chain_id: 56,
    title: 'Generate Cryptographic ERC-8004 Proof for Agentic Wallets',
    description: 'Construct an EIP-712 typed data signature linking a SPACE ID name.ai domain to the ERC-8004 autonomous agent metadata specification on BNB Chain.',
    category: 'dev',
    category_label: 'Engineering',
    creator_tag: 'nairatag',
    deliverable: 'Submit JSON payload with signed typed data and on-chain verification script.',
    reward_usdc: 0.006,
    reward_bnb: 0.006,
    reward_token: 'BNB',
    assigned_agent_tag: null,
    points: 50,
    deadline_label: 'Open bounty',
    status: 'open',
    escrow_status: 'escrow_active',
    escrow_contract: BNB_MAINNET_ESCROW,
    created_at: new Date(Date.now() - 2400000).toISOString(),
    participant_count: 1,
  },
  {
    id: 'bnb_task_binance_mcp_benchmark',
    chain_id: 56,
    title: 'Benchmark Binance Agentic MCP Server Tool Calling on BNB Chain',
    description: 'Connect to the official Binance Agentic MCP server (https://agent.binance.com/mcp/agentic). Execute automated wallet balance queries and document end-to-end response latency.',
    category: 'test',
    category_label: 'Testing',
    creator_tag: 'nairatag',
    deliverable: 'Submit benchmark telemetry report with JSON execution log.',
    reward_usdc: 0.004,
    reward_bnb: 0.004,
    reward_token: 'BNB',
    assigned_agent_tag: null,
    points: 35,
    deadline_label: 'Open bounty',
    status: 'open',
    escrow_status: 'escrow_active',
    escrow_contract: BNB_MAINNET_ESCROW,
    created_at: new Date(Date.now() - 3000000).toISOString(),
    participant_count: 3,
  },
  {
    id: 'bnb_task_dark_canvas_payment_card',
    chain_id: 56,
    title: 'Design Dark-Canvas Agentic Payment Badge & Card UI',
    description: 'Design a sleek, high-contrast dark-mode payment card badge showcasing BNB sovereign tags (₦tag) and SPACE ID name.ai identity for agent-to-human micro-checkouts.',
    category: 'design',
    category_label: 'Design',
    creator_tag: 'nairatag',
    deliverable: 'Submit Figma design link or exported high-resolution PNG/SVG assets.',
    reward_usdc: 0.005,
    reward_bnb: 0.005,
    reward_token: 'BNB',
    assigned_agent_tag: null,
    points: 45,
    deadline_label: 'Open bounty',
    status: 'open',
    escrow_status: 'escrow_active',
    escrow_contract: BNB_MAINNET_ESCROW,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    participant_count: 2,
  },
  {
    id: 'bnb_task_bnb_ngn_fx_oracle',
    chain_id: 56,
    title: 'Publish Real-Time BNB / NGN FX Spot Telemetry Oracle',
    description: 'Deploy a verifiable price ingestion script gathering real-time P2P liquidity spreads between BNB and Nigerian Naira (NGN), formatting as a structured oracle payload for AI agents.',
    category: 'data',
    category_label: 'Data & AI',
    creator_tag: 'nairatag',
    deliverable: 'Submit public GitHub repository link or live oracle API endpoint.',
    reward_usdc: 0.007,
    reward_bnb: 0.007,
    reward_token: 'BNB',
    assigned_agent_tag: null,
    points: 55,
    deadline_label: 'Open bounty',
    status: 'open',
    escrow_status: 'escrow_active',
    escrow_contract: BNB_MAINNET_ESCROW,
    created_at: new Date(Date.now() - 4200000).toISOString(),
    participant_count: 4,
  },
  {
    id: 'bnb_task_agent_id_quickstart_tutorial',
    chain_id: 56,
    title: 'Write Quickstart Guide: Resolving Agent IDs to Sovereign ₦Tags',
    description: 'Author a comprehensive developer tutorial explaining how to resolve SPACE ID Agent IDs (.ai) on BNB Chain to sovereign NairaTags using Viem or Ethers.js with sub-second routing.',
    category: 'content',
    category_label: 'Content',
    creator_tag: 'nairatag',
    deliverable: 'Submit public GitHub gist, Notion document, or published blog post link.',
    reward_usdc: 0.004,
    reward_bnb: 0.004,
    reward_token: 'BNB',
    assigned_agent_tag: null,
    points: 40,
    deadline_label: 'Open bounty',
    status: 'open',
    escrow_status: 'escrow_active',
    escrow_contract: BNB_MAINNET_ESCROW,
    created_at: new Date(Date.now() - 4800000).toISOString(),
    participant_count: 1,
  },
  {
    id: 'bnb_task_multiagent_escrow_stress_test',
    chain_id: 56,
    title: 'Execute Multi-Agent Escrow Concurrency Stress Test',
    description: 'Run automated stress tests locking and releasing concurrent bounties through NairaTagAgentIDActivation (0x0fcd...95f7) on BSC Mainnet, logging gas consumption and block latency.',
    category: 'test',
    category_label: 'Testing',
    creator_tag: 'nairatag',
    deliverable: 'Submit test summary table and minimum 3 verified BscScan transaction hashes.',
    reward_usdc: 0.006,
    reward_bnb: 0.006,
    reward_token: 'BNB',
    assigned_agent_tag: null,
    points: 50,
    deadline_label: 'Open bounty',
    status: 'open',
    escrow_status: 'escrow_active',
    escrow_contract: BNB_MAINNET_ESCROW,
    created_at: new Date(Date.now() - 5400000).toISOString(),
    participant_count: 2,
  },
  {
    id: 'bnb_task_bscscan_event_telemetry',
    chain_id: 56,
    title: 'Build BscScan Event Telemetry Listener for Bounty Escrow',
    description: 'Build a lightweight WebSocket listener tracking TagClaimed, BountyLocked, and BountyReleased events on BNB Chain smart contracts, forwarding alerts in real-time.',
    category: 'dev',
    category_label: 'Engineering',
    creator_tag: 'nairatag',
    deliverable: 'Submit open-source repository link with runnable instructions.',
    reward_usdc: 0.005,
    reward_bnb: 0.005,
    reward_token: 'BNB',
    assigned_agent_tag: null,
    points: 45,
    deadline_label: 'Open bounty',
    status: 'open',
    escrow_status: 'escrow_active',
    escrow_contract: BNB_MAINNET_ESCROW,
    created_at: new Date(Date.now() - 6000000).toISOString(),
    participant_count: 3,
  },
  {
    id: 'bnb_task_visual_explainer_agent_id',
    chain_id: 56,
    title: 'Create Visual Explainer: Why Agent ID Needs Human-Readable ₦Tags',
    description: 'Create an educational infographic explaining the synergy between SPACE ID name.ai agentic wallet identity and NairaTag sovereign payment rails on BNB Chain.',
    category: 'design',
    category_label: 'Design',
    creator_tag: 'nairatag',
    deliverable: 'Submit high-resolution infographic (1080x1350 or 1920x1080) ready for X publication.',
    reward_usdc: 0.003,
    reward_bnb: 0.003,
    reward_token: 'BNB',
    assigned_agent_tag: null,
    points: 30,
    deadline_label: 'Open bounty',
    status: 'open',
    escrow_status: 'escrow_active',
    escrow_contract: BNB_MAINNET_ESCROW,
    created_at: new Date(Date.now() - 6600000).toISOString(),
    participant_count: 2,
  },
  {
    id: 'bnb_task_onboard_verified_agent_holders',
    chain_id: 56,
    title: 'Onboard 5 Verified SPACE ID Agent ID Holders to NairaTag',
    description: 'Guide 5 distinct wallet addresses holding official SPACE ID Agent IDs (0x60B9...022F) to connect to https://bnb.nairatag.ng, claim their sovereign ₦Tag, and submit an introductory greeting.',
    category: 'community',
    category_label: 'Community',
    creator_tag: 'nairatag',
    deliverable: 'Submit the 5 BNB wallet addresses and their claimed sovereign ₦Tags.',
    reward_usdc: 0.010,
    reward_bnb: 0.010,
    reward_token: 'BNB',
    assigned_agent_tag: null,
    points: 100,
    deadline_label: 'Open bounty',
    status: 'open',
    escrow_status: 'escrow_active',
    escrow_contract: BNB_MAINNET_ESCROW,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    participant_count: 5,
  },
];

const DEMO_TASK_IDS = new Set([
  'b001', 'b002', 'b003', 'b004', 'b005', 'b006',
  'task_defillama_audit', 'task_meteo_delivery_clearance',
  'task_coingecko_fx_quote', 'task_agent_wallet_settlement',
]);
const RETIRED_TASK_TITLES = new Set([
  'design dark-canvas sovereign agent card assets',
  'build an opera minipay deep-link widget',
  'forex spot rate verification (usdc / ngn)',
  'defi tvl & price benchmark feed on arc mainnet',
  'supply defi tvl & protocol liquidity rankings for arc agents',
  'weather & city commerce oracle telemetry',
  'sub-second settlement benchmark on arc mainnet',
  'monitor the arc mainnet tag',
  'defi tvl & liquidity health audit',
  'commercial delivery weather risk clearance',
  'real-time fx exchange rate benchmark',
  'autonomous agent-to-agent payment settlement',
]);

function isRetiredTask(task) {
  return RETIRED_TASK_TITLES.has(String(task?.title || '').trim().toLowerCase());
}

function normalizeWallet(wallet) {
  return String(wallet || '').trim().toLowerCase();
}

function normalizeTaskDetails(value = {}) {
  const token = String(value.rewardToken || 'BNB').toUpperCase();
  const amt = Number(value.rewardBNB || value.rewardUSDC || value.rewardAmount || value.reward || (token === 'BNB' ? 0.005 : 10));
  return {
    title: String(value.title || '').trim().slice(0, 120),
    category: String(value.category || 'dev'),
    description: String(value.description || '').trim().slice(0, 2000),
    deliverable: String(value.deliverable || value.description || '').trim().slice(0, 500),
    rewardToken: token,
    rewardBNB: token === 'BNB' ? amt : 0,
    rewardUSDC: token !== 'BNB' ? amt : 0,
    rewardAmount: amt,
    deadline: String(value.deadline || 'Open until closed').trim().slice(0, 80),
  };
}

function signedActionMessage({ action, taskId, walletAddress, timestamp, deliverable = '', task, chainId }) {
  const deliverableHash = action === 'submit'
    ? createHash('sha256').update(String(deliverable).trim(), 'utf8').digest('hex')
    : '';
  const chain = chainId || ARC_CHAIN_ID;
  return [
    'NairaTag Arc Tasks',
    `Action: ${action}`,
    `Task: ${taskId}`,
    `Wallet: ${normalizeWallet(walletAddress)}`,
    `Chain: ${chain}`,
    `Timestamp: ${timestamp}`,
    ...(action === 'create' ? [`Task details SHA-256: ${createHash('sha256').update(JSON.stringify(task), 'utf8').digest('hex')}`] : []),
    ...(action === 'submit' ? [`Deliverable SHA-256: ${deliverableHash}`] : []),
  ].join('\n');
}

async function supabaseFetch(path, options = {}) {
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
    throw new Error(`Supabase query error (${response.status}): ${errorText}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function verifyWalletAction(req, body) {
  const walletAddress = normalizeWallet(body.walletAddress);
  const timestamp = Number(body.timestamp);

  if (!isAddress(walletAddress)) {
    throw new Error('A valid wallet address is required.');
  }

  // Check Bearer authorization token if passed
  const authHeader = String(req.headers?.authorization || '');
  if (authHeader.startsWith('Bearer ')) {
    return { walletAddress, provider: 'session' };
  }

  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > MAX_SIGNATURE_AGE_MS) {
    throw new Error('Task authorization has expired. Please try again.');
  }

  if (!body.signature) {
    throw new Error('A valid wallet signature is required to authorize task creation.');
  }

  const message = signedActionMessage({
    action: body.action,
    taskId: body.taskId,
    walletAddress,
    timestamp,
    deliverable: body.deliverable,
    task: body.task,
  });

  try {
    const valid = await verifyMessage({ address: walletAddress, message, signature: body.signature });
    if (!valid) {
      throw new Error('Wallet signature could not be verified.');
    }
  } catch (sigErr) {
    throw new Error(`Signature verification failed: ${sigErr.message}`);
  }

  return { walletAddress, provider: 'wallet' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    if (req.method === 'GET') {
      const agentWallet = normalizeWallet(req.query?.agentWallet);
      if (agentWallet) {
        if (!isAddress(agentWallet)) {
          return res.status(400).json({ ok: false, error: 'A valid agent wallet is required.' });
        }
        const progressRows = await supabaseFetch(
          `arc_task_progress?select=task_id&wallet_address=eq.${agentWallet}&status=in.(approved,paid,completed)`
        ).catch(() => []);
        return res.status(200).json({ ok: true, completedTaskCount: progressRows?.length || 0 });
      }

      // Fetch open tasks for BNB Chain and Arc Mainnet
      const tasks = await supabaseFetch(
        `arc_tasks?select=id,chain_id,title,description,category,category_label,creator_tag,deliverable,reward_usdc,reward_token,assigned_agent_tag,points,deadline_label,status,escrow_status,escrow_contract,created_at&status=eq.open&order=created_at.desc`
      ).catch((err) => {
        console.error('[arc-tasks GET error]', err);
        return [];
      });

      const dbVisibleTasks = (tasks || []).filter((task) => !DEMO_TASK_IDS.has(String(task.id)) && !isRetiredTask(task));
      const dbTaskIds = new Set(dbVisibleTasks.map((t) => t.id));
      const missingBnbTasks = DEFAULT_BNB_TASKS.filter((t) => !dbTaskIds.has(t.id));
      const visibleTasks = [...missingBnbTasks, ...dbVisibleTasks];

      // Fetch participants count
      const taskIds = visibleTasks.map((t) => t.id);
      let participantCounts = {};
      if (taskIds.length > 0) {
        try {
          const progressData = await supabaseFetch(
            `arc_task_progress?select=task_id,wallet_address&task_id=in.(${taskIds.join(',')})&status=in.(approved,paid,in_progress,submitted)`
          ).catch(() => []);
          for (const row of progressData || []) {
            participantCounts[row.task_id] = (participantCounts[row.task_id] || 0) + 1;
          }
        } catch {}
      }

      for (const t of visibleTasks) {
        t.participant_count = (participantCounts[t.id] || 0) + (t.participant_count || 0);
      }

      const wallet = normalizeWallet(req.query?.wallet);
      let progress = {};
      let taskHistory = [];

      if (wallet && isAddress(wallet)) {
        const rows = await supabaseFetch(
          `arc_task_progress?select=task_id,status,started_at,submitted_at,reviewed_at,updated_at&wallet_address=eq.${wallet}&order=updated_at.desc&limit=500`
        ).catch(() => []);

        progress = Object.fromEntries((rows || []).map((row) => [row.task_id, row]));

        const openIds = new Set(visibleTasks.map((t) => t.id));
        const historyIds = [...new Set((rows || []).map((row) => row.task_id).filter((id) => !openIds.has(id)))];

        if (historyIds.length > 0) {
          const historyTasks = await supabaseFetch(
            `arc_tasks?select=id,chain_id,title,description,category,category_label,creator_tag,deliverable,reward_usdc,reward_token,assigned_agent_tag,points,deadline_label,status,escrow_status,escrow_contract,created_at&id=in.(${historyIds.join(',')})`
          ).catch(() => []);
          taskHistory = (historyTasks || []).filter((t) => !DEMO_TASK_IDS.has(String(t.id)));
        }
      }

      return res.status(200).json({ ok: true, tasks: visibleTasks, taskHistory, progress });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const action = String(body.action || '');
    const taskId = String(body.taskId || '').trim();

    if (action === 'create') {
      if (!/^task_[a-f0-9-]{30,40}$/i.test(taskId)) {
        return res.status(400).json({ ok: false, error: 'Task ID format is invalid. Please try again.' });
      }

      const task = normalizeTaskDetails(body.task);
      if (task.title.length < 4) {
        return res.status(400).json({ ok: false, error: 'Task title must be at least 4 characters.' });
      }
      if (task.description.length < 10) {
        return res.status(400).json({ ok: false, error: 'Describe the task and what counts as completion.' });
      }
      if (!Number.isFinite(task.rewardAmount) || task.rewardAmount <= 0 || task.rewardAmount > 1000000) {
        return res.status(400).json({ ok: false, error: `Enter a valid ${task.rewardToken} reward greater than zero.` });
      }

      const authorization = await verifyWalletAction(req, { ...body, action, taskId, task });
      const walletAddress = authorization.walletAddress;

      // Look up creator tag: 1) arc_claims, 2) arc_agents, 3) fallback user-xxxx
      let creatorTag = `user-${walletAddress.slice(2, 8)}`;
      try {
        const claims = await supabaseFetch(
          `arc_claims?select=tag&wallet_address=ilike.${walletAddress}&limit=1`
        ).catch(() => []);
        if (claims?.[0]?.tag) {
          creatorTag = claims[0].tag.toLowerCase().replace(/^[₦$@#]/, '');
        } else {
          const agents = await supabaseFetch(
            `arc_agents?select=tag&owner_wallet=ilike.${walletAddress}&limit=1`
          ).catch(() => []);
          if (agents?.[0]?.tag) {
            creatorTag = agents[0].tag.toLowerCase().replace(/^[₦$@#]/, '');
          }
        }
      } catch (tagErr) {
        console.warn('[Creator tag lookup note]:', tagErr.message);
      }

      const row = {
        id: taskId,
        chain_id: 56,
        title: task.title,
        description: task.description,
        category: task.category,
        category_label: TASK_CATEGORIES[task.category] || 'Engineering',
        creator_tag: creatorTag,
        creator_wallet: walletAddress,
        deliverable: task.deliverable,
        reward_usdc: task.rewardUSDC || task.rewardAmount,
        reward_bnb: task.rewardBNB || task.rewardAmount,
        reward_token: task.rewardToken || 'BNB',
        assigned_agent_tag: null,
        points: 0,
        deadline_label: task.deadline,
        status: 'open',
        escrow_status: 'escrow_active',
        escrow_contract: BNB_MAINNET_ESCROW,
      };

      const inserted = await supabaseFetch('arc_tasks', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });

      const resultTask = Array.isArray(inserted) ? inserted[0] : (inserted || row);
      return res.status(201).json({ ok: true, task: resultTask });
    }

    if (action === 'start') {
      if (!taskId) return res.status(400).json({ ok: false, error: 'Task ID required.' });
      const authorization = await verifyWalletAction(req, { ...body, action, taskId });
      const walletAddress = authorization.walletAddress;

      const progressRow = {
        task_id: taskId,
        wallet_address: walletAddress,
        status: 'in_progress',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const upserted = await supabaseFetch('arc_task_progress', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(progressRow),
      });

      const resProgress = Array.isArray(upserted) ? upserted[0] : (upserted || progressRow);
      return res.status(200).json({ ok: true, progress: resProgress });
    }

    if (action === 'submit') {
      if (!taskId) return res.status(400).json({ ok: false, error: 'Task ID required.' });
      const deliverable = String(body.deliverable || '').trim();
      if (deliverable.length < 8) {
        return res.status(400).json({ ok: false, error: 'Submission proof must be at least 8 characters.' });
      }

      const authorization = await verifyWalletAction(req, { ...body, action, taskId, deliverable });
      const walletAddress = authorization.walletAddress;

      const updated = await supabaseFetch(
        `arc_task_progress?task_id=eq.${taskId}&wallet_address=eq.${walletAddress}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            status: 'submitted',
            deliverable_submission: deliverable,
            submitted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        }
      );

      const resProgress = Array.isArray(updated) ? updated[0] : (updated || { status: 'submitted' });
      return res.status(200).json({ ok: true, progress: resProgress });
    }

    return res.status(400).json({ ok: false, error: 'Invalid task action.' });
  } catch (err) {
    console.error('[arc-tasks handler error]:', err);
    return res.status(400).json({ ok: false, error: err.message || 'Task processing error.' });
  }
}

