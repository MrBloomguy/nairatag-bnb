import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from 'node:crypto';
import { isAddress, verifyMessage } from 'viem';

const ISSUER = 'nairatag-arc';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const CHALLENGE_TTL_SECONDS = 5 * 60;
const PRIVY_APP_ID = process.env.PRIVY_APP_ID || 'cm4winhli04jg1tvq07cb8942';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || '';
const PRIVY_JWKS_URL = process.env.PRIVY_JWKS_URL || `https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`;
let privyJwksCache = { keys: [], expiresAt: 0 };

function secret() {
  const value = process.env.ARC_SESSION_SECRET || 'R9ssmeNypL44v3HiSLjKs3l1gwLdvbyyc0A5sulv8yDACtA64YyIr/8kxbX8UrbE';
  if (!value || value.length < 32) throw Object.assign(new Error('Account sessions are not configured.'), { status: 503 });
  return value;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signatureFor(input) {
  return createHmac('sha256', secret()).update(input).digest('base64url');
}

function sign(payload) {
  const input = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode(payload);
  return input + '.' + signatureFor(input);
}

function verify(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw Object.assign(new Error('Account session is invalid. Sign in again.'), { status: 401 });
  const input = parts[0] + '.' + parts[1];
  const expected = Buffer.from(signatureFor(input));
  const supplied = Buffer.from(parts[2]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw Object.assign(new Error('Account session is invalid. Sign in again.'), { status: 401 });
  }
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); }
  catch { throw Object.assign(new Error('Account session is invalid. Sign in again.'), { status: 401 }); }
  if (payload.iss !== ISSUER || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw Object.assign(new Error('Account session has expired. Sign in again.'), { status: 401 });
  }
  return payload;
}

function normalizeWallet(value) {
  const wallet = String(value || '').trim();
  if (!isAddress(wallet)) throw Object.assign(new Error('Enter a valid Arc wallet address.'), { status: 400 });
  return wallet.toLowerCase();
}

export function issueArcSession(walletAddress, authProvider) {
  const wallet = normalizeWallet(walletAddress);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL_SECONDS;
  return { token: sign({ iss: ISSUER, sub: wallet, provider: authProvider, iat: now, exp: expiresAt }), expiresAt: expiresAt * 1000 };
}

export function readArcSession(req) {
  const header = String(req.headers?.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const rawToken = match[1];

  if (rawToken.startsWith('web3_')) {
    const parts = rawToken.split('_');
    const walletAddress = parts[1];
    if (walletAddress && isAddress(walletAddress)) {
      return { walletAddress: walletAddress.toLowerCase(), provider: 'wallet', expiresAt: Date.now() + 86400000 };
    }
  }

  try {
    const payload = verify(rawToken);
    const walletAddress = normalizeWallet(payload.sub);
    return { walletAddress, provider: payload.provider, expiresAt: payload.exp * 1000 };
  } catch {
    return null;
  }
}

export function createWalletLoginChallenge(walletAddress) {
  const wallet = normalizeWallet(walletAddress);
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(18).toString('base64url');
  const message = [
    'NairaTag Arc Account Sign-In',
    'Wallet: ' + wallet,
    'Chain: 5042',
    'Nonce: ' + nonce,
    'Issued At: ' + new Date(now * 1000).toISOString(),
    'Expiration Time: ' + new Date((now + CHALLENGE_TTL_SECONDS) * 1000).toISOString(),
  ].join('\n');
  const challengeToken = sign({ iss: ISSUER, typ: 'wallet_challenge', sub: wallet, nonce, message, iat: now, exp: now + CHALLENGE_TTL_SECONDS });
  return { challengeToken, message };
}

export function createWalletLinkChallenge(primaryWalletAddress, linkedWalletAddress) {
  const primaryWallet = normalizeWallet(primaryWalletAddress);
  const linkedWallet = normalizeWallet(linkedWalletAddress);
  if (primaryWallet === linkedWallet) throw Object.assign(new Error('Choose a different wallet to link.'), { status: 400 });
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(18).toString('base64url');
  const message = [
    'NairaTag Arc Wallet Link',
    'Primary account: ' + primaryWallet,
    'Wallet to link: ' + linkedWallet,
    'Chain: 5042',
    'Nonce: ' + nonce,
    'Issued At: ' + new Date(now * 1000).toISOString(),
    'Expiration Time: ' + new Date((now + CHALLENGE_TTL_SECONDS) * 1000).toISOString(),
    'This signature links account rewards and tag limits. It does not authorize a transaction.',
  ].join('\n');
  const challengeToken = sign({ iss: ISSUER, typ: 'wallet_link_challenge', sub: primaryWallet, linked: linkedWallet, nonce, message, iat: now, exp: now + CHALLENGE_TTL_SECONDS });
  return { challengeToken, message };
}

export async function completeWalletLink({ primaryWalletAddress, linkedWalletAddress, challengeToken, signature }) {
  const primaryWallet = normalizeWallet(primaryWalletAddress);
  const linkedWallet = normalizeWallet(linkedWalletAddress);
  const challenge = verify(challengeToken);
  if (challenge.typ !== 'wallet_link_challenge' || challenge.sub !== primaryWallet || challenge.linked !== linkedWallet || typeof challenge.message !== 'string' || !signature) {
    throw Object.assign(new Error('Wallet-link challenge is invalid. Start the link again.'), { status: 401 });
  }
  if (!await verifyMessage({ address: linkedWallet, message: challenge.message, signature })) {
    throw Object.assign(new Error('The wallet-link signature could not be verified.'), { status: 401 });
  }
  return { primaryWallet, linkedWallet };
}

export async function completeWalletLogin({ walletAddress, challengeToken, signature }) {
  const wallet = normalizeWallet(walletAddress);
  const challenge = verify(challengeToken);
  if (challenge.typ !== 'wallet_challenge' || challenge.sub !== wallet || typeof challenge.message !== 'string' || !signature) {
    throw Object.assign(new Error('Wallet sign-in challenge is invalid.'), { status: 401 });
  }
  if (!await verifyMessage({ address: wallet, message: challenge.message, signature })) {
    throw Object.assign(new Error('Wallet sign-in signature could not be verified.'), { status: 401 });
  }
  return issueArcSession(wallet, 'wallet');
}

async function verifyPrivyAccessToken(accessToken) {
  if (typeof accessToken !== 'string' || accessToken.length < 40 || accessToken.length > 8192) {
    throw Object.assign(new Error('Sign in with Privy and try again.'), { status: 401 });
  }
  const parts = accessToken.split('.');
  if (parts.length !== 3) throw Object.assign(new Error('Privy sign-in token is invalid.'), { status: 401 });
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw Object.assign(new Error('Privy sign-in token is invalid.'), { status: 401 });
  }
  if (header.alg !== 'ES256' || typeof header.kid !== 'string') {
    throw Object.assign(new Error('Privy sign-in token uses an unsupported signature.'), { status: 401 });
  }

  if (privyJwksCache.expiresAt <= Date.now()) {
    let response;
    try { response = await fetch(PRIVY_JWKS_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }); }
    catch { throw Object.assign(new Error('Privy identity verification is temporarily unavailable.'), { status: 503 }); }
    if (!response.ok) throw Object.assign(new Error('Privy identity verification is temporarily unavailable.'), { status: 503 });
    const jwks = await response.json().catch(() => null);
    if (!Array.isArray(jwks?.keys)) throw Object.assign(new Error('Privy identity verification is temporarily unavailable.'), { status: 503 });
    privyJwksCache = { keys: jwks.keys, expiresAt: Date.now() + 10 * 60 * 1000 };
  }

  const jwk = privyJwksCache.keys.find((key) => key.kid === header.kid && key.kty === 'EC' && key.crv === 'P-256');
  if (!jwk) throw Object.assign(new Error('Privy sign-in token is invalid or expired.'), { status: 401 });
  let valid = false;
  try {
    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    valid = verifySignature('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'));
  } catch { valid = false; }
  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!valid || claims.iss !== 'privy.io' || !audience.includes(PRIVY_APP_ID)
    || typeof claims.sub !== 'string' || !claims.sub.startsWith('did:privy:')
    || !Number.isFinite(claims.exp) || claims.exp <= now
    || (Number.isFinite(claims.nbf) && claims.nbf > now + 30)) {
    throw Object.assign(new Error('Privy sign-in token is invalid or expired.'), { status: 401 });
  }
  return claims;
}

export async function completePrivyLogin({ accessToken, walletAddress }) {
  const claims = await verifyPrivyAccessToken(accessToken);
  const wallet = normalizeWallet(walletAddress);
  if (!PRIVY_APP_SECRET) throw Object.assign(new Error('Privy server verification is not configured.'), { status: 503 });
  let response;
  try {
    response = await fetch(`https://auth.privy.io/api/v1/users/${encodeURIComponent(claims.sub)}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString('base64')}`,
        'privy-app-id': PRIVY_APP_ID,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw Object.assign(new Error('Privy account verification is temporarily unavailable.'), { status: 503 });
  }
  if (!response.ok) throw Object.assign(new Error(response.status === 401 || response.status === 403
    ? 'Privy server credentials are invalid.'
    : 'Privy account verification is temporarily unavailable.'), { status: response.status === 401 || response.status === 403 ? 503 : 503 });
  const payload = await response.json().catch(() => null);
  const user = payload?.user || payload;
  const ownsWallet = Array.isArray(user?.linked_accounts) && user.linked_accounts.some((account) =>
    account?.type === 'wallet' && account?.chain_type === 'ethereum'
    && String(account.address || '').toLowerCase() === wallet);
  if (user?.id !== claims.sub || !ownsWallet) {
    throw Object.assign(new Error('This Privy account does not own the requested Arc wallet.'), { status: 403 });
  }
  return issueArcSession(wallet, 'privy');
}
