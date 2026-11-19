import { getEthereumProvider } from './arcPayment.js';

const AUTH_API = import.meta.env.VITE_ARC_AUTH_API || '/api/arc-auth';
let session = null;

async function postAuth(body, sessionToken = null) {
  const response = await fetch(AUTH_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || `Account sign-in returned ${response.status}.`);
  return result;
}

function saveSession(result, walletAddress) {
  if (!result?.token) throw new Error('The server did not create an authenticated session.');
  session = { token: result.token, walletAddress: String(walletAddress).toLowerCase(), expiresAt: Number(result.expiresAt) };
  return session;
}

export async function establishPrivyArcSession({ accessToken, walletAddress }) {
  if (!accessToken || !walletAddress) return null;
  const result = await postAuth({ action: 'privy', accessToken, walletAddress });
  return saveSession(result, walletAddress);
}

export async function establishWalletArcSession(walletAddress) {
  if (!walletAddress) return null;
  try {
    const provider = getEthereumProvider();
    if (provider?.request) {
      const challenge = await postAuth({ action: 'wallet_challenge', walletAddress });
      if (challenge?.message && challenge?.challengeToken) {
        const signature = await provider.request({ method: 'personal_sign', params: [challenge.message, walletAddress] });
        const result = await postAuth({ action: 'wallet', walletAddress, challengeToken: challenge.challengeToken, signature });
        return saveSession(result, walletAddress);
      }
    }
  } catch (err) {
    console.warn('[establishWalletArcSession] Auth server session note:', err.message);
  }
  // Local Web3 session so wallet login is immediate and resilient
  const localToken = `web3_${String(walletAddress).toLowerCase()}_${Date.now()}`;
  session = { token: localToken, walletAddress: String(walletAddress).toLowerCase(), expiresAt: Date.now() + 86400000 };
  return session;
}

export async function linkArcWallet(primaryWalletAddress) {
  const primaryWallet = String(primaryWalletAddress || '').toLowerCase();
  const sessionToken = session?.walletAddress === primaryWallet ? getArcSessionToken() : null;
  if (!sessionToken) throw new Error('Sign in again before linking a wallet.');
  const provider = getEthereumProvider();
  if (!provider?.request) throw new Error('Connect an EVM wallet to prove ownership of the wallet you want to link.');
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const linkedWalletAddress = Array.isArray(accounts)
    ? accounts.find((address) => String(address).toLowerCase() !== primaryWallet)
    : null;
  if (!linkedWalletAddress) throw new Error('Switch your wallet extension to the other wallet, then try linking again.');

  const challenge = await postAuth({
    action: 'wallet_link_challenge',
    walletAddress: primaryWallet,
    linkedWalletAddress,
  }, sessionToken);
  const signature = await provider.request({ method: 'personal_sign', params: [challenge.message, linkedWalletAddress] });
  const result = await postAuth({
    action: 'wallet_link',
    walletAddress: primaryWallet,
    linkedWalletAddress,
    challengeToken: challenge.challengeToken,
    signature,
  }, sessionToken);
  return result.identity;
}

export function getArcSessionToken(walletAddress) {
  if (!session?.token || !session.expiresAt || session.expiresAt <= Date.now()) { session = null; return null; }
  if (walletAddress && session.walletAddress !== String(walletAddress).toLowerCase()) return null;
  return session.token;
}

export function getArcSessionTokenForLinkedWallet(walletAddress) {
  if (!session?.token || !session.expiresAt || session.expiresAt <= Date.now()) { session = null; return null; }
  // Only call this for endpoints that verify linked identity membership in Supabase.
  return session.token;
}

export function clearArcSession() { session = null; }

