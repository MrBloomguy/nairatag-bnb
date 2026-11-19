/**
 * ₦DEFILLAMA Specialist Adapter (Phase 2)
 * =======================================
 * Live DeFi Metrics & Protocol TVL Integration via DeFiLlama API.
 * Replaces hardcoded mock JSON with live API telemetry.
 *
 * Capabilities:
 * - Real protocol TVL, chain breakdowns, and volume metrics
 * - Chain-level TVL (e.g. BSC chain TVL)
 * - In-memory TTL caching (60s)
 * - Strict error handling without synthetic fallback data
 */

import {
  SpecialistAdapter,
  SpecialistExecutionResult,
  SpecialistExecutionOptions,
} from "./types.js";

export interface DefiLlamaData {
  protocol: string;
  name: string;
  category?: string;
  chains: string[];
  totalTvlUsd: number;
  chainTvlUsd?: number;
  chain: string;
  targetChain: string;
  sourceUrl: string;
  change1dPercent?: number;
  change7dPercent?: number;
}

interface CacheEntry {
  data: DefiLlamaData;
  timestamp: number;
}

export class DefiLlamaAdapter implements SpecialistAdapter<DefiLlamaData> {
  public readonly tag = "₦DEFILLAMA";
  public readonly canonicalName = "defillama";
  public readonly description = "Live DeFi TVL, volume, and chain metrics via DeFiLlama";

  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 60_000; // 60 seconds
  private readonly defaultTimeoutMs = 15_000;

  private readonly protocolAliases: Record<string, string> = {
    pancake: "pancakeswap",
    pancakeswap: "pancakeswap",
    cake: "pancakeswap",
    venus: "venus",
    "venus-protocol": "venus",
    xvs: "venus",
    biswap: "biswap",
    alpaca: "alpaca-finance",
    "alpaca-finance": "alpaca-finance",
    uniswap: "uniswap-v3",
    aave: "aave",
    curve: "curve-dex",
  };

  /**
   * Normalizes requested protocol input to DeFiLlama slug
   */
  public normalizeProtocolSlug(input?: string): string {
    if (!input || typeof input !== "string") {
      return "pancakeswap";
    }
    const clean = input.trim().toLowerCase().replace(/[@₦]/g, "");
    return this.protocolAliases[clean] || clean.replace(/\s+/g, "-");
  }

  public async execute(
    payload: Record<string, unknown>,
    opts?: SpecialistExecutionOptions
  ): Promise<SpecialistExecutionResult<DefiLlamaData>> {
    const startTime = Date.now();
    const rawProtocol = (payload.protocol as string) || (payload.query as string) || "pancakeswap";
    const targetChain = ((payload.chain as string) || "bsc").toLowerCase();
    const slug = this.normalizeProtocolSlug(rawProtocol);

    const cacheKey = `${slug}:${targetChain}`;

    // 1. Check TTL Cache
    if (!opts?.skipCache && this.cache.has(cacheKey)) {
      const entry = this.cache.get(cacheKey)!;
      if (Date.now() - entry.timestamp < this.ttlMs) {
        return {
          success: true,
          specialistTag: this.tag,
          capabilityId: "defi_metrics",
          metadata: {
            classification: "CACHED",
            source: "DeFiLlama Public API (Cached)",
            retrievedAt: new Date(entry.timestamp).toISOString(),
            latencyMs: Date.now() - startTime,
            isStale: false,
            ttlSeconds: Math.round((this.ttlMs - (Date.now() - entry.timestamp)) / 1000),
          },
          data: entry.data,
        };
      }
    }

    // 2. Fetch Live Telemetry
    const timeoutMs = opts?.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Chain-only query check (e.g. if requested protocol is 'bsc')
      if (slug === "bsc" || slug === "binance") {
        const res = await fetch("https://api.llama.fi/v2/chains", {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          return {
            success: false,
            specialistTag: this.tag,
            capabilityId: "defi_metrics",
            metadata: {
              classification: "LIVE",
              source: "https://api.llama.fi",
              retrievedAt: new Date().toISOString(),
              latencyMs: Date.now() - startTime,
            },
            error: {
              code: "DEFILLAMA_API_ERROR",
              message: `DeFiLlama chains API returned HTTP ${res.status}`,
              httpStatus: res.status,
              retryable: res.status >= 500,
            },
          };
        }

        const chainsData = (await res.json()) as Array<{ name: string; tvl: number }>;
        const bscEntry = chainsData.find(
          (c) => c.name.toLowerCase() === "bsc" || c.name.toLowerCase() === "binance"
        );

        if (!bscEntry) {
          return {
            success: false,
            specialistTag: this.tag,
            capabilityId: "defi_metrics",
            metadata: {
              classification: "LIVE",
              source: "https://api.llama.fi",
              retrievedAt: new Date().toISOString(),
              latencyMs: Date.now() - startTime,
            },
            error: {
              code: "CHAIN_NOT_FOUND",
              message: "BNB Smart Chain (BSC) TVL data not found in DeFiLlama response",
            },
          };
        }

        const data: DefiLlamaData = {
          protocol: "bsc",
          name: "BNB Smart Chain (BSC)",
          category: "Chain / L1",
          chains: ["BSC"],
          totalTvlUsd: bscEntry.tvl,
          chainTvlUsd: bscEntry.tvl,
          chain: "bsc",
          targetChain: "bsc",
          sourceUrl: "https://defillama.com/chain/BSC",
        };

        this.cache.set(cacheKey, { data, timestamp: Date.now() });

        return {
          success: true,
          specialistTag: this.tag,
          capabilityId: "defi_metrics",
          metadata: {
            classification: "LIVE",
            source: "https://api.llama.fi/v2/chains",
            retrievedAt: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          data,
        };
      }

      // Standard Protocol Query
      const endpoint = `https://api.llama.fi/protocol/${slug}`;
      const res = await fetch(endpoint, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeoutId);

      if (res.status === 400 || res.status === 404) {
        return {
          success: false,
          specialistTag: this.tag,
          capabilityId: "defi_metrics",
          metadata: {
            classification: "LIVE",
            source: endpoint,
            retrievedAt: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: "PROTOCOL_NOT_FOUND",
            message: `Protocol "${rawProtocol}" (slug: "${slug}") not found on DeFiLlama. Please verify protocol name.`,
            httpStatus: res.status,
            retryable: false,
          },
        };
      }

      if (!res.ok) {
        return {
          success: false,
          specialistTag: this.tag,
          capabilityId: "defi_metrics",
          metadata: {
            classification: "LIVE",
            source: endpoint,
            retrievedAt: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: "DEFILLAMA_API_ERROR",
            message: `DeFiLlama API error: HTTP ${res.status} ${res.statusText}`,
            httpStatus: res.status,
            retryable: res.status >= 500,
          },
        };
      }

      const body = (await res.json()) as any;

      // Extract TVL numbers safely
      let totalTvl = 0;
      if (Array.isArray(body.tvl) && body.tvl.length > 0) {
        totalTvl = body.tvl[body.tvl.length - 1]?.totalLiquidityUSD ?? 0;
      }

      let chainTvl: number | undefined;
      const bscKey = Object.keys(body.chainTvls || {}).find(
        (k) => k.toLowerCase() === targetChain || (targetChain === "bsc" && k.toLowerCase() === "binance")
      );
      if (bscKey && body.chainTvls[bscKey]?.tvl?.length > 0) {
        const lastEntry = body.chainTvls[bscKey].tvl[body.chainTvls[bscKey].tvl.length - 1];
        chainTvl = lastEntry?.totalLiquidityUSD;
      }

      const data: DefiLlamaData = {
        protocol: slug,
        name: body.name || slug,
        category: body.category,
        chains: body.chains || [],
        totalTvlUsd: totalTvl,
        chainTvlUsd: chainTvl,
        chain: targetChain,
        targetChain,
        sourceUrl: `https://defillama.com/protocol/${slug}`,
        change1dPercent: body.change_1d,
        change7dPercent: body.change_7d,
      };

      // Populate Cache
      this.cache.set(cacheKey, { data, timestamp: Date.now() });

      return {
        success: true,
        specialistTag: this.tag,
        capabilityId: "defi_metrics",
        metadata: {
          classification: "LIVE",
          source: endpoint,
          retrievedAt: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
        data,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAbort = err.name === "AbortError";
      return {
        success: false,
        specialistTag: this.tag,
        capabilityId: "defi_metrics",
        metadata: {
          classification: "LIVE",
          source: "https://api.llama.fi",
          retrievedAt: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
        error: {
          code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
          message: isAbort
            ? `DeFiLlama request timed out after ${timeoutMs}ms`
            : `Network error reaching DeFiLlama: ${err.message}`,
          retryable: true,
          details: err,
        },
      };
    }
  }
}
