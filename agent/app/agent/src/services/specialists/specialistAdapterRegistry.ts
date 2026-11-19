/**
 * Specialist Adapter Registry (Phase 2)
 * =====================================
 * Provider-neutral router for specialist agents.
 * Connects ₦BLOOM, ₦DEFILLAMA, ₦METEO, and ₦COINGECKO behind a unified execution seam.
 */

import { SpecialistAdapter, SpecialistExecutionResult, SpecialistExecutionOptions } from "./types.js";
import { DefiLlamaAdapter } from "./defillamaAdapter.js";
import { CoinGeckoAdapter } from "./coingeckoAdapter.js";
import { MeteoAdapter } from "./meteoAdapter.js";
import { BloomAdapter } from "./bloomAdapter.js";

export class SpecialistAdapterRegistry {
  private static instance: SpecialistAdapterRegistry | null = null;
  private adapters = new Map<string, SpecialistAdapter<any>>();

  private constructor() {
    this.register(new DefiLlamaAdapter());
    this.register(new CoinGeckoAdapter());
    this.register(new MeteoAdapter());
    this.register(new BloomAdapter());
  }

  public static getInstance(): SpecialistAdapterRegistry {
    if (!SpecialistAdapterRegistry.instance) {
      SpecialistAdapterRegistry.instance = new SpecialistAdapterRegistry();
    }
    return SpecialistAdapterRegistry.instance;
  }

  public register(adapter: SpecialistAdapter<any>): void {
    const norm = adapter.canonicalName.toLowerCase();
    this.adapters.set(norm, adapter);
    this.adapters.set(adapter.tag.toLowerCase(), adapter);
  }

  public getAdapter(tagOrName: string): SpecialistAdapter<any> | undefined {
    const clean = tagOrName.trim().toLowerCase().replace(/^₦/, "");
    return this.adapters.get(clean) || this.adapters.get(tagOrName.toLowerCase());
  }

  public hasAdapter(tagOrName: string): boolean {
    return this.getAdapter(tagOrName) !== undefined;
  }

  public async executeSpecialist(
    tagOrName: string,
    payload: Record<string, unknown>,
    opts?: SpecialistExecutionOptions
  ): Promise<SpecialistExecutionResult<any>> {
    const adapter = this.getAdapter(tagOrName);
    if (!adapter) {
      return {
        success: false,
        specialistTag: tagOrName,
        capabilityId: "unknown",
        metadata: {
          classification: "SIMULATED",
          source: "SpecialistAdapterRegistry",
          retrievedAt: new Date().toISOString(),
          latencyMs: 0,
        },
        error: {
          code: "ADAPTER_NOT_FOUND",
          message: `No specialist adapter registered for tag "${tagOrName}".`,
          retryable: false,
        },
      };
    }

    return adapter.execute(payload, opts);
  }
}
