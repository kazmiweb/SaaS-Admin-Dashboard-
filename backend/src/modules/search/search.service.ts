import { prisma } from "../../shared/prisma.js";
import { HttpError } from "../../shared/http/errors.js";
import { detectQuery } from "./detect.js";
import { runApiCall } from "./runApiCall.js";
import { getRedis } from "../../shared/redis.js";
import { syncExpiredCredits } from "../../shared/security/expiry.js";

export type Role = "ADMIN" | "RESELLER" | "USER";

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

export async function runServiceSearch(params: {
  auth: { sub: string; role: Role };
  ip: string;
  query: string;
  serviceName: string;
}) {
  const { auth, ip, query, serviceName } = params;
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
    throw new HttpError(402, "NO_CREDITS", `You have zero credit. Contact admin: ${telegram} | ${email}`);
  }

  const service = await prisma.service.findUnique({ where: { name: serviceName } });
  if (!service || !service.status) throw new HttpError(503, "SERVICE_OFFLINE", "Service disabled");

  const links = await prisma.serviceApi.findMany({
    where: { serviceId: service.id, enabled: true, api: { status: true } },
    include: { api: true },
    orderBy: { priority: "asc" },
  });

  const eligible = links
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
    throw new HttpError(404, "NO_APIS", "No APIs configured for this query type.");
  }

  const totalCost = eligible.reduce((sum, a) => sum + a.creditsPerSearch, 0);
  if (auth.role !== "ADMIN" && user.credits < totalCost) {
    throw new HttpError(402, "INSUFFICIENT_CREDITS", `Insufficient credits. Required: ${totalCost}, you have: ${user.credits}`);
  }

  const redis = getRedis();
  const ttlSec = Number(process.env.SEARCH_CACHE_TTL_SEC ?? 180);
  const maxConcurrency = Math.max(1, Math.min(12, Number(process.env.SEARCH_MAX_CONCURRENCY ?? 5)));
  const limit = pLimit(maxConcurrency);

  const requestKey = `${auth.sub}:${service.id}:${detected.type}:${detected.normalized}`;
  const existing = inFlight.get(requestKey);
  if (existing) return await existing;

  const promise = (async () => {
    const results: any[] = [];
    let successCount = 0;

    await Promise.all(
      eligible.map((apiCfg) =>
        limit(async () => {
          const cacheKey = `api:${apiCfg.id}:q:${detected.normalized}`;
          try {
            const cached = ttlSec > 0 ? await redis.get(cacheKey) : null;
            if (cached) {
              results.push({ apiId: apiCfg.id, apiName: apiCfg.name, ok: true, data: JSON.parse(cached), cached: true });
              successCount += 1;
              return;
            }

            const r = await runApiCall(apiCfg, detected.normalized);
            results.push({ apiId: apiCfg.id, apiName: apiCfg.name, ok: true, data: r.data });
            successCount += 1;

            if (ttlSec > 0) {
              await redis.set(cacheKey, JSON.stringify(r.data), "EX", ttlSec);
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

    return {
      status: "success",
      service: service.name,
      detectedType: detected.type,
      querySent: detected.normalized,
      cost: charged,
      remainingCredits: auth.role === "ADMIN" ? null : Math.max(0, user.credits - charged),
      results,
    };
  })();

  inFlight.set(requestKey, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(requestKey);
  }
}
