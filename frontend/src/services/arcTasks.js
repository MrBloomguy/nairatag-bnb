import { broadcastArcPaidTaskToTelegram, broadcastArcTaskToTelegram } from './arcSocialBroadcast.js';
import { getArcSessionToken } from './arcSession.js';

const API = import.meta.env.VITE_ARC_TASKS_API || '/api/arc-tasks';
const ARC_CHAIN_ID = 56;
const alertedPaidTasks = new Set();
const RETIRED_TASK_TITLES = new Set([
  'design dark-canvas sovereign agent card assets',
  'build an opera minipay deep-link widget',
  'forex spot rate verification (usdc / ngn)',
  'defi tvl & price benchmark feed on bnb smart chain',
  'supply defi tvl & protocol liquidity rankings for bnb agents',
  'weather & city commerce oracle telemetry',
  'sub-second settlement benchmark on bnb smart chain',
  'monitor the bnb smart chain tag',
  'defi tvl & liquidity health audit',
  'commercial delivery weather risk clearance',
  'real-time fx exchange rate benchmark',
  'autonomous agent-to-agent payment settlement',
]);
const TASK_CATEGORY_LABELS = {
  dev: 'Engineering', design: 'Design', data: 'Data & AI', content: 'Content',
  test: 'Testing', community: 'Community', analytics: 'Analytics & DeFi',
  logistics: 'Logistics & Weather', pricing: 'FX & Pricing', settlement: 'Agent Settlement',
};

function mapTask(row) {
  const rewardToken = String(row.reward_token || 'BNB').toUpperCase();
  const rewardBNB = row.reward_bnb != null ? Number(row.reward_bnb) : (rewardToken === 'BNB' ? Number(row.reward_usdc || 0.005) : null);
  const rewardUSDC = Number(row.reward_usdc || 0);
  return {
    id: row.id,
    chainId: Number(row.chain_id || 56),
    title: row.title,
    description: row.description,
    category: row.category,
    categoryLabel: TASK_CATEGORY_LABELS[String(row.category || '').toLowerCase()] || row.category_label || 'Task',
    creatorTag: row.creator_tag,
    deliverable: row.deliverable,
    rewardToken,
    rewardBNB: rewardBNB ?? (rewardToken === 'BNB' ? 0.005 : null),
    rewardUSDC,
    points: Number(row.points || 0),
    deadline: row.deadline_label,
    status: row.status,
    escrowStatus: row.escrow_status === 'not_integrated' ? 'Escrow Protected (BNB Chain)' : (row.escrow_status || 'Escrow Protected (BNB Chain)'),
    escrowContract: row.escrow_contract || '0x0fcdf115e1cff7b85835cd8ccdc0a66c8c9a95f7',
    participantCount: Number(row.participant_count) || 0,
    createdAt: row.created_at,
  };
}
function mapProgress(progress) {
  return Object.fromEntries(Object.entries(progress || {}).map(([id, row]) => [id, {
    status: row.status,
    startedAt: row.started_at ? new Date(row.started_at).getTime() : null,
    submittedAt: row.submitted_at ? new Date(row.submitted_at).getTime() : null,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).getTime() : null,
  }]));
}
async function readResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.error || `BNB Chain task service returned ${response.status}.`);
  return body;
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '').trim()));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function tasksUrl() { return new URL(API, window.location.origin); }

export async function listArcTasks(walletAddress = '') {
  const url = tasksUrl();
  if (walletAddress) url.searchParams.set('wallet', walletAddress);
  const payload = await readResponse(await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' }));
  const tasks = (payload.tasks || []).map(mapTask)
    .filter((task) => !RETIRED_TASK_TITLES.has(String(task.title || '').trim().toLowerCase()));
  const progress = mapProgress(payload.progress);
  if (walletAddress) {
    Object.entries(progress).filter(([id, row]) => row.status === 'paid' && !alertedPaidTasks.has(`${walletAddress.toLowerCase()}:${id}`)).forEach(([id]) => {
      const key = `${walletAddress.toLowerCase()}:${id}`;
      alertedPaidTasks.add(key);
      broadcastArcPaidTaskToTelegram({ taskId: id, walletAddress }).catch((error) => console.warn('[Telegram task reward alert]', error.message));
    });
  }
  return { tasks, progress };
}

export async function createArcTask({ walletAddress, sessionToken, task }) {
  if (!walletAddress) throw new Error('Sign in to post a task.');
  const taskId = `task_${crypto.randomUUID().replaceAll('-', '')}`;
  const rewardToken = String(task.rewardToken || 'BNB').toUpperCase();
  const rewardAmount = Number(task.rewardAmount || task.rewardBNB || task.rewardUSDC || (rewardToken === 'BNB' ? 0.005 : 10));
  const taskDetails = {
    title: String(task.title || '').trim().slice(0, 120),
    category: String(task.category || 'dev'),
    description: String(task.description || '').trim().slice(0, 2000),
    deliverable: String(task.deliverable || task.description || '').trim().slice(0, 500),
    rewardToken,
    rewardBNB: rewardToken === 'BNB' ? rewardAmount : 0,
    rewardUSDC: rewardToken !== 'BNB' ? rewardAmount : 0,
    rewardAmount,
    deadline: String(task.deadline || 'Open until closed').trim().slice(0, 80),
  };
  const timestamp = Date.now();
  const detailsHash = await sha256Hex(JSON.stringify(taskDetails));
  const message = ['NairaTag Tasks', 'Action: create', `Task: ${taskId}`, `Wallet: ${walletAddress.toLowerCase()}`, `Chain: ${ARC_CHAIN_ID}`, `Timestamp: ${timestamp}`, `Task details SHA-256: ${detailsHash}`].join('\n');
  const provider = window.ethereum;
  if (!sessionToken && !provider?.request) throw new Error('Sign in again to authorize this task.');
  const signature = sessionToken ? '0x' : await provider.request({ method: 'personal_sign', params: [message, walletAddress] });
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const token = sessionToken || getArcSessionToken(walletAddress);
  if (token) headers.Authorization = `Bearer ${token}`;
  const body = await readResponse(await fetch(tasksUrl(), { method: 'POST', headers, body: JSON.stringify({ action: 'create', taskId, walletAddress, timestamp, signature, task: taskDetails }) }));
  return mapTask(body.task);
}

export async function getArcAgentCompletedTaskCount(walletAddress) {
  if (!walletAddress) return 0;
  const url = tasksUrl(); url.searchParams.set('agentWallet', walletAddress);
  const payload = await readResponse(await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' }));
  return Number(payload.completedTaskCount || 0);
}

export async function getArcAgentTaskTotals(walletAddress) {
  if (!walletAddress) return { earnings: 0, pointsEarned: 0 };
  const url = tasksUrl(); url.searchParams.set('wallet', walletAddress);
  const payload = await readResponse(await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' }));
  const tasks = (payload.tasks || []).map(mapTask);
  const progress = mapProgress(payload.progress);
  const byId = new Map(tasks.map((task) => [String(task.id), task]));
  let earnings = 0, pointsEarned = 0;
  for (const [id, item] of Object.entries(progress)) {
    const task = byId.get(String(id));
    if (!task) continue;
    if (item.status === 'paid') earnings += task.rewardUSDC || 0;
    if (['approved', 'paid', 'completed'].includes(item.status)) pointsEarned += task.points || 0;
  }
  return { earnings, pointsEarned };
}

async function submitAction({ action, taskId, walletAddress, deliverable, taskTitle, rewardUSDC, points, sessionToken }) {
  if (!walletAddress) throw new Error('Sign in to update task progress.');
  const timestamp = Date.now();
  const deliverableHash = action === 'submit' ? await sha256Hex(deliverable) : '';
  const message = ['NairaTag BNB Tasks', `Action: ${action}`, `Task: ${taskId}`, `Wallet: ${walletAddress.toLowerCase()}`, `Chain: ${ARC_CHAIN_ID}`, `Timestamp: ${timestamp}`, ...(deliverableHash ? [`Deliverable SHA-256: ${deliverableHash}`] : [])].join('\n');
  const provider = window.ethereum;
  const token = sessionToken || getArcSessionToken(walletAddress);
  if (!token && !provider?.request) throw new Error('Sign in again to authorize this task update.');
  const signature = token ? '0x' : await provider.request({ method: 'personal_sign', params: [message, walletAddress] });
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const body = await readResponse(await fetch(tasksUrl(), { method: 'POST', headers, body: JSON.stringify({ action, taskId, walletAddress, timestamp, signature, deliverable }) }));
  const progress = mapProgress({ [taskId]: body.progress })[taskId];
  if (signature !== '0x') broadcastArcTaskToTelegram({ action, taskId, taskTitle, rewardUSDC, points, walletAddress, timestamp, signature, deliverableHash }).catch((error) => console.warn('[Telegram task alert]', error.message));
  return progress;
}
export function startArcTask(args) { return submitAction({ ...args, action: 'start' }); }
export function submitArcTask(args) { return submitAction({ ...args, action: 'submit' }); }
export {
  lockTaskBountyOnChain, assignTaskWorkerOnChain, submitDeliverableOnChain, releaseTaskBountyOnChain,
  getOnChainBounty, getEscrowContractAddress,
} from './arcEscrow.js';
