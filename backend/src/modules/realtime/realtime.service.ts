import { prisma } from "../../shared/prisma.js";
import { redis } from "../../shared/redis.js";
import { listApiHealth } from "../health/apiHealth.service.js";

const REDIS_TIMEOUT_MS = Math.max(25, Number(process.env.REALTIME_REDIS_TIMEOUT_MS ?? 150));
const ERROR_EVENT_LIMIT = Math.max(50, Number(process.env.REALTIME_ERROR_EVENT_LIMIT ?? 200));
const THROUGHPUT_BUCKET_TTL_SECONDS = Math.max(10 * 60, Number(process.env.REALTIME_BUCKET_TTL_SECONDS ?? 30 * 60));
const SUMMARY_CACHE_TTL_MS = Math.max(250, Number(process.env.REALTIME_SUMMARY_CACHE_TTL_MS ?? 3000));

type ErrorSeverity = "warn" | "error";

type RealtimeErrorEvent = {
  scope: string;
  code: string;
  message: string;
  severity: ErrorSeverity;
  ip?: string;
  userId?: string;
  service?: string;
  createdAt: string;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const summaryCache = new Map<string, CacheEntry<unknown>>();

function throughputKey(minuteIso: string) {
  return `realtime:throughput:${minuteIso}`;
}

function inflightKey(kind: "simple" | "orchestrated") {
  return `realtime:inflight:${kind}`;
}

function errorListKey() {
  return "realtime:errors";
}

function minuteBucket(date = new Date()) {
  return date.toISOString().slice(0, 16);
}

async function withSummaryCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const cached = summaryCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = await loader();
  summaryCache.set(key, {
    expiresAt: now + SUMMARY_CACHE_TTL_MS,
    value,
  });
  return value;
}

async function withRedisTimeout<T>(operation: Promise<T>, fallback: T): Promise<T> {
  try {
    return await Promise.race<T>([
      operation,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), REDIS_TIMEOUT_MS)),
    ]);
  } catch {
    return fallback;
  }
}

export async function markRealtimeSearchStarted(kind: "simple" | "orchestrated") {
  if (process.env.NODE_ENV === "test") return;
  await withRedisTimeout(redis.incr(inflightKey(kind)), 0);
}

export async function markRealtimeSearchCompleted(kind: "simple" | "orchestrated", success: boolean) {
  if (process.env.NODE_ENV === "test") return;

  const bucket = minuteBucket();
  const key = throughputKey(bucket);
  const multi = redis.multi();
  multi.decr(inflightKey(kind));
  multi.hincrby(key, "total", 1);
  multi.hincrby(key, kind, 1);
  multi.hincrby(key, success ? "success" : "failed", 1);
  multi.expire(key, THROUGHPUT_BUCKET_TTL_SECONDS);
  await withRedisTimeout(multi.exec(), null);
}

export async function recordRealtimeError(input: {
  scope: string;
  code: string;
  message: string;
  severity?: ErrorSeverity;
  ip?: string;
  userId?: string;
  service?: string;
}) {
  if (process.env.NODE_ENV === "test") return;

  const event: RealtimeErrorEvent = {
    scope: input.scope,
    code: input.code,
    message: input.message,
    severity: input.severity ?? "error",
    ip: input.ip,
    userId: input.userId,
    service: input.service,
    createdAt: new Date().toISOString(),
  };

  const multi = redis.multi();
  multi.lpush(errorListKey(), JSON.stringify(event));
  multi.ltrim(errorListKey(), 0, ERROR_EVENT_LIMIT - 1);
  await withRedisTimeout(multi.exec(), null);
}

function parseErrorEvent(raw: string): RealtimeErrorEvent | null {
  try {
    const parsed = JSON.parse(raw) as RealtimeErrorEvent;
    if (!parsed.code || !parsed.message || !parsed.createdAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getRealtimeHealthSummary() {
  return withSummaryCache("health", async () => {
    const items = await listApiHealth();
    const healthy = items.filter((item) => item.status === "HEALTHY").length;
    const unhealthy = items.filter((item) => item.status === "UNHEALTHY").length;
    const disabled = items.filter((item) => item.status === "DISABLED").length;
    const degraded = items.filter((item) => item.status === "UNKNOWN").length;

    return {
      totals: {
        apis: items.length,
        healthy,
        unhealthy,
        disabled,
        degraded,
      },
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        status: item.status,
        rollingLatencyMs: item.rollingLatencyMs,
        uptimePercent24h: item.uptime.percent24h,
        timeoutCount: item.timeoutCount,
        lastSuccessAt: item.lastSuccess?.checkedAt ?? null,
        lastErrorAt: item.lastError?.checkedAt ?? null,
        lastErrorCode: item.lastError?.errorCode ?? null,
      })),
      generatedAt: new Date().toISOString(),
    };
  });
}

export async function getSearchThroughputSummary() {
  return withSummaryCache("throughput", async () => {
    const now = new Date();
    const buckets = [0, 1, 2, 3, 4, 5, 10, 15].map((offset) => minuteBucket(new Date(now.getTime() - offset * 60_000)));
    const uniqueBuckets = Array.from(new Set(buckets));
    const bucketKeys = uniqueBuckets.map(throughputKey);
    const values = await Promise.all(
      bucketKeys.map((key) =>
        withRedisTimeout(redis.hgetall(key), {} as Record<string, string>)
      )
    );

    const totals = {
      oneMinute: 0,
      fiveMinutes: 0,
      fifteenMinutes: 0,
      successesFiveMinutes: 0,
      failuresFiveMinutes: 0,
    };

    uniqueBuckets.forEach((bucket, index) => {
      const payload = values[index] ?? {};
      const total = Number(payload.total ?? 0);
      const success = Number(payload.success ?? 0);
      const failed = Number(payload.failed ?? 0);
      const ageMinutes = Math.round((now.getTime() - new Date(`${bucket}:00Z`).getTime()) / 60_000);
      if (ageMinutes <= 1) totals.oneMinute += total;
      if (ageMinutes <= 5) {
        totals.fiveMinutes += total;
        totals.successesFiveMinutes += success;
        totals.failuresFiveMinutes += failed;
      }
      if (ageMinutes <= 15) totals.fifteenMinutes += total;
    });

    const [simpleInflight, orchestratedInflight] = await Promise.all([
      withRedisTimeout(redis.get(inflightKey("simple")), "0"),
      withRedisTimeout(redis.get(inflightKey("orchestrated")), "0"),
    ]);

    const simple = Math.max(0, Number(simpleInflight ?? 0));
    const orchestrated = Math.max(0, Number(orchestratedInflight ?? 0));

    return {
      totals,
      inflight: {
        simple,
        orchestrated,
        total: simple + orchestrated,
      },
      generatedAt: new Date().toISOString(),
    };
  });
}

export async function getActiveUsersSummary() {
  return withSummaryCache("active-users", async () => {
    const since5m = new Date(Date.now() - 5 * 60 * 1000);
    const since15m = new Date(Date.now() - 15 * 60 * 1000);
    const since60m = new Date(Date.now() - 60 * 60 * 1000);

    const [access5m, access15m, access60m, search5m, search15m, search60m] = await Promise.all([
      prisma.accessLog.findMany({ where: { createdAt: { gte: since5m }, userId: { not: null } }, select: { userId: true } }),
      prisma.accessLog.findMany({ where: { createdAt: { gte: since15m }, userId: { not: null } }, select: { userId: true } }),
      prisma.accessLog.findMany({ where: { createdAt: { gte: since60m }, userId: { not: null } }, select: { userId: true } }),
      prisma.searchHistory.findMany({ where: { createdAt: { gte: since5m } }, select: { userId: true } }),
      prisma.searchHistory.findMany({ where: { createdAt: { gte: since15m } }, select: { userId: true } }),
      prisma.searchHistory.findMany({ where: { createdAt: { gte: since60m } }, select: { userId: true } }),
    ]);

    const countDistinct = (values: Array<{ userId: string | null }>) =>
      new Set(values.map((item) => item.userId).filter((value): value is string => Boolean(value))).size;

    return {
      windows: {
        fiveMinutes: countDistinct([...access5m, ...search5m]),
        fifteenMinutes: countDistinct([...access15m, ...search15m]),
        sixtyMinutes: countDistinct([...access60m, ...search60m]),
      },
      generatedAt: new Date().toISOString(),
    };
  });
}

export async function getRealtimeErrorsSummary() {
  return withSummaryCache("errors", async () => {
    const since = Date.now() - 5 * 60 * 1000;
    const raw = await withRedisTimeout(redis.lrange(errorListKey(), 0, ERROR_EVENT_LIMIT - 1), [] as string[]);
    const items = raw
      .map(parseErrorEvent)
      .filter((item): item is RealtimeErrorEvent => Boolean(item))
      .filter((item) => new Date(item.createdAt).getTime() >= since)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      summary: {
        total: items.length,
        errors: items.filter((item) => item.severity === "error").length,
        warnings: items.filter((item) => item.severity === "warn").length,
        windowMinutes: 5,
      },
      items,
      generatedAt: new Date().toISOString(),
    };
  });
}

export async function getRealtimeLoadSummary() {
  const throughput = await getSearchThroughputSummary();
  const health = await getRealtimeHealthSummary();

  const maxConcurrency = Math.max(1, Math.min(12, Number(process.env.SEARCH_MAX_CONCURRENCY ?? 5)));
  const inflight = throughput.inflight.total;

  return {
    search: {
      inflight: throughput.inflight,
      throughputFiveMinutes: throughput.totals.fiveMinutes,
      maxConfiguredConcurrency: maxConcurrency,
    },
    apiHealth: {
      healthy: health.totals.healthy,
      unhealthy: health.totals.unhealthy,
      disabled: health.totals.disabled,
      degraded: health.totals.degraded,
    },
    load: {
      level:
        inflight >= maxConcurrency ? "high" :
        inflight >= Math.ceil(maxConcurrency / 2) ? "medium" :
        "low",
      utilizationPercent: Number(((inflight / maxConcurrency) * 100).toFixed(2)),
    },
    generatedAt: new Date().toISOString(),
  };
}
