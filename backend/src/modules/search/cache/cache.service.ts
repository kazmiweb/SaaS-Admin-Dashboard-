import type { ApiConfig } from "@prisma/client";
import { redis } from "../../../shared/redis.js";
import { logInfo, logWarn } from "../../../shared/observability/logger.js";
import type {
  OrchestratedSearchResult,
  SearchDetectedType,
  SearchSourceDiagnostic,
  SearchSourceResult,
} from "../types/search.types.js";

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, seconds: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
};

type CacheMetrics = {
  orchestratedHits: number;
  orchestratedMisses: number;
  sourceHits: number;
  sourceMisses: number;
};

type ThrottleInfo = {
  count: number;
  threshold: number;
  throttled: boolean;
};

const metrics: CacheMetrics = {
  orchestratedHits: 0,
  orchestratedMisses: 0,
  sourceHits: 0,
  sourceMisses: 0,
};

function sanitizeKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "_");
}

function cloneCachedPayload(payload: OrchestratedSearchResult): OrchestratedSearchResult {
  return {
    ...payload,
    cached: true,
    results: payload.results.map((result) => ({ ...result, cached: true })),
    sourceDiagnostics: payload.sourceDiagnostics.map((diagnostic: SearchSourceDiagnostic) => ({
      ...diagnostic,
      cached: diagnostic.status === "success" ? true : diagnostic.cached,
    })),
  };
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export class CacheService {
  constructor(private readonly client: RedisLike = redis) {}

  getMetrics(): CacheMetrics {
    return { ...metrics };
  }

  getQueryTypeTtlSeconds(queryType: SearchDetectedType): number {
    const envKey = `SEARCH_CACHE_TTL_${queryType}_SEC`;
    const specific = Number(process.env[envKey] ?? "");
    if (Number.isFinite(specific) && specific > 0) return specific;
    return Math.max(0, Number(process.env.SEARCH_CACHE_TTL_SEC ?? 180));
  }

  getSourceTtlSeconds(_api: ApiConfig, queryType: SearchDetectedType): number {
    return this.getQueryTypeTtlSeconds(queryType);
  }

  buildOrchestratedCacheKey(params: {
    serviceId: string;
    detectedType: SearchDetectedType;
    normalizedQuery: string;
    sources: string[];
  }): string {
    return [
      "search",
      "orchestrated",
      sanitizeKeyPart(params.serviceId),
      sanitizeKeyPart(params.detectedType),
      sanitizeKeyPart(params.normalizedQuery),
      sanitizeKeyPart(params.sources.slice().sort().join(",")) || "all",
    ].join(":");
  }

  buildSourceCacheKey(params: {
    apiId: string;
    detectedType: SearchDetectedType;
    normalizedQuery: string;
  }): string {
    return [
      "search",
      "source",
      sanitizeKeyPart(params.apiId),
      sanitizeKeyPart(params.detectedType),
      sanitizeKeyPart(params.normalizedQuery),
    ].join(":");
  }

  shouldCache(params: {
    normalizedQuery: string;
    detectedType: SearchDetectedType;
    successCount: number;
  }): boolean {
    if (!params.normalizedQuery.trim()) return false;
    if (params.detectedType === "GENERAL" && params.normalizedQuery.trim().length < 3) return false;
    return params.successCount > 0;
  }

  async getOrchestratedSearch(key: string): Promise<OrchestratedSearchResult | null> {
    try {
      const payload = parseJson<OrchestratedSearchResult>(await this.client.get(key));
      if (payload) {
        metrics.orchestratedHits += 1;
        logInfo({ scope: "search.cache", event: "orchestrated-hit", key });
        return cloneCachedPayload(payload);
      }
      metrics.orchestratedMisses += 1;
      logInfo({ scope: "search.cache", event: "orchestrated-miss", key });
      return null;
    } catch (error) {
      logWarn({ scope: "search.cache", event: "orchestrated-read-failed", key, error });
      return null;
    }
  }

  async setOrchestratedSearch(key: string, payload: OrchestratedSearchResult, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    try {
      await this.client.set(key, JSON.stringify(payload), "EX", ttlSeconds);
      logInfo({ scope: "search.cache", event: "orchestrated-store", key, ttlSeconds });
    } catch (error) {
      logWarn({ scope: "search.cache", event: "orchestrated-write-failed", key, ttlSeconds, error });
    }
  }

  async getSourceResult(key: string): Promise<SearchSourceResult | null> {
    try {
      const payload = parseJson<SearchSourceResult>(await this.client.get(key));
      if (payload) {
        metrics.sourceHits += 1;
        logInfo({ scope: "search.cache", event: "source-hit", key });
        return { ...payload, cached: true };
      }
      metrics.sourceMisses += 1;
      logInfo({ scope: "search.cache", event: "source-miss", key });
      return null;
    } catch (error) {
      logWarn({ scope: "search.cache", event: "source-read-failed", key, error });
      return null;
    }
  }

  async setSourceResult(key: string, payload: SearchSourceResult, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    try {
      await this.client.set(key, JSON.stringify(payload), "EX", ttlSeconds);
      logInfo({ scope: "search.cache", event: "source-store", key, ttlSeconds });
    } catch (error) {
      logWarn({ scope: "search.cache", event: "source-write-failed", key, ttlSeconds, error });
    }
  }

  async incrementRepeatedQueryCounter(params: {
    actorKey: string;
    detectedType: SearchDetectedType;
    normalizedQuery: string;
  }): Promise<ThrottleInfo> {
    const windowSeconds = Math.max(1, Number(process.env.SEARCH_REPEAT_WINDOW_SEC ?? 60));
    const threshold = Math.max(1, Number(process.env.SEARCH_REPEAT_THROTTLE_LIMIT ?? 10));
    const key = [
      "search",
      "repeat",
      sanitizeKeyPart(params.actorKey),
      sanitizeKeyPart(params.detectedType),
      sanitizeKeyPart(params.normalizedQuery),
    ].join(":");

    try {
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, windowSeconds);
      }
      const throttled = count > threshold;
      if (throttled) {
        logWarn({ scope: "search.cache", event: "repeat-query-threshold-exceeded", key, count, threshold });
      }
      return { count, threshold, throttled };
    } catch (error) {
      logWarn({ scope: "search.cache", event: "throttle-increment-failed", key, error });
      return { count: 0, threshold, throttled: false };
    }
  }
}

export const cacheService = new CacheService();
