/**
 * ₦COINGECKO Specialist Adapter (Phase 2)
 * =======================================
 * Live Token Prices & Market Oracle via CoinGecko Public API (v3).
 * Replaces hardcoded mock prices ($645.20) with real-time oracle quotes.
 *
 * Capabilities:
 * - Real-time spot prices (USD), 24h change, market cap, and oracle timestamp
 * - Symbol to CoinGecko ID mapping (BNB, BTC, ETH, CAKE, USDC, USDT, etc.)
 * - Bounded caching (60s TTL)
 * - Rate limit (HTTP 429) detection & graceful fallback to cached/stale data
 * - Strict separation of LIVE spot price vs CACHED / STALE data
 */

import {
  SpecialistAdapter,
  SpecialistExecutionResult,
  SpecialistExecutionOptions,
} from "./types.js";

export interface CoinGeckoPriceData {
  symbol: string;
  coingeckoId: string;
  priceUsd: number;
  change24hPercent: number;
  marketCapUsd: number;
  oracleTimestamp: string;
  isStale: boolean;
  priceType: "SPOT" | "HISTORICAL" | "CACHED";
}

interface PriceCacheEntry {
  data: CoinGeckoPriceData;
  timestamp: number;
}

export class CoinGeckoAdapter implements SpecialistAdapter<CoinGeckoPriceData> {
  public readonly tag = "₦COINGECKO";
  public readonly canonicalName = "coingecko";
  public readonly description = "Live DEX/CEX crypto asset prices and market metrics via CoinGecko";

  private cache = new Map<string, PriceCacheEntry>();
  private readonly ttlMs = 60_000; // 60 seconds
  private readonly defaultTimeoutMs = 8_000;

  private readonly symbolMap: Record<string, string> = {
    bnb: "binancecoin",
    binancecoin: "binancecoin",
    wbnb: "binancecoin",
    btc: "bitcoin",
    bitcoin: "bitcoin",
    wbtc: "wrapped-bitcoin",
    eth: "ethereum",
    ethereum: "ethereum",
    weth: "weth",
    cake: "pancakeswap-token",
    pancakeswap: "pancakeswap-token",
    usdc: "usd-coin",
    "usd-coin": "usd-coin",
    usdt: "tether",
    tether: "tether",
    fdusd: "first-digital-usd",
    sol: "solana",
    xrp: "ripple",
    doge: "dogecoin",
  };

  /**
   * Resolves token symbol to CoinGecko asset ID
   */
  public resolveAssetId(rawSymbol?: string): { symbol: string; id: string } {
    if (!rawSymbol || typeof rawSymbol !== "string") {
      return { symbol: "BNB", id: "binancecoin" };
    }
    const clean = rawSymbol.trim().toUpperCase().replace(/[$₦]/g, "");
    const lower = clean.toLowerCase();
    const id = this.symbolMap[lower] || lower;
    return { symbol: clean, id };
  }

  public async execute(
    payload: Record<string, unknown>,
    opts?: SpecialistExecutionOptions
  ): Promise<SpecialistExecutionResult<CoinGeckoPriceData>> {
    const startTime = Date.now();
    const rawToken = (payload.token as string) || (payload.symbol as string) || (payload.query as string) || "BNB";
    const { symbol, id } = this.resolveAssetId(rawToken);

    // 1. Check Cache
    const cached = this.cache.get(id);
    if (!opts?.skipCache && cached) {
      const ageMs = Date.now() - cached.timestamp;
      if (ageMs < this.ttlMs) {
        return {
          success: true,
          specialistTag: this.tag,
          capabilityId: "market_pricing",
          metadata: {
            classification: "CACHED",
            source: "CoinGecko Public API (Cached)",
            retrievedAt: new Date(cached.timestamp).toISOString(),
            latencyMs: Date.now() - startTime,
            isStale: false,
            ttlSeconds: Math.round((this.ttlMs - ageMs) / 1000),
          },
          data: {
            ...cached.data,
            priceType: "CACHED",
            isStale: false,
          },
        };
      }
    }

    // 2. Fetch Live Price
    const timeoutMs = opts?.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
      id
    )}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_last_updated_at=true`;

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeoutId);

      // Handle Rate Limit (HTTP 429)
      if (res.status === 429) {
        if (cached) {
          return {
            success: true,
            specialistTag: this.tag,
            capabilityId: "market_pricing",
            metadata: {
              classification: "CACHED",
              source: "CoinGecko Public API (Stale - Rate Limited)",
              retrievedAt: new Date(cached.timestamp).toISOString(),
              latencyMs: Date.now() - startTime,
              isStale: true,
            },
            data: {
              ...cached.data,
              priceType: "CACHED",
              isStale: true,
            },
          };
        }

        return {
          success: false,
          specialistTag: this.tag,
          capabilityId: "market_pricing",
          metadata: {
            classification: "LIVE",
            source: url,
            retrievedAt: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: "RATE_LIMITED",
            message: "CoinGecko public API rate limit reached (HTTP 429). Please retry shortly.",
            httpStatus: 429,
            retryable: true,
          },
        };
      }

      if (!res.ok) {
        return {
          success: false,
          specialistTag: this.tag,
          capabilityId: "market_pricing",
          metadata: {
            classification: "LIVE",
            source: url,
            retrievedAt: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: "COINGECKO_API_ERROR",
            message: `CoinGecko API returned HTTP ${res.status}: ${res.statusText}`,
            httpStatus: res.status,
            retryable: res.status >= 500,
          },
        };
      }

      const json = (await res.json()) as Record<
        string,
        {
          usd?: number;
          usd_market_cap?: number;
          usd_24h_change?: number;
          last_updated_at?: number;
        }
      >;

      const tokenData = json[id];
      if (!tokenData || typeof tokenData.usd !== "number") {
        return {
          success: false,
          specialistTag: this.tag,
          capabilityId: "market_pricing",
          metadata: {
            classification: "LIVE",
            source: url,
            retrievedAt: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: "ASSET_NOT_FOUND",
            message: `Asset "${rawToken}" (CoinGecko ID: "${id}") not found or has no active USD pricing.`,
            retryable: false,
          },
        };
      }

      const oracleTimestamp = tokenData.last_updated_at
        ? new Date(tokenData.last_updated_at * 1000).toISOString()
        : new Date().toISOString();

      const data: CoinGeckoPriceData = {
        symbol,
        coingeckoId: id,
        priceUsd: tokenData.usd,
        change24hPercent: tokenData.usd_24h_change ?? 0,
        marketCapUsd: tokenData.usd_market_cap ?? 0,
        oracleTimestamp,
        isStale: false,
        priceType: "SPOT",
      };

      this.cache.set(id, { data, timestamp: Date.now() });

      return {
        success: true,
        specialistTag: this.tag,
        capabilityId: "market_pricing",
        metadata: {
          classification: "LIVE",
          source: url,
          retrievedAt: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
          isStale: false,
        },
        data,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAbort = err.name === "AbortError";

      // If network fails but we have stale cache, return it with warning
      if (cached) {
        return {
          success: true,
          specialistTag: this.tag,
          capabilityId: "market_pricing",
          metadata: {
            classification: "CACHED",
            source: "CoinGecko (Fallback from Stale Cache)",
            retrievedAt: new Date(cached.timestamp).toISOString(),
            latencyMs: Date.now() - startTime,
            isStale: true,
          },
          data: {
            ...cached.data,
            priceType: "CACHED",
            isStale: true,
          },
        };
      }

      return {
        success: false,
        specialistTag: this.tag,
        capabilityId: "market_pricing",
        metadata: {
          classification: "LIVE",
          source: url,
          retrievedAt: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
        error: {
          code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
          message: isAbort
            ? `CoinGecko request timed out after ${timeoutMs}ms`
            : `Network error reaching CoinGecko: ${err.message}`,
          retryable: true,
          details: err,
        },
      };
    }
  }
}
