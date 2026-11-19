/**
 * Binance Skills Hub: Market Data Skills
 * =====================================
 * Live Binance public market data integrations with caching,
 * resilient timeouts, and test seam support.
 *
 * All market skills are READ-ONLY and require NO user financial consent.
 */

import { z } from "zod";
import { SkillDefinition, SkillExecutionContext, SkillExecutionResult } from "./types.js";

// ==========================================
// 1. Binance 24hr Ticker Skill
// ==========================================

export interface BinanceTickerData {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
  openTime: number;
  closeTime: number;
}

export const BinanceTickerInputSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .describe("Trading pair symbol on Binance (e.g., 'BNBUSDT', 'BTCUSDT', 'ETHUSDT')"),
});

export type BinanceTickerInput = z.infer<typeof BinanceTickerInputSchema>;

// In-memory TTL cache for tickers (15 seconds)
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const tickerCache = new Map<string, CacheEntry<BinanceTickerData>>();
const TICKER_TTL_MS = 15_000;

export const binanceTickerSkill: SkillDefinition<BinanceTickerInput, BinanceTickerData> = {
  id: "binance.market.ticker",
  name: "Binance 24hr Price Ticker",
  description:
    "Fetches real-time spot price, 24-hour price change, high/low range, and trading volume for any asset pair from Binance public market data.",
  category: "market",
  accessLevel: "read_only",
  requiresUserConsent: false,
  inputSchema: BinanceTickerInputSchema,

  handler: async (
    params: BinanceTickerInput,
    context: SkillExecutionContext
  ): Promise<SkillExecutionResult<BinanceTickerData>> => {
    const startTime = Date.now();
    let symbol = params.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!symbol.includes("USDT") && !symbol.includes("BUSD") && !symbol.includes("BTC") && !symbol.includes("BNB")) {
      symbol = `${symbol}USDT`;
    }

    // Check cache
    const cached = tickerCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < TICKER_TTL_MS && !context.testSeam?.disableCache) {
      return {
        success: true,
        skillId: "binance.market.ticker",
        data: cached.data,
        classification: "CACHED",
        metadata: {
          source: "Binance Public REST API (In-Memory Cache)",
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
          cached: true,
        },
      };
    }

    // Check test seam for testing
    if (context.testSeam?.tickerResponse) {
      const data = context.testSeam.tickerResponse;
      return {
        success: true,
        skillId: "binance.market.ticker",
        data,
        classification: "SIMULATED",
        metadata: {
          source: "Binance Test Seam",
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const latencyMs = Date.now() - startTime;
        if (res.status === 400 || res.status === 404) {
          return {
            success: false,
            skillId: "binance.market.ticker",
            classification: "LIVE",
            metadata: {
              source: "Binance Public REST API",
              timestamp: new Date().toISOString(),
              latencyMs,
            },
            error: {
              code: "SYMBOL_NOT_FOUND",
              message: `Symbol '${symbol}' not found on Binance. Please verify the trading pair.`,
            },
          };
        }
        return {
          success: false,
          skillId: "binance.market.ticker",
          classification: "LIVE",
          metadata: {
            source: "Binance Public REST API",
            timestamp: new Date().toISOString(),
            latencyMs,
          },
          error: {
            code: "BINANCE_API_ERROR",
            message: `Binance API error (HTTP ${res.status}): ${res.statusText}`,
          },
        };
      }

      const json = (await res.json()) as any;
      const data: BinanceTickerData = {
        symbol: json.symbol,
        price: json.lastPrice,
        priceChange: json.priceChange,
        priceChangePercent: `${json.priceChangePercent}%`,
        highPrice: json.highPrice,
        lowPrice: json.lowPrice,
        volume: json.volume,
        quoteVolume: json.quoteVolume,
        openTime: json.openTime,
        closeTime: json.closeTime,
      };

      tickerCache.set(symbol, { data, timestamp: Date.now() });

      return {
        success: true,
        skillId: "binance.market.ticker",
        data,
        classification: "LIVE",
        metadata: {
          source: "Binance Public REST API",
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        skillId: "binance.market.ticker",
        classification: "LIVE",
        metadata: {
          source: "Binance Public REST API",
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
        error: {
          code: "NETWORK_ERROR",
          message: `Failed to connect to Binance API: ${err.message || String(err)}`,
        },
      };
    }
  },
};

// ==========================================
// 2. Binance Orderbook Depth Skill
// ==========================================

export interface BinanceOrderbookDepthData {
  symbol: string;
  bestBid: string;
  bestAsk: string;
  spread: string;
  spreadPercentage: string;
  bidDepthTotal: string;
  askDepthTotal: string;
  bids: [string, string][];
  asks: [string, string][];
}

export const BinanceDepthInputSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .describe("Trading pair symbol on Binance (e.g., 'BNBUSDT')"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .optional()
    .describe("Number of bid/ask levels to retrieve (default: 10)"),
});

export type BinanceDepthInput = z.infer<typeof BinanceDepthInputSchema>;

export const binanceDepthSkill: SkillDefinition<BinanceDepthInput, BinanceOrderbookDepthData> = {
  id: "binance.market.depth",
  name: "Binance Orderbook Depth & Liquidity",
  description:
    "Analyzes orderbook liquidity, bid/ask spread, and top order depth levels on Binance spot markets.",
  category: "market",
  accessLevel: "read_only",
  requiresUserConsent: false,
  inputSchema: BinanceDepthInputSchema,

  handler: async (
    params: BinanceDepthInput,
    context: SkillExecutionContext
  ): Promise<SkillExecutionResult<BinanceOrderbookDepthData>> => {
    const startTime = Date.now();
    let symbol = params.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!symbol.includes("USDT") && !symbol.includes("BUSD") && !symbol.includes("BTC") && !symbol.includes("BNB")) {
      symbol = `${symbol}USDT`;
    }
    const limit = params.limit ?? 10;

    if (context.testSeam?.depthResponse) {
      return {
        success: true,
        skillId: "binance.market.depth",
        data: context.testSeam.depthResponse,
        classification: "SIMULATED",
        metadata: {
          source: "Binance Test Seam",
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(
        `https://api.binance.com/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`,
        {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        }
      );
      clearTimeout(timeoutId);

      if (!res.ok) {
        return {
          success: false,
          skillId: "binance.market.depth",
          classification: "LIVE",
          metadata: {
            source: "Binance Public REST API",
            timestamp: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: "DEPTH_FETCH_FAILED",
            message: `Failed to fetch orderbook for '${symbol}' (HTTP ${res.status}).`,
          },
        };
      }

      const json = (await res.json()) as any;
      const bids: [string, string][] = json.bids || [];
      const asks: [string, string][] = json.asks || [];

      const bestBid = bids.length > 0 ? bids[0][0] : "0";
      const bestAsk = asks.length > 0 ? asks[0][0] : "0";

      const bestBidNum = parseFloat(bestBid);
      const bestAskNum = parseFloat(bestAsk);
      const spreadNum = bestAskNum > 0 && bestBidNum > 0 ? bestAskNum - bestBidNum : 0;
      const spreadPct = bestAskNum > 0 ? ((spreadNum / bestAskNum) * 100).toFixed(4) : "0";

      let bidTotal = 0;
      for (const b of bids) bidTotal += parseFloat(b[1]);

      let askTotal = 0;
      for (const a of asks) askTotal += parseFloat(a[1]);

      const data: BinanceOrderbookDepthData = {
        symbol,
        bestBid,
        bestAsk,
        spread: spreadNum.toFixed(4),
        spreadPercentage: `${spreadPct}%`,
        bidDepthTotal: bidTotal.toFixed(4),
        askDepthTotal: askTotal.toFixed(4),
        bids,
        asks,
      };

      return {
        success: true,
        skillId: "binance.market.depth",
        data,
        classification: "LIVE",
        metadata: {
          source: "Binance Public REST API",
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        skillId: "binance.market.depth",
        classification: "LIVE",
        metadata: {
          source: "Binance Public REST API",
          timestamp: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
        error: {
          code: "NETWORK_ERROR",
          message: `Network error querying Binance depth: ${err.message || String(err)}`,
        },
      };
    }
  },
};
