/**
 * ₦METEO Specialist Adapter (Phase 2)
 * ====================================
 * Live Weather Logistics & Hyper-Local Forecasting via Open-Meteo.
 * Replaces hardcoded mock temperatures with live satellite & WMO sensor telemetry.
 *
 * Capabilities:
 * - Dynamic geocoding for any global city/location
 * - Live temperature (°C), humidity (%), precipitation (mm), wind speed (km/h)
 * - WMO weather code translation to human condition description
 * - Logistics transit risk scoring & deliverability safety assessment
 * - In-memory caching per location (300s TTL)
 * - Strict error handling without fake numbers
 */

import {
  SpecialistAdapter,
  SpecialistExecutionResult,
  SpecialistExecutionOptions,
} from "./types.js";

export interface MeteoWeatherData {
  location: string;
  country?: string;
  latitude: number;
  longitude: number;
  temperatureC: number;
  apparentTemperatureC?: number;
  humidityPercent: number;
  precipitationMm: number;
  windSpeedKmh: number;
  weatherCode: number;
  condition: string;
  transitLogisticsRiskIndex: "low" | "medium" | "high" | "severe";
  safeForDelivery: boolean;
  observationTime: string;
  units: {
    temperature: "°C";
    humidity: "%";
    precipitation: "mm";
    windSpeed: "km/h";
  };
}

interface MeteoCacheEntry {
  data: MeteoWeatherData;
  timestamp: number;
}

export class MeteoAdapter implements SpecialistAdapter<MeteoWeatherData> {
  public readonly tag = "₦METEO";
  public readonly canonicalName = "meteo";
  public readonly description = "Live weather telemetry and hyper-local transit logistics risk analysis";

  private cache = new Map<string, MeteoCacheEntry>();
  private readonly ttlMs = 300_000; // 5 minutes
  private readonly defaultTimeoutMs = 8_000;

  /**
   * Interprets WMO Weather Interpretation Codes (WW)
   */
  public decodeWmoCode(code: number): { condition: string; severity: "clear" | "mild" | "rain" | "storm" } {
    switch (code) {
      case 0:
        return { condition: "Clear Sky", severity: "clear" };
      case 1:
        return { condition: "Mainly Clear", severity: "clear" };
      case 2:
        return { condition: "Partly Cloudy", severity: "mild" };
      case 3:
        return { condition: "Overcast", severity: "mild" };
      case 45:
      case 48:
        return { condition: "Foggy", severity: "mild" };
      case 51:
      case 53:
      case 55:
        return { condition: "Light Drizzle", severity: "mild" };
      case 61:
      case 63:
      case 65:
        return { condition: "Rain", severity: "rain" };
      case 71:
      case 73:
      case 75:
        return { condition: "Snow Fall", severity: "rain" };
      case 80:
      case 81:
      case 82:
        return { condition: "Rain Showers", severity: "rain" };
      case 95:
      case 96:
      case 99:
        return { condition: "Thunderstorm", severity: "storm" };
      default:
        return { condition: `Weather Code ${code}`, severity: "mild" };
    }
  }

  /**
   * Evaluates transit risk and deliverability from meteorological telemetry
   */
  public evaluateLogisticsRisk(
    severity: "clear" | "mild" | "rain" | "storm",
    precipMm: number,
    windKmh: number,
    tempC: number
  ): { risk: "low" | "medium" | "high" | "severe"; safeForDelivery: boolean } {
    if (severity === "storm" || windKmh > 65 || precipMm > 30) {
      return { risk: "severe", safeForDelivery: false };
    }
    if (severity === "rain" || windKmh > 40 || precipMm > 10 || tempC > 42 || tempC < -15) {
      return { risk: "high", safeForDelivery: false };
    }
    if (severity === "mild" || windKmh > 25 || precipMm > 2) {
      return { risk: "medium", safeForDelivery: true };
    }
    return { risk: "low", safeForDelivery: true };
  }

  public async execute(
    payload: Record<string, unknown>,
    opts?: SpecialistExecutionOptions
  ): Promise<SpecialistExecutionResult<MeteoWeatherData>> {
    const startTime = Date.now();
    const rawLocation =
      (payload.location as string) || (payload.city as string) || (payload.query as string) || "Lagos";
    const cleanLocation = rawLocation.trim().toLowerCase();

    // 1. Check Cache
    const cached = this.cache.get(cleanLocation);
    if (!opts?.skipCache && cached) {
      const ageMs = Date.now() - cached.timestamp;
      if (ageMs < this.ttlMs) {
        return {
          success: true,
          specialistTag: this.tag,
          capabilityId: "weather_logistics",
          metadata: {
            classification: "CACHED",
            source: "Open-Meteo Weather API (Cached)",
            retrievedAt: new Date(cached.timestamp).toISOString(),
            latencyMs: Date.now() - startTime,
            isStale: false,
            ttlSeconds: Math.round((this.ttlMs - ageMs) / 1000),
          },
          data: cached.data,
        };
      }
    }

    // 2. Geocode Location to Coordinates
    const timeoutMs = opts?.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        rawLocation
      )}&count=1&language=en&format=json`;

      const geoRes = await fetch(geoUrl, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!geoRes.ok) {
        clearTimeout(timeoutId);
        return {
          success: false,
          specialistTag: this.tag,
          capabilityId: "weather_logistics",
          metadata: {
            classification: "LIVE",
            source: geoUrl,
            retrievedAt: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: "GEOCODING_API_ERROR",
            message: `Open-Meteo Geocoding API returned HTTP ${geoRes.status}`,
            httpStatus: geoRes.status,
            retryable: geoRes.status >= 500,
          },
        };
      }

      const geoJson = (await geoRes.json()) as {
        results?: Array<{ name: string; country?: string; latitude: number; longitude: number }>;
      };

      if (!geoJson.results || geoJson.results.length === 0) {
        clearTimeout(timeoutId);
        return {
          success: false,
          specialistTag: this.tag,
          capabilityId: "weather_logistics",
          metadata: {
            classification: "LIVE",
            source: geoUrl,
            retrievedAt: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: "LOCATION_NOT_FOUND",
            message: `Location "${rawLocation}" could not be resolved to geographical coordinates.`,
            retryable: false,
          },
        };
      }

      const match = geoJson.results[0];
      const { latitude, longitude, name, country } = match;

      // 3. Query Open-Meteo Forecast
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;

      const weatherRes = await fetch(weatherUrl, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timeoutId);

      if (!weatherRes.ok) {
        return {
          success: false,
          specialistTag: this.tag,
          capabilityId: "weather_logistics",
          metadata: {
            classification: "LIVE",
            source: weatherUrl,
            retrievedAt: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: "WEATHER_API_ERROR",
            message: `Open-Meteo Weather API returned HTTP ${weatherRes.status}`,
            httpStatus: weatherRes.status,
            retryable: weatherRes.status >= 500,
          },
        };
      }

      const weatherJson = (await weatherRes.json()) as {
        current?: {
          time: string;
          temperature_2m: number;
          apparent_temperature?: number;
          relative_humidity_2m: number;
          precipitation: number;
          weather_code: number;
          wind_speed_10m: number;
        };
      };

      const cur = weatherJson.current;
      if (!cur) {
        return {
          success: false,
          specialistTag: this.tag,
          capabilityId: "weather_logistics",
          metadata: {
            classification: "LIVE",
            source: weatherUrl,
            retrievedAt: new Date().toISOString(),
            latencyMs: Date.now() - startTime,
          },
          error: {
            code: "EMPTY_WEATHER_DATA",
            message: "Weather telemetry returned empty current conditions block.",
          },
        };
      }

      const decoded = this.decodeWmoCode(cur.weather_code);
      const logistics = this.evaluateLogisticsRisk(
        decoded.severity,
        cur.precipitation ?? 0,
        cur.wind_speed_10m ?? 0,
        cur.temperature_2m ?? 20
      );

      const data: MeteoWeatherData = {
        location: name,
        country,
        latitude,
        longitude,
        temperatureC: cur.temperature_2m,
        apparentTemperatureC: cur.apparent_temperature,
        humidityPercent: cur.relative_humidity_2m,
        precipitationMm: cur.precipitation,
        windSpeedKmh: cur.wind_speed_10m,
        weatherCode: cur.weather_code,
        condition: decoded.condition,
        transitLogisticsRiskIndex: logistics.risk,
        safeForDelivery: logistics.safeForDelivery,
        observationTime: cur.time,
        units: {
          temperature: "°C",
          humidity: "%",
          precipitation: "mm",
          windSpeed: "km/h",
        },
      };

      this.cache.set(cleanLocation, { data, timestamp: Date.now() });

      return {
        success: true,
        specialistTag: this.tag,
        capabilityId: "weather_logistics",
        metadata: {
          classification: "LIVE",
          source: weatherUrl,
          retrievedAt: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
          isStale: false,
        },
        data,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAbort = err.name === "AbortError";
      return {
        success: false,
        specialistTag: this.tag,
        capabilityId: "weather_logistics",
        metadata: {
          classification: "LIVE",
          source: "https://api.open-meteo.com",
          retrievedAt: new Date().toISOString(),
          latencyMs: Date.now() - startTime,
        },
        error: {
          code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
          message: isAbort
            ? `Weather service request timed out after ${timeoutMs}ms`
            : `Network error reaching weather service: ${err.message}`,
          retryable: true,
          details: err,
        },
      };
    }
  }
}
