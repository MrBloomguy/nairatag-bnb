import { createHash, randomBytes } from 'node:crypto';
import { createPublicClient, http, isAddress, parseAbi } from 'viem';
import { supabase } from '../supabase.js';
import { readArcSession } from './session-auth.js';
import { verifyTelegramWebAppInitData } from './telegram-webapp-auth.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.mainnet.arc.io';
const REGISTRY = '0xb3a2d06ead0a889485a844a63be309c4df4b17b3';
const registryAbi = parseAbi(['function ownerOf(string tag) view returns (address)']);
const publicClient = createPublicClient({ transport: http(RPC_URL) });
const reservedTags = new Set(['nairatag', 'bloom', 'defillama', 'meteo', 'coingecko', 'arc']);
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function respond(res, status, payload) { return res.status(status).json(payload); }
function cleanTag(value) { return String(value || '').trim().replace(/^[₦$@#]/, '').toLowerCase(); }

function parseBody(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body || {};
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return respond(res, 405, { ok: false, error: 'Method not allowed.' });

  try {
    const body = parseBody(req);
    if (!BOT_TOKEN) return respond(res, 503, { ok: false, error: 'Telegram sign-in is not configured.' });
    let telegramUser;
    try { telegramUser = verifyTelegramWebAppInitData(body.initData, BOT_TOKEN); }
    catch (authError) { return respond(res, 401, { ok: false, error: authError.message }); }
    if (body.action === 'validate') {
      const linkToken = randomBytes(32).toString('base64url');
      const { error } = await supabase.from('arc_telegram_link_challenges').insert({
        challenge_hash: createHash('sha256').update(linkToken).digest('hex'),
        telegram_user_id: telegramUser.id,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
      if (error) throw new Error('Telegram sign-in could not be started.');
      return respond(res, 200, {
        ok: true,
        user: { username: telegramUser.username, firstName: telegramUser.firstName, languageCode: telegramUser.languageCode },
        linkToken,
      });
    }
    if (body.action === 'availability') {
      const tag = cleanTag(body.tag);
      if (!/^[a-z0-9][a-z0-9_]{1,30}[a-z0-9]$/.test(tag) || tag.includes('__')) {
        return respond(res, 200, { ok: true, available: false, reason: 'Use 3–32 letters or numbers, with single underscores only inside the name.' });
      }
      if (reservedTags.has(tag)) return respond(res, 200, { ok: true, available: false, reason: `₦${tag.toUpperCase()} is an official NairaTag agent.` });
      const [userClaim, arcClaim] = await Promise.all([
        supabase.from('user_claims').select('wallet_address').ilike('clean_tag', tag).limit(1),
        supabase.from('arc_claims').select('wallet_address').ilike('tag', tag).limit(1),
      ]);
      if (userClaim.error || arcClaim.error) throw new Error('The NairaTag claim records are temporarily unavailable.');
      if (userClaim.data?.length || arcClaim.data?.length) {
        return respond(res, 200, { ok: true, available: false, reason: `₦${tag.toUpperCase()} is already registered with NairaTag.` });
      }
      const owner = await publicClient.readContract({ address: REGISTRY, abi: registryAbi, functionName: 'ownerOf', args: [tag] });
      if (owner !== ZERO_ADDRESS) return respond(res, 200, { ok: true, available: false, reason: `₦${tag.toUpperCase()} is already claimed on Arc.` });
      return respond(res, 200, { ok: true, available: true, tag, displayTag: `₦${tag.toUpperCase()}` });
    }
    if (body.action !== 'link_wallet') return respond(res, 400, { ok: false, error: 'Choose a valid Telegram claim action.' });

    const session = readArcSession(req);
    if (!session) return respond(res, 401, { ok: false, error: 'Sign in to NairaTag before linking this Telegram account.' });
    if (!isAddress(session.walletAddress)) return respond(res, 401, { ok: false, error: 'Your NairaTag session is invalid. Sign in again.' });
    if (typeof body.linkToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.linkToken)) {
      return respond(res, 401, { ok: false, error: 'Telegram claim session is missing. Reopen this screen from the bot.' });
    }

    const tag = cleanTag(body.tag);
    if (!/^[a-z0-9][a-z0-9_]{1,30}[a-z0-9]$/.test(tag) || tag.includes('__')) {
      return respond(res, 400, { ok: false, error: 'A valid claimed NairaTag is required.' });
    }
    const owner = await publicClient.readContract({ address: REGISTRY, abi: registryAbi, functionName: 'ownerOf', args: [tag] });
    if (owner.toLowerCase() !== session.walletAddress.toLowerCase()) {
      return respond(res, 403, { ok: false, error: 'The signed-in Arc wallet does not own this on-chain NairaTag.' });
    }

    const { data, error } = await supabase.rpc('arc_link_telegram_identity', {
      p_telegram_user_id: telegramUser.id,
      p_wallet: session.walletAddress,
      p_username: telegramUser.username,
      p_link_token_hash: createHash('sha256').update(body.linkToken).digest('hex'),
    });
    if (error) throw Object.assign(new Error(error.message || 'Telegram account could not be linked.'), { status: 409 });
    return respond(res, 200, { ok: true, identity: data, tag });
  } catch (error) {
    const status = Number(error.status) || 500;
    return respond(res, status, { ok: false, error: status >= 500 ? 'Telegram claim service is temporarily unavailable.' : error.message });
  }
}
