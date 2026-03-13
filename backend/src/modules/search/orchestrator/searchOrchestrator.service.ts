import type { ApiConfig } from "@prisma/client";
import { prisma } from "../../../shared/prisma.js";
import { HttpError } from "../../../shared/http/errors.js";
import { syncExpiredCredits } from "../../../shared/security/expiry.js";
import { cacheService } from "../cache/cache.service.js";
import { classifyQuery } from "../classifiers/queryClassifier.service.js";
import { executeSources } from "../executors/apiExecution.service.js";
import { logSearchComplete, logSearchFailure, logSearchStart } from "./searchLogger.js";
import { markRealtimeSearchCompleted, markRealtimeSearchStarted, recordRealtimeError } from "../../realtime/realtime.service.js";
import { logInfo } from "../../../shared/observability/logger.js";
import type {
  OrchestratedSearchResult,
  SearchDetectedType,
  SearchSourceResult,
} from "../types/search.types.js";

export type Role = "ADMIN" | "RESELLER" | "USER";

type EligibleSource = {
  priority: number;
  api: ApiConfig;
};

function normalizeServiceName(serviceName: string) {
  return serviceName.replace(/\+/g, " ").replace(/\s+/g, " ").trim();
}

const inFlight = new Map<string, Promise<OrchestratedSearchResult>>();

function supportsDetectedType(api: ApiConfig, detectedType: SearchDetectedType, normalizedQuery: string): boolean {
  if (detectedType === "CNIC") return api.supportsCnic;
  if (detectedType === "MOBILE") return api.supportsPhone;
  if (detectedType === "ENGINE") return api.supportsEngine;
  if (detectedType === "CHASSIS") return api.supportsChassis;
  if (detectedType === "VEHICLE_REGISTRATION") return api.supportsReg;

  if (api.customRegex) {
    try {
      return new RegExp(api.customRegex).test(normalizedQuery);
    } catch {
      return false;
    }
  }

  return true;
}

function roleAllowed(api: ApiConfig, role: Role): boolean {
  if (role === "USER") return api.allowUser;
  if (role === "RESELLER") return api.allowReseller;
  return api.allowAdmin;
}

function sourceRequested(api: ApiConfig, requestedSources: string[]): boolean {
  if (requestedSources.length === 0) return true;
  const normalizedTargets = requestedSources.map((s) => s.trim().toLowerCase()).filter(Boolean);
  return normalizedTargets.includes(api.id.toLowerCase()) || normalizedTargets.includes(api.name.trim().toLowerCase());
}

export async function runOrchestratedSearch(params: {
  auth: { sub: string; role: Role };
  ip: string;
  query: string;
  serviceName: string;
  sources?: string[];
  forceRefresh?: boolean;
  requestId?: string;
}): Promise<OrchestratedSearchResult> {
  const { auth, ip, query, serviceName, sources = [], forceRefresh = false, requestId } = params;
  let realtimeFinished = false;
  await markRealtimeSearchStarted("orchestrated");
  try {
    const startedAt = Date.now();

    const classification = classifyQuery(query);

    const user = await prisma.user.findUnique({ where: { id: auth.sub } });
    if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");

    await syncExpiredCredits(user);

    if (user.status !== "ACTIVE") throw new HttpError(403, "SUSPENDED", "Account not active");
    if (user.expireAt && user.expireAt.getTime() < Date.now()) throw new HttpError(403, "EXPIRED", "Account expired");

    if (user.credits <= 0 && auth.role === "USER") {
      const telegram = process.env.CONTACT_TELEGRAM ?? "";
      const email = process.env.CONTACT_EMAIL ?? "";

      await prisma.searchHistory.create({
        data: {
          userId: user.id,
          query,
          detectedType: classification.detectedType,
          status: "blocked",
          ip,
          cost: 0,
        },
      });

      logSearchFailure({
        requestId,
        userId: auth.sub,
        ip,
        service: serviceName,
        originalQuery: query,
        normalizedQuery: classification.normalizedQuery,
        detectedType: classification.detectedType,
        totalLatencyMs: Date.now() - startedAt,
        errorCode: "NO_CREDITS",
        errorMessage: "User has zero credits",
      });
      await recordRealtimeError({
        scope: "search.orchestrated",
        code: "NO_CREDITS",
        message: "User has zero credits",
        severity: "warn",
        ip,
        userId: user.id,
        service: serviceName,
      });
      await markRealtimeSearchCompleted("orchestrated", false);
      realtimeFinished = true;

      throw new HttpError(402, "NO_CREDITS", `You have zero credit. Contact admin: ${telegram} | ${email}`);
    }

    const normalizedServiceName = normalizeServiceName(serviceName);
    const service = await prisma.service.findFirst({
      where: { name: { equals: normalizedServiceName, mode: "insensitive" } },
    });
    if (!service || !service.status) throw new HttpError(503, "SERVICE_OFFLINE", "Service disabled");

    const links = await prisma.serviceApi.findMany({
      where: { serviceId: service.id, enabled: true, api: { status: true } },
      include: { api: true },
      orderBy: { priority: "asc" },
    });

    const eligible: EligibleSource[] = links
      .map((l) => ({ priority: l.priority, api: l.api }))
      .filter(({ api }) => roleAllowed(api, auth.role))
      .filter(({ api }) => sourceRequested(api, sources))
      .filter(({ api }) => supportsDetectedType(api, classification.detectedType, classification.normalizedQuery));

    if (eligible.length === 0) {
      await prisma.searchHistory.create({
        data: {
          userId: user.id,
          serviceId: service.id,
          query,
          detectedType: classification.detectedType,
          status: "error",
          ip,
          cost: 0,
          results: { message: "No eligible APIs" },
        },
      });
      logSearchFailure({
        requestId,
        userId: auth.sub,
        ip,
        service: service.name,
        originalQuery: query,
        normalizedQuery: classification.normalizedQuery,
        detectedType: classification.detectedType,
        totalLatencyMs: Date.now() - startedAt,
        errorCode: "NO_APIS",
        errorMessage: "No APIs configured for this query type",
      });
      await recordRealtimeError({
        scope: "search.orchestrated",
        code: "NO_APIS",
        message: "No APIs configured for this query type",
        severity: "warn",
        ip,
        userId: user.id,
        service: service.name,
      });
      await markRealtimeSearchCompleted("orchestrated", false);
      realtimeFinished = true;
      throw new HttpError(404, "NO_APIS", "No APIs configured for this query type.");
    }

    const totalCost = eligible.reduce((sum, item) => sum + item.api.creditsPerSearch, 0);
    if (auth.role !== "ADMIN" && user.credits < totalCost) {
      logSearchFailure({
        requestId,
        userId: auth.sub,
        ip,
        service: service.name,
        originalQuery: query,
        normalizedQuery: classification.normalizedQuery,
        detectedType: classification.detectedType,
        totalLatencyMs: Date.now() - startedAt,
        errorCode: "INSUFFICIENT_CREDITS",
        errorMessage: `Insufficient credits. Required: ${totalCost}, available: ${user.credits}`,
      });
      await recordRealtimeError({
        scope: "search.orchestrated",
        code: "INSUFFICIENT_CREDITS",
        message: `Insufficient credits. Required: ${totalCost}, available: ${user.credits}`,
        severity: "warn",
        ip,
        userId: user.id,
        service: service.name,
      });
      await markRealtimeSearchCompleted("orchestrated", false);
      realtimeFinished = true;
      throw new HttpError(402, "INSUFFICIENT_CREDITS", `Insufficient credits. Required: ${totalCost}, you have: ${user.credits}`);
    }

    const maxConcurrency = Math.max(1, Math.min(12, Number(process.env.SEARCH_MAX_CONCURRENCY ?? 5)));
    const timeoutMs = Math.max(100, Number(process.env.SEARCH_API_TIMEOUT_MS ?? 20_000));
    const actorKey = auth.sub || ip || "anonymous";

    const requestKey = [
      auth.sub,
      service.id,
      classification.detectedType,
      classification.normalizedQuery,
      sources.slice().sort().join(","),
      String(forceRefresh),
    ].join(":");

    const existing = inFlight.get(requestKey);
    if (existing) return existing;

    const promise = (async (): Promise<OrchestratedSearchResult> => {
      try {
      logSearchStart({
        requestId,
        userId: auth.sub,
        ip,
        service: service.name,
        originalQuery: classification.originalQuery,
        normalizedQuery: classification.normalizedQuery,
        detectedType: classification.detectedType,
        selectedSources: eligible.map((source) => ({
          sourceId: source.api.id,
          sourceName: source.api.name,
          priority: source.priority,
        })),
        forceRefresh,
      });

      await cacheService.incrementRepeatedQueryCounter({
        actorKey,
        detectedType: classification.detectedType,
        normalizedQuery: classification.normalizedQuery,
      });

      const execution = await executeSources({
        query: classification.normalizedQuery,
        sources: eligible.map((source) => ({
          api: source.api,
          matched: true,
        })),
        concurrency: maxConcurrency,
        timeoutMs,
        readCachedResult: forceRefresh
          ? undefined
          : async (api) => {
              const key = cacheService.buildSourceCacheKey({
                apiId: api.id,
                detectedType: classification.detectedType,
                normalizedQuery: classification.normalizedQuery,
              });
              return cacheService.getSourceResult(key);
            },
        writeCachedResult: async (api, result) => {
          if (!cacheService.shouldCache({
            normalizedQuery: classification.normalizedQuery,
            detectedType: classification.detectedType,
            successCount: 1,
          })) {
            return;
          }
          const ttlSeconds = cacheService.getSourceTtlSeconds(api, classification.detectedType);
          const key = cacheService.buildSourceCacheKey({
            apiId: api.id,
            detectedType: classification.detectedType,
            normalizedQuery: classification.normalizedQuery,
          });
          await cacheService.setSourceResult(key, result, ttlSeconds);
        },
      });

      const sourceResults: SearchSourceResult[] = execution.results;
      const sourceDiagnostics = execution.diagnostics;

      const successCount = sourceResults.length;
      let charged = 0;

      if (auth.role !== "ADMIN" && successCount > 0) {
        charged = totalCost;
        await prisma.$transaction([
          prisma.user.update({ where: { id: user.id }, data: { credits: { decrement: charged } } }),
          prisma.creditLog.create({
            data: {
              userId: user.id,
              delta: -charged,
              reason: `${service.name} (${classification.detectedType})`,
            },
          }),
        ]);
      }

      const successfulDiagnostics = sourceDiagnostics.filter((d) => d.status === "success");
      const fastestSource = successfulDiagnostics.length
        ? successfulDiagnostics.slice().sort((a, b) => a.latencyMs - b.latencyMs)[0]?.sourceName ?? null
        : null;

      const totalLatencyMs = Date.now() - startedAt;
      const cacheHits = sourceDiagnostics.filter((item) => item.cached).length;
      const cacheMisses = sourceDiagnostics.length - cacheHits;
      const payload: OrchestratedSearchResult = {
        status: successCount === eligible.length ? "success" : "partial",
        service: service.name,
        originalQuery: classification.originalQuery,
        normalizedQuery: classification.normalizedQuery,
        detectedType: classification.detectedType,
        confidence: classification.confidence,
        reason: classification.reason,
        cached: sourceResults.some((r) => r.cached),
        completedAt: new Date().toISOString(),
        totalLatencyMs,
        fastestSource,
        results: sourceResults,
        sourceDiagnostics,
        cost: charged,
        remainingCredits: auth.role === "ADMIN" ? null : Math.max(0, user.credits - charged),
      };
      const cacheMetrics = cacheService.getMetrics();
      logSearchComplete({
        requestId,
        userId: auth.sub,
        ip,
        service: service.name,
        originalQuery: classification.originalQuery,
        normalizedQuery: classification.normalizedQuery,
        detectedType: classification.detectedType,
        fastestSource,
        totalLatencyMs,
        sourceDiagnostics,
        cacheHits,
        cacheMisses,
      });
      logInfo({
        scope: "search.orchestrated",
        event: "cache-metrics",
        requestId,
        userId: auth.sub,
        service: service.name,
        metrics: cacheMetrics,
      });

      await prisma.searchHistory.create({
        data: {
          userId: user.id,
          serviceId: service.id,
          query,
          detectedType: classification.detectedType,
          status: successCount > 0 ? "success" : "error",
          ip,
          cost: charged,
          results: payload as any,
        },
      });

      await markRealtimeSearchCompleted("orchestrated", successCount > 0);
      realtimeFinished = true;

      return payload;
    } catch (error) {
      logSearchFailure({
        requestId,
        userId: auth.sub,
        ip,
        service: service.name,
        originalQuery: classification.originalQuery,
        normalizedQuery: classification.normalizedQuery,
        detectedType: classification.detectedType,
        totalLatencyMs: Date.now() - startedAt,
        errorCode: error instanceof HttpError ? error.code : "ORCHESTRATED_SEARCH_FAILED",
        errorMessage: error instanceof Error ? error.message : "Unexpected orchestrated search failure",
      });
      await recordRealtimeError({
        scope: "search.orchestrated",
        code: error instanceof HttpError ? error.code : "ORCHESTRATED_SEARCH_FAILED",
        message: error instanceof Error ? error.message : "Unexpected orchestrated search failure",
        severity: error instanceof HttpError && error.status < 500 ? "warn" : "error",
        ip,
        userId: user.id,
        service: service.name,
      });
      await markRealtimeSearchCompleted("orchestrated", false);
      realtimeFinished = true;
      throw error;
    }
    })();

    inFlight.set(requestKey, promise);
    try {
      return await promise;
    } finally {
      if (!realtimeFinished) {
        await markRealtimeSearchCompleted("orchestrated", false);
      }
      inFlight.delete(requestKey);
    }
  } catch (error) {
    if (!realtimeFinished) {
      await markRealtimeSearchCompleted("orchestrated", false);
      realtimeFinished = true;
    }
    throw error;
  }
}
