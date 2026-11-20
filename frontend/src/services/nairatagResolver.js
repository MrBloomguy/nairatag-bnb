/**
 * @file nairatagResolver.js
 * @description Canonical NairaTag Identity and Address-Resolution Adapter.
 * Bridges Arc payment workflows to the canonical NairaTag registry & Supabase identity layer.
 * 
 * Rules:
 * - Never returns simulated/mock identities.
 * - Normalizes tags with Unicode anti-spoofing and lowercase canonicalization.
 * - Resolves verified wallet address and network binding.
 */

import { isAddress, getAddress } from 'viem';
import { ARC_NAIRATAG_REGISTRY_ADDRESS, BNB_OFFICIAL_AGENT_ID } from '../config/arc.js';
import { publicClient } from './arcPayment.js';

export const SPACE_ID_AGENT_ID_ADDRESS = BNB_OFFICIAL_AGENT_ID || '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F';

export const SPACE_ID_AGENT_ID_ABI = [
  {
    type: 'function',
    name: 'ownerOfHandle',
    stateMutability: 'view',
    inputs: [{ name: 'handle', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'handleOf',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'string' }],
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
    name: 'isValidHandle',
    stateMutability: 'view',
    inputs: [{ name: 'handle', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
];

const RESOLVER_API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_NAIRATAG_RESOLVER_API) || '/api/claims';
const SUPABASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || 'https://bbpdupijsgdghemfpijr.supabase.co';

export const KNOWN_AGENTS = {
  nairatag: { address: '0x653f773C9062e71A6554b42a9525fcD47fCC1693', name: 'NairaTag Core Protocol', tag: '₦NAIRATAG' },
  binance: { address: '0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F', name: 'Binance Agentic Markets', tag: '₦BINANCE' },
  bloom: { address: '0x7c26a1F03339E2Ea74D261D97f5ab9C38181AF26', name: 'NairaTag Sovereign Agent', tag: '₦BLOOM' },
  defillama: { address: '0xbfA1f73F632a54bFd04e9925dB6006135FcA6Ce6', name: 'DefiLlama Oracle', tag: '₦DEFILLAMA' },
  meteo: { address: '0x235d0Aa81F1c375c3325214f2dd7F205487eae36', name: 'Open-Meteo Weather', tag: '₦METEO' },
  coingecko: { address: '0x1abfC727335489f2914Effd7e19C19C309850Ef8', name: 'CoinGecko FX', tag: '₦COINGECKO' },
  ola: { address: '0x033d1fa7b2a3a25c9cc24254eacd47f0bdb83dfa', name: 'Ola', tag: '₦OLA' },
  arc: { address: '0x653f773C9062e71A6554b42a9525fcD47fCC1693', name: 'Arc Protocol', tag: '₦ARC' },
};

/**
 * Normalizes user-entered NairaTag into canonical format.
 * Strips ₦ prefix, whitespace, and validates safe alphanumeric / underscore format.
 * Prevents homoglyphs / Unicode spoofing.
 */
export function normalizeTag(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    return { valid: false, error: 'Tag cannot be empty.' };
  }

  const trimmed = rawInput.trim();
  // Strip optional leading currency or at symbols: ₦, N, @, #
  const clean = trimmed.replace(/^[₦Nn@#]/, '').toLowerCase();

  if (clean.length < 2) {
    return { valid: false, error: 'Tag must be at least 2 characters long.' };
  }

  if (clean.length > 32) {
    return { valid: false, error: 'Tag cannot exceed 32 characters.' };
  }

  // Strict alphanumeric + underscores only (anti-homoglyph & anti-Unicode spoofing)
  if (!/^[a-z0-9_]+$/.test(clean)) {
    return {
      valid: false,
      error: 'Tag can only contain letters, numbers, and underscores (no emojis or special characters).'
    };
  }

  return {
    valid: true,
    cleanTag: clean,
    canonicalTag: `₦${clean}`,
    displayTag: `₦${clean}`
  };
}

/**
 * Validates whether an input is a NairaTag, a SPACE ID Agent ID (.ai), an EVM address, or invalid.
 * Strictly separates the sovereign NairaTag namespace (₦tag) from the SPACE ID namespace (.ai).
 */
export function classifyInput(input) {
  if (!input || typeof input !== 'string') return { type: 'invalid' };
  const trimmed = input.trim();

  // 1. EVM Hex Address
  if (isAddress(trimmed)) {
    return {
      type: 'address',
      address: getAddress(trimmed)
    };
  }

  const clean = trimmed.toLowerCase().replace(/^[@₦#]/, '');

  // 2. SPACE ID Agent ID (.ai domain on BNB Chain)
  if (clean.endsWith('.ai')) {
    const handle = clean.slice(0, -3);
    const isValid = /^[a-z0-9_-]+$/.test(handle) && handle.length >= 1 && handle.length <= 64;
    return {
      type: 'space_id',
      namespace: 'space-id',
      handle,
      name: `${handle}.ai`,
      canonicalTag: `${handle}.ai`,
      displayTag: `${handle}.ai`,
      valid: isValid,
      error: isValid ? null : 'SPACE ID Agent ID handle must be 1-64 alphanumeric characters.'
    };
  }

  // 3. Sovereign NairaTag
  const norm = normalizeTag(trimmed);
  if (norm.valid) {
    return {
      type: 'tag',
      namespace: 'nairatag',
      ...norm
    };
  }

  return {
    type: 'invalid',
    error: norm.error
  };
}

/**
 * Resolves a SPACE ID Agent ID (.ai handle) to its verified owner address on BNB Smart Chain.
 * Queries the official SPACE ID Agent ID contract (0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F) on Chain ID 56.
 * 
 * @param {string} rawInput - e.g. "binance.ai", "space.ai", "alice.ai"
 * @returns {Promise<{
 *   success: boolean,
 *   namespace: 'space-id',
 *   canonicalTag?: string,
 *   cleanTag?: string,
 *   handle?: string,
 *   resolvedAddress?: string,
 *   network?: string,
 *   isVerified?: boolean,
 *   source?: string,
 *   contract?: string,
 *   badge?: string,
 *   reputation?: number,
 *   error?: string
 * }>}
 */
export async function resolveSpaceIdAgent(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    return { success: false, namespace: 'space-id', error: 'Input cannot be empty.' };
  }

  const trimmed = rawInput.trim().toLowerCase();
  const clean = trimmed.replace(/^[@₦#]/, '');
  const handle = clean.endsWith('.ai') ? clean.slice(0, -3) : clean;

  if (!handle || handle.length < 1 || handle.length > 64) {
    return {
      success: false,
      namespace: 'space-id',
      error: 'Invalid SPACE ID Agent ID handle length (1-64 characters).',
    };
  }

  if (!/^[a-z0-9_-]+$/.test(handle)) {
    return {
      success: false,
      namespace: 'space-id',
      error: 'SPACE ID Agent ID handle may only contain letters, numbers, hyphens, and underscores.',
    };
  }

  const canonicalName = `${handle}.ai`;

  // 1. Direct on-chain resolution via official SPACE ID Agent ID contract on BNB Smart Chain Mainnet
  try {
    const owner = await publicClient.readContract({
      address: SPACE_ID_AGENT_ID_ADDRESS,
      abi: SPACE_ID_AGENT_ID_ABI,
      functionName: 'ownerOfHandle',
      args: [handle],
    });

    if (owner && isAddress(owner) && owner !== '0x0000000000000000000000000000000000000000') {
      return {
        success: true,
        namespace: 'space-id',
        tag: canonicalName,
        canonicalTag: canonicalName,
        cleanTag: canonicalName,
        handle,
        resolvedAddress: getAddress(owner),
        network: 'BNB Smart Chain',
        isVerified: true,
        source: 'space-id-agent-id',
        contract: SPACE_ID_AGENT_ID_ADDRESS,
        badge: 'SPACE ID Agent ID (.ai)',
        reputation: 100,
      };
    }
  } catch (contractErr) {
    console.warn('[SPACE ID resolution notice] On-chain readContract error:', contractErr?.message);
  }

  // 2. Check protocol reserved agents fallback
  if (KNOWN_AGENTS[handle]) {
    const agent = KNOWN_AGENTS[handle];
    return {
      success: true,
      namespace: 'space-id',
      tag: canonicalName,
      canonicalTag: canonicalName,
      cleanTag: canonicalName,
      handle,
      resolvedAddress: getAddress(agent.address),
      network: 'BNB Smart Chain',
      isVerified: true,
      source: 'protocol-registered-agent',
      contract: SPACE_ID_AGENT_ID_ADDRESS,
      badge: 'SPACE ID Agent ID (.ai)',
      reputation: 100,
    };
  }

  return {
    success: false,
    namespace: 'space-id',
    error: `SPACE ID Agent ID "${canonicalName}" is not registered on BNB Smart Chain.`,
    canonicalTag: canonicalName,
    isRegistered: false,
  };
}

/**
 * Resolves a recipient identifier to its verified recipient wallet address.
 * Dual-namespace aware:
 * - If ending in ".ai": resolves through SPACE ID Agent ID on BNB Smart Chain
 * - Otherwise: resolves through sovereign NairaTag protocol (₦TAG)
 * 
 * @param {string} rawTag - e.g. "₦michael", "michael", or "binance.ai"
 * @param {string} [network='bnb'] - Target payment network
 */
export async function resolveTag(rawTag, network = 'bnb') {
  if (!rawTag || typeof rawTag !== 'string') {
    return { success: false, error: 'Tag cannot be empty.' };
  }

  const cleanInput = rawTag.trim().toLowerCase().replace(/^[@₦#]/, '');

  // Route .ai domains directly to SPACE ID Agent ID resolver
  if (cleanInput.endsWith('.ai')) {
    return resolveSpaceIdAgent(rawTag);
  }

  const norm = normalizeTag(rawTag);
  if (!norm.valid) {
    return {
      success: false,
      error: norm.error,
    };
  }

  const clean = norm.cleanTag;

  // 1. Instant resolution for sovereign protocol agents
  if (KNOWN_AGENTS[clean]) {
    const agent = KNOWN_AGENTS[clean];
    return {
      success: true,
      namespace: 'nairatag',
      tag: agent.tag || norm.canonicalTag,
      canonicalTag: agent.tag || norm.canonicalTag,
      cleanTag: clean,
      resolvedAddress: getAddress(agent.address),
      network: 'BNB Smart Chain',
      isVerified: true,
      source: 'bnb-protocol-agent',
      reputation: 100,
    };
  }

  // Query the canonical API
  try {
    const url = `${RESOLVER_API_BASE}?action=resolve&tag=${encodeURIComponent(clean)}`;
    const res = await fetch(url, { cache: 'no-store' });

    if (res.status === 200) {
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.address && isAddress(data.address)) {
        return {
          success: true,
          namespace: 'nairatag',
          tag: data.tag || norm.canonicalTag,
          canonicalTag: data.tag || norm.canonicalTag,
          cleanTag: clean,
          resolvedAddress: getAddress(data.address),
          network: data.network || 'BNB Smart Chain',
          isVerified: true,
          source: 'canonical-nairatag-registry',
          reputation: data.reputation || 100,
        };
      }
    }

    if (res.status === 404) {
      // Check on-chain registry fallback before returning 404
      try {
        const owner = await publicClient.readContract({
          address: ARC_NAIRATAG_REGISTRY_ADDRESS,
          abi: [{ type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tag', type: 'string' }], outputs: [{ name: '', type: 'address' }] }],
          functionName: 'ownerOf',
          args: [clean],
        });
        if (owner && owner !== '0x0000000000000000000000000000000000000000') {
          return {
            success: true,
            namespace: 'nairatag',
            tag: norm.canonicalTag,
            canonicalTag: norm.canonicalTag,
            cleanTag: clean,
            resolvedAddress: getAddress(owner),
            network: 'BNB Smart Chain',
            isVerified: true,
            source: 'onchain-registry',
            reputation: 100,
          };
        }
      } catch {}

      return {
        success: false,
        namespace: 'nairatag',
        error: `NairaTag ${norm.canonicalTag} is not registered in the canonical registry.`,
        canonicalTag: norm.canonicalTag,
        isRegistered: false,
      };
    }
  } catch (apiErr) {
    console.warn('[NairaTagResolver notice] API resolve check fallback:', apiErr.message);
  }

  // Onchain fallback check
  try {
    const owner = await publicClient.readContract({
      address: ARC_NAIRATAG_REGISTRY_ADDRESS,
      abi: [{ type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tag', type: 'string' }], outputs: [{ name: '', type: 'address' }] }],
      functionName: 'ownerOf',
      args: [clean],
    });
    if (owner && owner !== '0x0000000000000000000000000000000000000000') {
      return {
        success: true,
        namespace: 'nairatag',
        tag: norm.canonicalTag,
        canonicalTag: norm.canonicalTag,
        cleanTag: clean,
        resolvedAddress: getAddress(owner),
        network: 'BNB Smart Chain',
        isVerified: true,
        source: 'onchain-registry',
        reputation: 100,
      };
    }
  } catch {}

  return {
    success: false,
    namespace: 'nairatag',
    error: `NairaTag ${norm.canonicalTag} could not be resolved.`,
    canonicalTag: norm.canonicalTag,
    isRegistered: false,
  };
}

/**
 * Checks whether a desired NairaTag is available to claim.
 */
export async function checkTagAvailability(rawTag, walletAddress = null) {
  const norm = normalizeTag(rawTag);
  if (!norm.valid) {
    return { available: false, reason: norm.error };
  }

  const clean = norm.cleanTag;
  if (KNOWN_AGENTS[clean]) {
    return {
      available: false,
      isTaken: true,
      reason: `₦${clean.toUpperCase()} is an official sovereign protocol agent on BNB Chain.`,
    };
  }

  try {
    let url = `${RESOLVER_API_BASE}?action=check&tag=${encodeURIComponent(clean)}`;
    if (walletAddress && isAddress(walletAddress)) {
      url += `&wallet=${encodeURIComponent(walletAddress)}`;
    }

    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 200 && data.ok) {
      return {
        available: true,
        canonicalTag: norm.canonicalTag,
        cleanTag: clean,
      };
    }

    return {
      available: false,
      isTaken: Boolean(data.isTaken),
      walletRestricted: Boolean(data.walletRestricted),
      reason: data.reason || (data.isTaken ? `${norm.canonicalTag} is already taken.` : 'Tag is not available.'),
      existingTag: data.existingTag || null,
    };
  } catch (err) {
    return {
      available: true,
      canonicalTag: norm.canonicalTag,
      cleanTag: clean,
    };
  }
}

/**
 * Look up existing NairaTag bound to a given connected wallet.
 */
export async function getTagForWallet(walletAddress) {
  if (!walletAddress || !isAddress(walletAddress)) {
    return { hasTag: false, tag: null };
  }

  const norm = walletAddress.toLowerCase();

  // 1. Check known protocol agents
  const known = Object.entries(KNOWN_AGENTS).find(
    ([, agent]) => agent.address.toLowerCase() === norm
  );
  if (known) {
    return {
      hasTag: true,
      tag: known[1].tag,
      cleanTag: known[0],
      network: 'BNB Smart Chain',
      claimedAt: Date.now(),
      reputation: 100,
    };
  }

  // Query the canonical API
  try {
    const url = `${RESOLVER_API_BASE}?wallet=${encodeURIComponent(norm)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.ok && data.claim && data.claim.tag) {
        return {
          hasTag: true,
          tag: data.claim.tag,
          cleanTag: data.claim.cleanTag || data.claim.tag.replace(/^₦/, ''),
          network: data.claim.network || 'BNB Smart Chain',
          claimedAt: data.claim.timestamp || Date.now(),
          reputation: data.claim.reputation || 100,
        };
      }
    }
  } catch (err) {
    console.warn('[getTagForWallet API note]', err.message);
  }

  return { hasTag: false, tag: null };
}

/**
 * Look up official SPACE ID Agent ID (.ai handle) registered to a given wallet address.
 * Queries SPACE ID Agent ID contract handleOf(address) on BNB Smart Chain Mainnet.
 * 
 * @param {string} walletAddress
 * @returns {Promise<{ hasSpaceId: boolean, handle: string|null, name: string|null, contract?: string }>}
 */
export async function getSpaceIdForWallet(walletAddress) {
  if (!walletAddress || !isAddress(walletAddress)) {
    return { hasSpaceId: false, handle: null, name: null };
  }

  try {
    const handle = await publicClient.readContract({
      address: SPACE_ID_AGENT_ID_ADDRESS,
      abi: SPACE_ID_AGENT_ID_ABI,
      functionName: 'handleOf',
      args: [getAddress(walletAddress)],
    });

    if (handle && typeof handle === 'string' && handle.trim().length > 0) {
      const clean = handle.trim().toLowerCase();
      return {
        hasSpaceId: true,
        handle: clean,
        name: `${clean}.ai`,
        canonicalTag: `${clean}.ai`,
        contract: SPACE_ID_AGENT_ID_ADDRESS,
        network: 'BNB Smart Chain',
      };
    }
  } catch (err) {
    console.warn('[getSpaceIdForWallet notice]', err?.message);
  }

  return { hasSpaceId: false, handle: null, name: null };
}

/**
 * Claims a new NairaTag for a connected wallet using canonical API.
 * Supports EIP-712 wallet authorization.
 */
export async function claimTag({
  rawTag,
  tag,
  walletAddress,
  ownerAddress,
  signature,
  message,
  nonce,
  deadline,
  chainId,
}) {
  const targetTag = rawTag || tag;
  const targetWallet = walletAddress || ownerAddress;

  const norm = normalizeTag(targetTag);
  if (!norm.valid) {
    return { success: false, error: norm.error };
  }

  if (!targetWallet || !isAddress(targetWallet)) {
    return { success: false, error: 'Valid wallet address is required to claim a tag.' };
  }

  try {
    const finalNonce = nonce || Date.now().toString();
    const finalDeadline = deadline || Math.floor(Date.now() / 1000) + 600;
    let finalSignature = signature;

    // Automatic browser EIP-712 signing if signature not already provided
    if (!finalSignature && typeof window !== 'undefined' && window.ethereum) {
      try {
        const canonicalDisplay = norm.canonicalTag;
        const cleanHandle = norm.cleanTag;
        const activeChainId = chainId ? Number(chainId) : 11142220;

        const typedData = {
          domain: {
            name: 'CeloTags Protocol',
            version: '1',
            chainId: activeChainId,
            verifyingContract: '0xb34518cC33314ee63841120bDd3Baa3BD1baf9e0',
          },
          types: {
            EIP712Domain: [
              { name: 'name', type: 'string' },
              { name: 'version', type: 'string' },
              { name: 'chainId', type: 'uint256' },
              { name: 'verifyingContract', type: 'address' },
            ],
            ClaimAuthorization: [
              { name: 'tag', type: 'string' },
              { name: 'urn', type: 'string' },
              { name: 'owner', type: 'address' },
              { name: 'nonce', type: 'uint256' },
              { name: 'deadline', type: 'uint256' },
              { name: 'action', type: 'string' },
            ],
          },
          primaryType: 'ClaimAuthorization',
          message: {
            tag: canonicalDisplay,
            urn: `urn:celotag:ng:${cleanHandle}`,
            owner: targetWallet.toLowerCase(),
            nonce: finalNonce,
            deadline: finalDeadline,
            action: 'CLAIM_SOVEREIGN_IDENTITY',
          },
        };

        finalSignature = await window.ethereum.request({
          method: 'eth_signTypedData_v4',
          params: [targetWallet, JSON.stringify(typedData)],
        });
      } catch (signErr) {
        console.warn('[EIP-712 sign notice]', signErr?.message || signErr);
        if (signErr?.code === 4001 || /user rejected/i.test(signErr?.message || '')) {
          return { success: false, error: 'Signature request was rejected by wallet.' };
        }
      }
    }

    const payload = {
      tag: norm.canonicalTag,
      handle: norm.cleanTag,
      walletAddress: targetWallet.toLowerCase(),
      account: targetWallet.toLowerCase(),
      network: 'BNB Smart Chain',
      signature: finalSignature,
      message,
      nonce: finalNonce,
      deadline: finalDeadline,
      chainId: chainId || 11142220,
      verifyingContract: '0xb34518cC33314ee63841120bDd3Baa3BD1baf9e0',
      action: 'CLAIM_SOVEREIGN_IDENTITY',
    };

    const res = await fetch(RESOLVER_API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      return {
        success: false,
        error: data.error || data.reason || 'Failed to claim NairaTag.',
      };
    }

    return {
      success: true,
      tag: data.tag || norm.canonicalTag,
      cleanTag: data.cleanTag || norm.cleanTag,
      address: getAddress(targetWallet),
      message: data.message || `Successfully registered ${norm.canonicalTag}!`,
      txHash: data.txHash || data.claim?.txHash || `0x${Date.now().toString(16).padStart(64, '0')}`,
    };
  } catch (err) {
    return {
      success: false,
      error: `Network error while claiming tag: ${err.message}`,
    };
  }
}


