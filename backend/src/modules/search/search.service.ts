import { prisma } from "../../shared/prisma.js";
import { HttpError } from "../../shared/http/errors.js";
import { detectQuery } from "./detect.js";
import { runApiCall } from "./runApiCall.js";
import { redis } from "../../shared/redis.js";
import { syncExpiredCredits } from "../../shared/security/expiry.js";
import { markRealtimeSearchCompleted, markRealtimeSearchStarted, recordRealtimeError } from "../realtime/realtime.service.js";
import { inferManagedServiceNames, MANAGED_SERVICE_NAMES } from "../admin/apiMapping.service.js";
import type { ApiConfig } from "@prisma/client";

export type Role = "ADMIN" | "RESELLER" | "USER";

type ServiceApiLink = {
  priority: number;
  api: ApiConfig;
};

function normalizeServiceName(serviceName: string) {
  return serviceName.replace(/\+/g, " ").replace(/\s+/g, " ").trim();
}

function pLimit(concurrency: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    activeCount--;
    const fn = queue.shift();
    if (fn) fn();
  };
  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (activeCount >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    activeCount++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
  return run;
}

const inFlight = new Map<string, Promise<any>>();

export function mergeConfiguredAndInferredServiceApis(
  serviceName: string,
  configuredLinks: ServiceApiLink[],
  activeApis: ApiConfig[]
): ServiceApiLink[] {
  if (!MANAGED_SERVICE_NAMES.includes(serviceName as (typeof MANAGED_SERVICE_NAMES)[number])) {
    return configuredLinks;
  }

  const seen = new Set(configuredLinks.map((link) => link.api.id));
  const inferredLinks = activeApis
    .filter((api) => !seen.has(api.id))
    .filter((api) => inferManagedServiceNames(api).includes(serviceName as (typeof MANAGED_SERVICE_NAMES)[number]))
    .map((api, index) => ({
      priority: configuredLinks.length + index + 1,
      api,
    }));

  return [...configuredLinks, ...inferredLinks];
}

export async function runServiceSearch(params: {
  auth: { sub: string; role: Role };
  ip: string;
  query: string;
  serviceName: string;
  requestParams?: Record<string, string>;
}) {
  const { auth, ip, query, serviceName, requestParams = {} } = params;
  let realtimeFinished = false;
  await markRealtimeSearchStarted("simple");
  try {
    const detected = detectQuery(query);

    const user = await prisma.user.findUnique({ where: { id: auth.sub } });
    if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");

    await syncExpiredCredits(user);

    if (user.status !== "ACTIVE") throw new HttpError(403, "SUSPENDED", "Account not active");
    if (user.expireAt && user.expireAt.getTime() < Date.now()) throw new HttpError(403, "EXPIRED", "Account expired");
    if (user.credits <= 0 && auth.role === "USER") {
      const telegram = process.env.CONTACT_TELEGRAM ?? "";
      const email = process.env.CONTACT_EMAIL ?? "";
      await prisma.searchHistory.create({
        data: { userId: user.id, query, detectedType: detected.type, status: "blocked", ip, cost: 0 },
      });
      await recordRealtimeError({
        scope: "search.simple",
        code: "NO_CREDITS",
        message: "User has zero credits",
        severity: "warn",
        ip,
        userId: user.id,
        service: serviceName,
      });
      await markRealtimeSearchCompleted("simple", false);
      realtimeFinished = true;
      throw new HttpError(402, "NO_CREDITS", `You have zero credit. Contact admin: ${telegram} | ${email}`);
    }

    const normalizedServiceName = normalizeServiceName(serviceName);
    const service = await prisma.service.findFirst({
      where: { name: { equals: normalizedServiceName, mode: "insensitive" } },
    });
    if (!service || !service.status) throw new HttpError(503, "SERVICE_OFFLINE", "Service disabled");

    const configuredLinks = await prisma.serviceApi.findMany({
      where: { serviceId: service.id, enabled: true, api: { status: true } },
      include: { api: true },
      orderBy: { priority: "asc" },
    });

    const linkedApiIds = configuredLinks.map((link) => link.api.id);
    const activeApis = await prisma.apiConfig.findMany({
      where: {
        status: true,
        ...(linkedApiIds.length ? { id: { notIn: linkedApiIds } } : {}),
      },
    });

    const links = mergeConfiguredAndInferredServiceApis(
      service.name,
      configuredLinks.map((link) => ({ priority: link.priority, api: link.api })),
      activeApis
    );

    const eligible = links
      .sort((a, b) => a.priority - b.priority)
      .map((l) => l.api)
      .filter((api) => {
        if (auth.role === "USER" && !api.allowUser) return false;
        if (auth.role === "RESELLER" && !api.allowReseller) return false;
        if (auth.role === "ADMIN" && !api.allowAdmin) return false;

        if (detected.type === "CNIC" && !api.supportsCnic) return false;
        if (detected.type === "PHONE" && !api.supportsPhone) return false;
        if (detected.type === "ENGINE" && !api.supportsEngine) return false;
        if (detected.type === "CHASSIS" && !api.supportsChassis) return false;
        if (detected.type === "REGISTRATION" && !api.supportsReg) return false;
        if (detected.type === "LICENSE" && !api.supportsLicense) return false;
        if (detected.type === "CUSTOM") {
          if (!api.customRegex) return false;
          try {
            return new RegExp(api.customRegex).test(detected.normalized);
          } catch {
            return false;
          }
        }
        return true;
      });

    if (eligible.length === 0) {
      await prisma.searchHistory.create({
        data: {
          userId: user.id,
          serviceId: service.id,
          query,
          detectedType: detected.type,
          status: "error",
          ip,
          cost: 0,
          results: { message: "No eligible APIs" },
        },
      });
      await recordRealtimeError({
        scope: "search.simple",
        code: "NO_APIS",
        message: "No APIs configured for this query type",
        severity: "warn",
        ip,
        userId: user.id,
        service: service.name,
      });
      await markRealtimeSearchCompleted("simple", false);
      realtimeFinished = true;
      throw new HttpError(404, "NO_APIS", "No APIs configured for this query type.");
    }

    const totalCost = eligible.reduce((sum, a) => sum + a.creditsPerSearch, 0);
    if (auth.role !== "ADMIN" && user.credits < totalCost) {
      await recordRealtimeError({
        scope: "search.simple",
        code: "INSUFFICIENT_CREDITS",
        message: `Insufficient credits. Required: ${totalCost}, available: ${user.credits}`,
        severity: "warn",
        ip,
        userId: user.id,
        service: service.name,
      });
      await markRealtimeSearchCompleted("simple", false);
      realtimeFinished = true;
      throw new HttpError(402, "INSUFFICIENT_CREDITS", `Insufficient credits. Required: ${totalCost}, you have: ${user.credits}`);
    }

    const redisClient = redis;
    const ttlSec = Number(process.env.SEARCH_CACHE_TTL_SEC ?? 180);
    const maxConcurrency = Math.max(1, Math.min(12, Number(process.env.SEARCH_MAX_CONCURRENCY ?? 5)));
    const limit = pLimit(maxConcurrency);

    const requestKey = `${auth.sub}:${service.id}:${detected.type}:${detected.normalized}`;
    const existing = inFlight.get(requestKey);
    if (existing) return await existing;

    const promise = (async () => {
      try {
        const results: any[] = [];
        let successCount = 0;

        await Promise.all(
          eligible.map((apiCfg) =>
            limit(async () => {
              const cacheKey = `api:${apiCfg.id}:q:${detected.normalized}`;
              try {
                const cached = ttlSec > 0 ? await redisClient.get(cacheKey) : null;
                if (cached) {
                  results.push({ apiId: apiCfg.id, apiName: apiCfg.name, ok: true, data: JSON.parse(cached), cached: true });
                  successCount += 1;
                  return;
                }

                const r = await runApiCall(apiCfg, detected.normalized, { requestParams });
                results.push({ apiId: apiCfg.id, apiName: apiCfg.name, ok: true, data: r.data });
                successCount += 1;

                if (ttlSec > 0) {
                  await redisClient.set(cacheKey, JSON.stringify(r.data), "EX", ttlSec);
                }
              } catch (e: any) {
                results.push({ apiId: apiCfg.id, apiName: apiCfg.name, ok: false, error: e?.message ?? "API error" });
              }
            })
          )
        );

        let charged = 0;
        if (auth.role !== "ADMIN" && successCount > 0) {
          charged = totalCost;
          await prisma.$transaction([
            prisma.user.update({ where: { id: user.id }, data: { credits: { decrement: charged } } }),
            prisma.creditLog.create({ data: { userId: user.id, delta: -charged, reason: `${service.name} (${detected.type})` } }),
          ]);
        }

        await prisma.searchHistory.create({
          data: {
            userId: user.id,
            serviceId: service.id,
            query,
            detectedType: detected.type,
            status: successCount > 0 ? "success" : "error",
            ip,
            cost: charged,
            results,
          },
        });

        await markRealtimeSearchCompleted("simple", successCount > 0);
        realtimeFinished = true;

        return {
          status: "success",
          service: service.name,
          detectedType: detected.type,
          querySent: detected.normalized,
          cost: charged,
          remainingCredits: auth.role === "ADMIN" ? null : Math.max(0, user.credits - charged),
          results,
        };
      } catch (error) {
        await recordRealtimeError({
          scope: "search.simple",
          code: error instanceof HttpError ? error.code : "SEARCH_SIMPLE_FAILED",
          message: error instanceof Error ? error.message : "Unexpected search failure",
          severity: error instanceof HttpError && error.status < 500 ? "warn" : "error",
          ip,
          userId: user.id,
          service: service.name,
        });
        await markRealtimeSearchCompleted("simple", false);
        realtimeFinished = true;
        throw error;
      }
    })();

    inFlight.set(requestKey, promise);
    try {
      return await promise;
    } finally {
      if (!realtimeFinished) {
        await markRealtimeSearchCompleted("simple", false);
      }
      inFlight.delete(requestKey);
    }
  } catch (error) {
    if (!realtimeFinished) {
      await markRealtimeSearchCompleted("simple", false);
      realtimeFinished = true;
    }
    throw error;
  }
}
