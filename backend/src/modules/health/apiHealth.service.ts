import { HttpError } from "../../shared/http/errors.js";
import { prisma } from "../../shared/prisma.js";
import { redis } from "../../shared/redis.js";
import { runApiCall } from "../search/runApiCall.js";

const EVENT_LIMIT = Math.max(20, Number(process.env.API_HEALTH_EVENT_LIMIT ?? 50));
const REDIS_TIMEOUT_MS = Math.max(25, Number(process.env.API_HEALTH_REDIS_TIMEOUT_MS ?? 150));

type HealthProbeType = "RUNTIME" | "MANUAL" | "SCHEDULED";
type HealthStatus = "HEALTHY" | "UNHEALTHY";

type HealthEvent = {
  apiId: string;
  probeType: HealthProbeType;
  status: HealthStatus;
  httpStatus: number | null;
  latencyMs: number | null;
  timedOut: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  checkedAt: string;
};

type RecordHealthCheckInput = {
  apiId: string;
  probeType?: HealthProbeType;
  status: HealthStatus;
  httpStatus?: number | null;
  latencyMs?: number | null;
  timedOut?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
};

type ToggleApiHealthInput = {
  apiId: string;
  serviceId?: string;
  enabled?: boolean;
};

type UpdatePriorityInput = {
  apiId: string;
  priority: number;
  serviceId?: string;
};

type ManualProbeInput = {
  apiId: string;
  query?: string;
};

type ExecuteProbeInput = ManualProbeInput & {
  probeType: HealthProbeType;
};

function eventsKey(apiId: string) {
  return `api-health:${apiId}:events`;
}

function summaryKey(apiId: string) {
  return `api-health:${apiId}:summary`;
}

function healthStoreDisabled() {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
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

function parseEvent(raw: string): HealthEvent | null {
  try {
    const parsed = JSON.parse(raw) as HealthEvent;
    if (!parsed?.apiId || !parsed?.status || !parsed?.checkedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildSummary(events: HealthEvent[]) {
  const ordered = events
    .slice()
    .sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime());

  const latest = ordered[0] ?? null;
  const successes = ordered.filter((event) => event.status === "HEALTHY");
  const failures = ordered.filter((event) => event.status !== "HEALTHY");
  const timeoutCount = ordered.filter((event) => event.timedOut).length;
  const latencyValues = successes.flatMap((event) => (event.latencyMs != null ? [event.latencyMs] : []));
  const rollingLatencyMs = latencyValues.length
    ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)
    : null;
  const uptimePercent = ordered.length ? Number(((successes.length / ordered.length) * 100).toFixed(2)) : null;

  return {
    currentStatus: latest?.status ?? "UNKNOWN",
    lastSuccess: successes[0] ?? null,
    lastError: failures[0] ?? null,
    rollingLatencyMs,
    timeoutCount,
    totalChecks: ordered.length,
    successChecks: successes.length,
    failedChecks: failures.length,
    uptimePercent,
    trend: ordered
      .slice()
      .reverse()
      .map((event) => ({
        checkedAt: event.checkedAt,
        status: event.status,
        timedOut: event.timedOut,
        latencyMs: event.latencyMs,
      })),
  };
}

async function loadEvents(apiId: string) {
  if (healthStoreDisabled()) return [];
  const raw = await withRedisTimeout(redis.lrange(eventsKey(apiId), 0, EVENT_LIMIT - 1), []);
  return raw.map(parseEvent).filter((item: HealthEvent | null): item is HealthEvent => Boolean(item));
}

async function writeSummary(apiId: string, events: HealthEvent[]) {
  if (healthStoreDisabled()) return buildSummary(events);
  const summary = buildSummary(events);
  await withRedisTimeout(redis.set(summaryKey(apiId), JSON.stringify(summary)), "OK");
  return summary;
}

export async function recordApiHealthCheck(input: RecordHealthCheckInput) {
  const event: HealthEvent = {
    apiId: input.apiId,
    probeType: input.probeType ?? "RUNTIME",
    status: input.status,
    httpStatus: input.httpStatus ?? null,
    latencyMs: input.latencyMs ?? null,
    timedOut: input.timedOut ?? false,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    checkedAt: new Date().toISOString(),
  };

  if (healthStoreDisabled()) return event;

  const key = eventsKey(input.apiId);
  await withRedisTimeout(
    redis.multi().lpush(key, JSON.stringify(event)).ltrim(key, 0, EVENT_LIMIT - 1).exec(),
    null
  );
  const events = await loadEvents(input.apiId);
  await writeSummary(input.apiId, events);
  return event;
}

export async function listApiHealth() {
  const apis = await prisma.apiConfig.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      serviceApis: {
        include: {
          service: {
            select: { id: true, name: true, status: true },
          },
        },
        orderBy: { priority: "asc" },
      },
    },
  });

  const items = await Promise.all(
    apis.map(async (api) => {
      const events = await loadEvents(api.id);
      const summary = buildSummary(events);
      return {
        id: api.id,
        name: api.name,
        status: !api.status ? "DISABLED" : summary.currentStatus,
        apiEnabled: api.status,
        endpoint: `${api.baseUrl}${api.endpoint}`,
        method: api.method,
        sampleQuery: api.sampleQuery,
        lastSuccess: summary.lastSuccess,
        lastError: summary.lastError,
        rollingLatencyMs: summary.rollingLatencyMs,
        timeoutCount: summary.timeoutCount,
        uptime: {
          percent24h: summary.uptimePercent,
          totalChecks24h: summary.totalChecks,
          healthyChecks24h: summary.successChecks,
          failedChecks24h: summary.failedChecks,
          trend: summary.trend,
        },
        serviceMappings: api.serviceApis.map((item) => ({
          serviceApiId: item.id,
          serviceId: item.service.id,
          serviceName: item.service.name,
          serviceEnabled: item.service.status,
          mappingEnabled: item.enabled,
          priority: item.priority,
        })),
      };
    })
  );

  return items;
}

export async function toggleApiHealth(input: ToggleApiHealthInput) {
  const api = await prisma.apiConfig.findUnique({ where: { id: input.apiId } });
  if (!api) throw new HttpError(404, "NOT_FOUND", "API not found");

  if (input.serviceId) {
    const mapping = await prisma.serviceApi.findFirst({
      where: { apiId: input.apiId, serviceId: input.serviceId },
      include: { service: { select: { id: true, name: true } } },
    });
    if (!mapping) throw new HttpError(404, "NOT_FOUND", "Service mapping not found");

    const nextEnabled = input.enabled ?? !mapping.enabled;
    const updated = await prisma.serviceApi.update({
      where: { id: mapping.id },
      data: { enabled: nextEnabled },
      include: { service: { select: { id: true, name: true } } },
    });

    return {
      scope: "service-mapping",
      apiId: input.apiId,
      serviceId: updated.serviceId,
      serviceName: updated.service.name,
      enabled: updated.enabled,
      priority: updated.priority,
    };
  }

  const nextEnabled = input.enabled ?? !api.status;
  const updated = await prisma.apiConfig.update({
    where: { id: input.apiId },
    data: { status: nextEnabled },
  });

  return {
    scope: "api",
    apiId: updated.id,
    enabled: updated.status,
  };
}

export async function updateApiPriority(input: UpdatePriorityInput) {
  const api = await prisma.apiConfig.findUnique({ where: { id: input.apiId } });
  if (!api) throw new HttpError(404, "NOT_FOUND", "API not found");
  if (input.priority < 1) throw new HttpError(400, "BAD_REQUEST", "Priority must be >= 1");

  if (input.serviceId) {
    const mapping = await prisma.serviceApi.findFirst({
      where: { apiId: input.apiId, serviceId: input.serviceId },
      include: { service: { select: { id: true, name: true } } },
    });
    if (!mapping) throw new HttpError(404, "NOT_FOUND", "Service mapping not found");

    const updated = await prisma.serviceApi.update({
      where: { id: mapping.id },
      data: { priority: input.priority },
      include: { service: { select: { id: true, name: true } } },
    });

    return {
      scope: "service-mapping",
      apiId: input.apiId,
      serviceId: updated.serviceId,
      serviceName: updated.service.name,
      priority: updated.priority,
      enabled: updated.enabled,
    };
  }

  const updatedMappings = await prisma.serviceApi.updateMany({
    where: { apiId: input.apiId },
    data: { priority: input.priority },
  });

  return {
    scope: "api",
    apiId: input.apiId,
    updatedMappings: updatedMappings.count,
    priority: input.priority,
  };
}

export async function probeApiHealth(input: ManualProbeInput) {
  return executeApiProbe({
    apiId: input.apiId,
    query: input.query,
    probeType: "MANUAL",
  });
}

async function executeApiProbe(input: ExecuteProbeInput) {
  const api = await prisma.apiConfig.findUnique({ where: { id: input.apiId } });
  if (!api) throw new HttpError(404, "NOT_FOUND", "API not found");

  const query = input.query?.trim() || api.sampleQuery?.trim();
  if (!query) {
    throw new HttpError(400, "BAD_REQUEST", "Probe query required. Set sampleQuery on the API or pass query in the request body.");
  }

  const startedAt = Date.now();

  try {
    const response = await runApiCall(api, query);
    const latencyMs = Date.now() - startedAt;

    const event = await recordApiHealthCheck({
      apiId: api.id,
      probeType: input.probeType,
      status: "HEALTHY",
      httpStatus: response.status,
      latencyMs,
      timedOut: false,
    });

    return {
      status: "HEALTHY",
      apiId: api.id,
      apiName: api.name,
      query,
      latencyMs,
      httpStatus: response.status,
      checkedAt: event.checkedAt,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const httpError = error instanceof HttpError ? error : new HttpError(502, "API_ERROR", "API call failed");

    const event = await recordApiHealthCheck({
      apiId: api.id,
      probeType: input.probeType,
      status: "UNHEALTHY",
      latencyMs,
      timedOut: httpError.code === "API_TIMEOUT",
      errorCode: httpError.code,
      errorMessage: httpError.message,
      httpStatus: httpError.status,
    });

    return {
      status: "UNHEALTHY",
      apiId: api.id,
      apiName: api.name,
      query,
      latencyMs,
      errorCode: httpError.code,
      errorMessage: httpError.message,
      checkedAt: event.checkedAt,
    };
  }
}

export async function runScheduledHealthSweep() {
  const apis = await prisma.apiConfig.findMany({
    where: { status: true },
    select: { id: true, sampleQuery: true },
  });

  for (const api of apis) {
    if (!api.sampleQuery) continue;
    await executeApiProbe({ apiId: api.id, query: api.sampleQuery, probeType: "SCHEDULED" });
  }
}
