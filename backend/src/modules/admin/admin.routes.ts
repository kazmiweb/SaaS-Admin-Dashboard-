import { Router, type Request, type Response } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";
import { requireAuth, requireRole } from "../../shared/security/authMiddleware.js";
import { HttpError } from "../../shared/http/errors.js";
import { runApiCall } from "../search/runApiCall.js";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { signApiKeyJwt } from "../../shared/security/jwt.js";
import { listApiHealth, probeApiHealth, toggleApiHealth, updateApiPriority } from "../health/apiHealth.service.js";
import { listActivityLogs, listAdminActions, listSecurityEvents, recordAdminAction } from "../audit/audit.service.js";
import {
  blacklistUser,
  clearTempIpBlock,
  getSecuritySummary,
  getTempBlockedIps,
  listAuthFailures,
  listBlockedIps,
  listIpAbuse,
  removeIpFromList,
  resetUserDevice,
  setIpListType,
  suspendUser,
  whitelistUser,
} from "../security/security.service.js";
import {
  exportActivityCsv,
  exportApiPerformanceCsv,
  exportRevenueCsv,
  exportTransactionsCsv,
  exportUsersCsv,
} from "../export/exportCenter.service.js";
import { syncApiMappingsForApi, syncManagedApiMappings } from "./apiMapping.service.js";
import { isInternalApiConfig } from "../../shared/internalApis.js";
import {
  getActiveUsersSummary,
  getRealtimeErrorsSummary,
  getRealtimeHealthSummary,
  getRealtimeLoadSummary,
  getSearchThroughputSummary,
} from "../realtime/realtime.service.js";
import {
  buildRevenueEligibleUserWhere,
  getInitialCreditsForBillingType,
  isRevenueEligibleUser,
  normalizeBillingType,
  resolveRevenueExcluded,
} from "../../shared/billing/billingRules.js";
import { upsertNotification } from "../../shared/notifications.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("ADMIN"));

function parseDateInput(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, "BAD_REQUEST", `Invalid date: ${value}`);
  }
  return parsed;
}

const RENEW_PACKAGE_CONFIG = {
  MONTHLY_30: { days: 30, coins: 300, label: "30 Days Package (1 Month)" },
  DAYS_15: { days: 15, coins: 150, label: "15 Days Package" },
  WEEKLY_7: { days: 7, coins: 80, label: "7 Days Package (1 Week)" },
  DEMO_1: { days: 1, coins: 10, label: "Demo 1 Day Package (24 Hours)" },
} as const;

type RenewPackageCode = keyof typeof RENEW_PACKAGE_CONFIG;

function buildApiPayload(input: Record<string, any>) {
  const authType = String(input.authType ?? "NONE").toUpperCase();
  const authConfig = input.auth_config ?? input.authConfig ?? {};
  const methodConfig = input.method_config ?? input.methodConfig ?? {};
  const sessionConfig = input.session_config ?? input.sessionConfig ?? {};
  const rateLimitConfig = input.rate_limit_config ?? input.rateLimitConfig ?? {};

  return {
    name: input.name,
    method: input.method,
    baseUrl: input.baseUrl,
    endpoint: input.endpoint ?? "",
    queryParam: methodConfig.queryParam ?? input.queryParam ?? "query",
    description: input.description ?? undefined,
    authType: authType as any,
    apiKeyHeader: authType === "API_KEY_HEADER" ? authConfig.key ?? null : null,
    apiKeyValue: authType === "API_KEY_HEADER" ? authConfig.value ?? null : null,
    bearerToken: authType === "BEARER_TOKEN" ? authConfig.token ?? null : null,
    basicUser: authType === "BASIC_AUTH" ? authConfig.username ?? null : null,
    basicPass: authType === "BASIC_AUTH" ? authConfig.password ?? null : null,
    supportsCnic: input.supportsCnic ?? false,
    supportsPhone: input.supportsPhone ?? false,
    supportsEngine: input.supportsEngine ?? false,
    supportsChassis: input.supportsChassis ?? false,
    supportsReg: input.supportsReg ?? false,
    supportsLicense: input.supportsLicense ?? false,
    customRegex: input.customRegex ?? undefined,
    creditsPerSearch: input.creditsPerSearch ?? 1,
    allowUser: input.allowUser ?? true,
    allowReseller: input.allowReseller ?? true,
    allowAdmin: input.allowAdmin ?? true,
    status: input.status ?? true,
    sampleQuery: input.sampleQuery ?? undefined,
    loginUrl: authType === "SESSION_LOGIN" ? sessionConfig.loginUrl ?? input.loginUrl ?? null : null,
    usernameField: authType === "SESSION_LOGIN" ? sessionConfig.usernameField ?? input.usernameField ?? null : null,
    passwordField: authType === "SESSION_LOGIN" ? sessionConfig.passwordField ?? input.passwordField ?? null : null,
    captchaEnabled: authType === "SESSION_LOGIN" ? Boolean(sessionConfig.captchaEnabled ?? input.captchaEnabled ?? false) : false,
    sessionPolicy: authType === "SESSION_LOGIN" ? sessionConfig.sessionPolicy ?? input.sessionPolicy ?? null : null,
    maxPerMinute: rateLimitConfig.maxPerMinute ?? input.maxPerMinute ?? null,
    maxPerDay: rateLimitConfig.maxPerDay ?? input.maxPerDay ?? null,
    cooldownSeconds: rateLimitConfig.cooldownSeconds ?? input.cooldownSeconds ?? null,
  };
}

function withApiComputedConfig<T extends Record<string, any>>(apiConfig: T) {
  return {
    ...apiConfig,
    method_config: {
      queryParam: apiConfig.queryParam ?? "query",
    },
    auth_config:
      apiConfig.authType === "API_KEY_HEADER"
        ? { key: apiConfig.apiKeyHeader ?? "", value: apiConfig.apiKeyValue ?? "" }
        : apiConfig.authType === "BEARER_TOKEN"
          ? { token: apiConfig.bearerToken ?? "" }
          : apiConfig.authType === "BASIC_AUTH"
            ? { username: apiConfig.basicUser ?? "", password: apiConfig.basicPass ?? "" }
            : {},
    session_config:
      apiConfig.authType === "SESSION_LOGIN"
        ? {
          loginUrl: apiConfig.loginUrl ?? "",
          usernameField: apiConfig.usernameField ?? "",
          passwordField: apiConfig.passwordField ?? "",
          captchaEnabled: Boolean(apiConfig.captchaEnabled),
          sessionPolicy: apiConfig.sessionPolicy ?? "",
        }
        : {},
    rate_limit_config: {
      maxPerMinute: apiConfig.maxPerMinute ?? null,
      maxPerDay: apiConfig.maxPerDay ?? null,
      cooldownSeconds: apiConfig.cooldownSeconds ?? null,
    },
  };
}

function normalizeServiceLinksInput(links: unknown) {
  if (!Array.isArray(links)) return [];

  return links
    .filter((item): item is { apiId?: unknown; enabled?: unknown; priority?: unknown } => Boolean(item))
    .map((item, index) => ({
      apiId: String(item.apiId ?? "").trim(),
      enabled: typeof item.enabled === "boolean" ? item.enabled : true,
      priority: Number.isFinite(Number(item.priority)) ? Math.max(1, Math.trunc(Number(item.priority))) : index + 1,
    }))
    .filter((item) => item.apiId);
}

function normalizeApiServiceLinksInput(links: unknown) {
  if (!Array.isArray(links)) return [];

  return links
    .filter((item): item is { serviceId?: unknown; enabled?: unknown; priority?: unknown } => Boolean(item))
    .map((item, index) => ({
      serviceId: String(item.serviceId ?? "").trim(),
      enabled: typeof item.enabled === "boolean" ? item.enabled : true,
      priority: Number.isFinite(Number(item.priority)) ? Math.max(1, Math.trunc(Number(item.priority))) : index + 1,
    }))
    .filter((item) => item.serviceId);
}

async function replaceApiServiceMappings(tx: Prisma.TransactionClient, apiId: string, links: Array<{ serviceId: string; enabled: boolean; priority: number }>) {
  await tx.serviceApi.deleteMany({ where: { apiId } });
  if (!links.length) return;

  await tx.serviceApi.createMany({
    data: links.map((item) => ({
      apiId,
      serviceId: item.serviceId,
      enabled: item.enabled,
      priority: item.priority,
    })),
  });
}

async function listServicesWithMetrics() {
  const [services, searchStats] = await Promise.all([
    prisma.service.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        serviceApis: {
          include: {
            api: {
              select: {
                id: true,
                name: true,
                status: true,
                creditsPerSearch: true,
                supportsCnic: true,
                supportsPhone: true,
                supportsEngine: true,
                supportsChassis: true,
                supportsReg: true,
                supportsLicense: true,
              },
            },
          },
          orderBy: { priority: "asc" },
        },
      },
    }),
    prisma.searchHistory.groupBy({
      by: ["serviceId", "status"],
      where: { serviceId: { not: null } },
      _count: { _all: true },
      _sum: { cost: true },
      _max: { createdAt: true },
    }),
  ]);

  const metricsMap = new Map<
    string,
    {
      totalSearches: number;
      successSearches: number;
      errorSearches: number;
      blockedSearches: number;
      totalRevenueCredits: number;
      lastSearchAt: Date | null;
    }
  >();

  for (const row of searchStats) {
    if (!row.serviceId) continue;
    const current = metricsMap.get(row.serviceId) ?? {
      totalSearches: 0,
      successSearches: 0,
      errorSearches: 0,
      blockedSearches: 0,
      totalRevenueCredits: 0,
      lastSearchAt: null,
    };
    const count = row._count._all ?? 0;
    current.totalSearches += count;
    current.totalRevenueCredits += Number(row._sum.cost ?? 0);
    if (row.status === "success") current.successSearches += count;
    if (row.status === "error") current.errorSearches += count;
    if (row.status === "blocked") current.blockedSearches += count;
    if (row._max.createdAt && (!current.lastSearchAt || row._max.createdAt > current.lastSearchAt)) {
      current.lastSearchAt = row._max.createdAt;
    }
    metricsMap.set(row.serviceId, current);
  }

  return services.map((service) => {
    const metrics = metricsMap.get(service.id) ?? {
      totalSearches: 0,
      successSearches: 0,
      errorSearches: 0,
      blockedSearches: 0,
      totalRevenueCredits: 0,
      lastSearchAt: null,
    };
    const visibleServiceApis = service.serviceApis.filter((item) => !isInternalApiConfig(item.api));
    const activeLinks = visibleServiceApis.filter((item) => item.enabled && item.api.status);
    const runtimeCost = activeLinks.reduce((sum, item) => sum + (item.api.creditsPerSearch ?? 0), 0);

    return {
      ...service,
      serviceApis: visibleServiceApis,
      metrics: {
        ...metrics,
        successRate: metrics.totalSearches ? Number(((metrics.successSearches / metrics.totalSearches) * 100).toFixed(2)) : 0,
        mappedApis: visibleServiceApis.length,
        activeMappedApis: activeLinks.length,
        runtimeCost,
      },
    };
  });
}

function getRevenueTransactionWhere(dateRange: { gte?: Date; lte?: Date; lt?: Date }) {
  return {
    createdAt: dateRange,
    user: buildRevenueEligibleUserWhere(),
  };
}

async function notifyUser(input: {
  userId: string;
  category: string;
  title: string;
  message: string;
  meta?: Prisma.InputJsonValue;
}) {
  return upsertNotification({
    userId: input.userId,
    key: `admin-msg:${nanoid(12)}`,
    category: input.category,
    title: input.title,
    message: input.message,
    meta: input.meta,
  });
}

adminRouter.get("/api-health", async (_req: Request, res: Response) => {
  const items = await listApiHealth();
  res.json({ status: "success", items });
});

adminRouter.get("/realtime/health", async (_req: Request, res: Response) => {
  const payload = await getRealtimeHealthSummary();
  res.json({ status: "success", ...payload });
});

adminRouter.get("/realtime/search-throughput", async (_req: Request, res: Response) => {
  const payload = await getSearchThroughputSummary();
  res.json({ status: "success", ...payload });
});

adminRouter.get("/realtime/active-users", async (_req: Request, res: Response) => {
  const payload = await getActiveUsersSummary();
  res.json({ status: "success", ...payload });
});

adminRouter.get("/realtime/errors", async (_req: Request, res: Response) => {
  const payload = await getRealtimeErrorsSummary();
  res.json({ status: "success", ...payload });
});

adminRouter.get("/realtime/load", async (_req: Request, res: Response) => {
  const payload = await getRealtimeLoadSummary();
  res.json({ status: "success", ...payload });
});

adminRouter.get("/exports/users.csv", async (req: Request, res: Response) => {
  const query = z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
      role: z.string().optional(),
      status: z.string().optional(),
      billingType: z.string().optional(),
      resellerId: z.string().optional(),
    })
    .parse(req.query);

  await exportUsersCsv(res, {
    from: parseDateInput(query.from),
    to: parseDateInput(query.to),
    role: query.role,
    status: query.status,
    billingType: query.billingType,
    resellerId: query.resellerId,
  });
});

adminRouter.get("/exports/transactions.csv", async (req: Request, res: Response) => {
  const query = z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
      userId: z.string().optional(),
      resellerId: z.string().optional(),
      billingType: z.string().optional(),
    })
    .parse(req.query);

  await exportTransactionsCsv(res, {
    from: parseDateInput(query.from),
    to: parseDateInput(query.to),
    userId: query.userId,
    resellerId: query.resellerId,
    billingType: query.billingType,
  });
});

adminRouter.get("/exports/activity.csv", async (req: Request, res: Response) => {
  const query = z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
      userId: z.string().optional(),
      resellerId: z.string().optional(),
      billingType: z.string().optional(),
      service: z.string().optional(),
      type: z.string().optional(),
    })
    .parse(req.query);

  await exportActivityCsv(res, {
    from: parseDateInput(query.from),
    to: parseDateInput(query.to),
    userId: query.userId,
    resellerId: query.resellerId,
    billingType: query.billingType,
    service: query.service,
    type: query.type,
  });
});

adminRouter.get("/exports/api-performance.csv", async (_req: Request, res: Response) => {
  await exportApiPerformanceCsv(res);
});

adminRouter.get("/exports/revenue.csv", async (req: Request, res: Response) => {
  const query = z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
      userId: z.string().optional(),
      resellerId: z.string().optional(),
      billingType: z.string().optional(),
      groupBy: z.enum(["transaction", "day", "month"]).optional(),
    })
    .parse(req.query);

  await exportRevenueCsv(res, {
    from: parseDateInput(query.from),
    to: parseDateInput(query.to),
    userId: query.userId,
    resellerId: query.resellerId,
    billingType: query.billingType,
    groupBy: query.groupBy,
  });
});

adminRouter.post("/api-health/:id/toggle", async (req: Request, res: Response) => {
  const body = z
    .object({
      serviceId: z.string().optional(),
      enabled: z.boolean().optional(),
    })
    .parse(req.body ?? {});

  const item = await toggleApiHealth({
    apiId: req.params.id,
    serviceId: body.serviceId,
    enabled: body.enabled,
  });

  res.json({ status: "success", item });
});

adminRouter.post("/api-health/:id/priority", async (req: Request, res: Response) => {
  const body = z
    .object({
      priority: z.number().int().min(1),
      serviceId: z.string().optional(),
    })
    .parse(req.body ?? {});

  const item = await updateApiPriority({
    apiId: req.params.id,
    priority: body.priority,
    serviceId: body.serviceId,
  });

  res.json({ status: "success", item });
});

adminRouter.post("/api-health/:id/probe", async (req: Request, res: Response) => {
  const body = z
    .object({
      query: z.string().min(1).optional(),
    })
    .parse(req.body ?? {});

  const item = await probeApiHealth({
    apiId: req.params.id,
    query: body.query,
  });

  res.json({ status: "success", item });
});

adminRouter.get("/stats", async (_req: Request, res: Response) => {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const [totalUsers, activeUsers, activeApis, searchesToday, revenueToday] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.apiConfig.count({ where: { status: true } }),
    prisma.searchHistory.count({ where: { createdAt: { gte: since } } }),
    prisma.transaction.aggregate({ where: getRevenueTransactionWhere({ gte: since }), _sum: { amountPkr: true } })
  ]);

  // last 12 months revenue (PKR)
  const now = new Date();
  const months: { label: string; value: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const sum = await prisma.transaction.aggregate({ where: getRevenueTransactionWhere({ gte: start, lt: end }), _sum: { amountPkr: true } });
    const label = start.toLocaleString("en-US", { month: "short" });
    months.push({ label, value: Number(sum._sum.amountPkr ?? 0) });
  }

  res.json({
    status: "success",
    stats: {
      totalUsers,
      activeUsers,
      activeApis,
      searchesToday,
      revenueToday: Number(revenueToday._sum.amountPkr ?? 0),
      monthlyRevenue: months
    }
  });
});

// New metrics endpoints (preferred by frontend)
adminRouter.get("/metrics/summary", async (_req: Request, res: Response) => {
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const [totalUsers, activeUsers, activeServices, revenueToday] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.service.count({ where: { status: true } }),
    prisma.transaction.aggregate({ where: getRevenueTransactionWhere({ gte: since }), _sum: { amountPkr: true } })
  ]);

  res.json({
    status: "success",
    summary: {
      totalUsers,
      activeUsers,
      activeServices,
      revenueToday: Number(revenueToday._sum.amountPkr ?? 0)
    }
  });
});

adminRouter.get("/metrics/revenue-12m", async (_req: Request, res: Response) => {
  const now = new Date();
  const months: { label: string; value: number; isoMonth: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const sum = await prisma.transaction.aggregate({
      where: getRevenueTransactionWhere({ gte: start, lt: end }),
      _sum: { amountPkr: true }
    });
    const label = start.toLocaleString("en-US", { month: "short" });
    const isoMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    months.push({ label, isoMonth, value: Number(sum._sum.amountPkr ?? 0) });
  }
  res.json({ status: "success", months });
});

adminRouter.get("/metrics/today", async (_req: Request, res: Response) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const total = await prisma.transaction.aggregate({
    where: getRevenueTransactionWhere({ gte: start, lte: end }),
    _sum: { amountPkr: true },
    _count: { id: true }
  });

  res.json({
    status: "success",
    today: {
      revenuePkr: total._sum?.amountPkr ?? 0,
      transactions: total._count?.id ?? 0,
      date: start.toISOString().slice(0, 10)
    }
  });
});


/** USERS CRUD (minimal) */
adminRouter.get("/users", async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true, role: true, status: true, credits: true, expireAt: true, resellerId: true }
  });
  res.json({ status: "success", users });
});

adminRouter.post("/users", async (req: Request, res: Response) => {
  const body = z.object({
    email: z.string().email(),
    name: z.string().min(2).max(80),
    password: z.string().min(8).max(128).optional(),
    passwordHash: z.string().min(10).optional(),
    role: z.enum(["ADMIN", "RESELLER", "USER"]),
    credits: z.number().int().min(0).default(0),
    expireAt: z.string().datetime().optional(),
    resellerId: z.string().optional()
  }).parse(req.body);

  const passwordHash = body.passwordHash
    ? (body.passwordHash.startsWith("$2") ? body.passwordHash : await bcrypt.hash(body.passwordHash, 12))
    : (body.password ? await bcrypt.hash(body.password, 12) : null);

  if (!passwordHash) throw new HttpError(400, "BAD_REQUEST", "Password required");

  const u = await prisma.user.create({
    data: {
      email: body.email.toLowerCase(),
      name: body.name,
      passwordHash,
      role: body.role,
      credits: body.credits,
      expireAt: body.expireAt ? new Date(body.expireAt) : null,
      resellerId: body.resellerId ?? null,
      status: "ACTIVE"
    }
  });
  res.json({ status: "success", user: { id: u.id } });
});

adminRouter.post("/users/:id/reset-device", async (req: Request, res: Response) => {
  const item = await resetUserDevice({
    userId: req.params.id,
    actorId: ((req as any).auth as { sub: string }).sub,
    ip: (req as any).clientIp ?? "unknown",
  });
  res.json({ status: "success", item });
});

/** API Access Keys (JWT) */
adminRouter.get("/api-keys", async (_req: Request, res: Response) => {
  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, email: true, name: true, role: true } } }
  });
  res.json({ status: "success", keys });
});

adminRouter.post("/api-keys", async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const ip = (req as any).clientIp ?? "unknown";

  const body = z
    .object({
      userId: z.string().min(10),
      name: z.string().min(2).max(60),
      scopes: z.string().min(3).default("search:read"),
    })
    .parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: body.userId } });
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");

  const jti = nanoid(24);
  const token = signApiKeyJwt(user.id, user.role, jti, body.scopes);
  const key = await prisma.apiKey.create({ data: { userId: user.id, name: body.name, jti, scopes: body.scopes } });

  await prisma.adminAudit.create({
    data: { actorId: auth.sub, action: "ADMIN_CREATE_API_KEY", ip, meta: { apiKeyId: key.id, userId: user.id, scopes: body.scopes } },
  });

  // Token is only returned once
  res.json({ status: "success", apiKey: key, token });
});

adminRouter.delete("/api-keys/:id", async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const ip = (req as any).clientIp ?? "unknown";
  const id = req.params.id;
  const key = await prisma.apiKey.findUnique({ where: { id } });
  if (!key) throw new HttpError(404, "NOT_FOUND", "API key not found");
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await prisma.adminAudit.create({ data: { actorId: auth.sub, action: "ADMIN_REVOKE_API_KEY", ip, meta: { apiKeyId: id } } });
  res.json({ status: "success" });
});

/** API Management */
adminRouter.get("/apis", async (_req: Request, res: Response) => {
  const apis = await prisma.apiConfig.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      serviceApis: {
        include: {
          service: {
            select: {
              id: true,
              name: true,
              status: true,
              type: true,
            },
          },
        },
        orderBy: { priority: "asc" },
      },
    },
  });
  const items = apis.filter((item) => !isInternalApiConfig(item)).map((item) => withApiComputedConfig(item));
  res.json({ status: "success", apis: items });
});

adminRouter.post("/apis", async (req: Request, res: Response) => {
  const body = z.object({
    name: z.string().min(2),
    method: z.enum(["GET", "POST"]),
    baseUrl: z.string().url(),
    endpoint: z.string().optional().default(""),
    queryParam: z.string().min(1).optional(),
    description: z.string().optional(),
    authType: z.enum(["NONE", "API_KEY_HEADER", "BEARER_TOKEN", "BASIC_AUTH", "SESSION_LOGIN", "OAUTH2"]).default("NONE"),
    apiKeyHeader: z.string().optional(),
    apiKeyValue: z.string().optional(),
    bearerToken: z.string().optional(),
    basicUser: z.string().optional(),
    basicPass: z.string().optional(),

    supportsCnic: z.boolean().default(false),
    supportsPhone: z.boolean().default(false),
    supportsEngine: z.boolean().default(false),
    supportsChassis: z.boolean().default(false),
    supportsReg: z.boolean().default(false),
    supportsLicense: z.boolean().default(false),
    customRegex: z.string().optional(),

    creditsPerSearch: z.number().int().min(0).default(1),
    allowUser: z.boolean().default(true),
    allowReseller: z.boolean().default(true),
    allowAdmin: z.boolean().default(true),
    status: z.boolean().default(true),
    sampleQuery: z.string().optional(),
    auth_config: z.record(z.string(), z.any()).optional(),
    session_config: z.object({
      loginUrl: z.string().url().optional(),
      usernameField: z.string().min(1).optional(),
      passwordField: z.string().min(1).optional(),
      captchaEnabled: z.boolean().optional(),
      sessionPolicy: z.string().min(1).optional(),
    }).optional(),
    method_config: z.object({
      queryParam: z.string().min(1),
    }).optional(),
    rate_limit_config: z.object({
      maxPerMinute: z.number().int().min(1).nullable().optional(),
      maxPerDay: z.number().int().min(1).nullable().optional(),
      cooldownSeconds: z.number().int().min(0).nullable().optional(),
    }).optional(),
    loginUrl: z.string().url().optional(),
    usernameField: z.string().min(1).optional(),
    passwordField: z.string().min(1).optional(),
    captchaEnabled: z.boolean().optional(),
    sessionPolicy: z.string().min(1).optional(),
    maxPerMinute: z.number().int().min(1).nullable().optional(),
    maxPerDay: z.number().int().min(1).nullable().optional(),
    cooldownSeconds: z.number().int().min(0).nullable().optional(),
    serviceLinks: z.array(z.object({
      serviceId: z.string().min(1),
      enabled: z.boolean().optional(),
      priority: z.number().int().min(1).optional(),
    })).optional(),
  }).parse(req.body);

  const normalizedServiceLinks = normalizeApiServiceLinksInput(body.serviceLinks);
  const api = await prisma.$transaction(async (tx) => {
    const created = await tx.apiConfig.create({ data: buildApiPayload(body) });
    if (normalizedServiceLinks.length) {
      await replaceApiServiceMappings(tx, created.id, normalizedServiceLinks);
    }
    return tx.apiConfig.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        serviceApis: {
          include: { service: { select: { id: true, name: true, status: true, type: true } } },
          orderBy: { priority: "asc" },
        },
      },
    });
  });
  if (!normalizedServiceLinks.length) {
    await syncApiMappingsForApi(api.id);
  }
  const mappedApi = await prisma.apiConfig.findUniqueOrThrow({
    where: { id: api.id },
    include: {
      serviceApis: {
        include: { service: { select: { id: true, name: true, status: true, type: true } } },
        orderBy: { priority: "asc" },
      },
    },
  });
  res.json({ status: "success", api: withApiComputedConfig(mappedApi) });
});

adminRouter.put("/apis/:id", async (req: Request, res: Response) => {
  const id = req.params.id;
  const body = z.record(z.any()).parse(req.body);
  const normalizedServiceLinks = normalizeApiServiceLinksInput(body.serviceLinks);
  await prisma.$transaction(async (tx) => {
    await tx.apiConfig.update({ where: { id }, data: buildApiPayload(body) });
    if (normalizedServiceLinks.length) {
      await replaceApiServiceMappings(tx, id, normalizedServiceLinks);
    }
  });
  if (!normalizedServiceLinks.length) {
    await syncApiMappingsForApi(id);
  }
  const mappedApi = await prisma.apiConfig.findUniqueOrThrow({
    where: { id },
    include: {
      serviceApis: {
        include: { service: { select: { id: true, name: true, status: true, type: true } } },
        orderBy: { priority: "asc" },
      },
    },
  });
  res.json({ status: "success", api: withApiComputedConfig(mappedApi) });
});

adminRouter.post("/apis/sync-mappings", async (_req: Request, res: Response) => {
  const summary = await syncManagedApiMappings();
  res.json({ status: "success", summary });
});

adminRouter.post("/apis/:id/test", async (req: Request, res: Response) => {
  const id = req.params.id;
  const body = z.object({ query: z.string().min(1) }).parse(req.body);
  const api = await prisma.apiConfig.findUnique({ where: { id } });
  if (!api) throw new HttpError(404, "NOT_FOUND", "API not found");

  const result = await runApiCall(api, body.query);
  res.json({ status: "success", result });
});

/** Service Management (minimal) */
adminRouter.get("/services", async (_req: Request, res: Response) => {
  const services = await listServicesWithMetrics();
  res.json({ status: "success", services });
});

adminRouter.post("/services", async (req: Request, res: Response) => {
  const body = z.object({
    name: z.string().min(2),
    description: z.string().optional(),
    icon: z.string().optional(),
    type: z.string().default("Search"),
    status: z.boolean().default(true),
    defaultCost: z.number().int().min(0).default(1),
    apiIds: z.array(z.string()).default([]),
    links: z.array(z.object({
      apiId: z.string().min(1),
      enabled: z.boolean().optional(),
      priority: z.number().int().min(1).optional(),
    })).optional(),
  }).parse(req.body);

  const normalizedLinks = body.links?.length
    ? normalizeServiceLinksInput(body.links)
    : body.apiIds.map((apiId, idx) => ({ apiId, enabled: true, priority: idx + 1 }));

  const service = await prisma.service.create({
    data: {
      name: body.name,
      description: body.description,
      icon: body.icon,
      type: body.type,
      status: body.status,
      defaultCost: body.defaultCost,
      serviceApis: { create: normalizedLinks.map((item) => ({ apiId: item.apiId, priority: item.priority, enabled: item.enabled })) }
    },
    include: { serviceApis: { include: { api: true }, orderBy: { priority: "asc" } } }
  });

  res.json({
    status: "success",
    service: {
      ...service,
      serviceApis: service.serviceApis.filter((item) => !isInternalApiConfig(item.api)),
    },
  });
});

// Update service including API assignments (used by Admin API Management matrix UI)
adminRouter.put("/services/:id", async (req: Request, res: Response) => {
  const id = req.params.id;
  const body = z
    .object({
      name: z.string().min(2).optional(),
      description: z.string().optional().nullable(),
      icon: z.string().optional().nullable(),
      type: z.string().optional(),
      status: z.boolean().optional(),
      defaultCost: z.number().int().min(0).optional(),
      apiIds: z.array(z.string()).optional(),
      links: z.array(z.object({
        apiId: z.string().min(1),
        enabled: z.boolean().optional(),
        priority: z.number().int().min(1).optional(),
      })).optional(),
    })
    .parse(req.body);

  const existing = await prisma.service.findUnique({ where: { id }, include: { serviceApis: true } });
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Service not found");

  const normalizedLinks = body.links
    ? normalizeServiceLinksInput(body.links)
    : Array.isArray(body.apiIds)
      ? body.apiIds.map((apiId, idx) => ({ apiId, enabled: true, priority: idx + 1 }))
      : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    if (Array.isArray(normalizedLinks)) {
      await tx.serviceApi.deleteMany({ where: { serviceId: id } });
      if (normalizedLinks.length) {
        await tx.serviceApi.createMany({
          data: normalizedLinks.map((item) => ({
            serviceId: id,
            apiId: item.apiId,
            priority: item.priority,
            enabled: item.enabled,
          })),
        });
      }
    }

    return tx.service.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description ?? undefined,
        icon: body.icon ?? undefined,
        type: body.type,
        status: body.status,
        defaultCost: body.defaultCost,
      },
      include: { serviceApis: { include: { api: true }, orderBy: { priority: "asc" } } },
    });
  });

  res.json({
    status: "success",
    service: {
      ...updated,
      serviceApis: updated.serviceApis.filter((item) => !isInternalApiConfig(item.api)),
    },
  });
});


adminRouter.get("/recent-searches", async (_req: Request, res: Response) => {
  const rows = await prisma.searchHistory.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { user: { select: { id: true, email: true, name: true } }, service: { select: { name: true } } }
  });
  const resolveServiceName = (row: (typeof rows)[number]) => {
    const direct = row.service?.name?.trim();
    if (direct) return direct;

    const payload = row.results as any;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const explicit = [payload.serviceName, payload.service, payload.service_name].find((value) => typeof value === "string" && value.trim());
      if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
      if (Array.isArray(payload.results)) {
        const sourceName = payload.results.find((item: any) => typeof item?.apiName === "string" && item.apiName.trim())?.apiName;
        if (typeof sourceName === "string" && sourceName.trim()) return sourceName.trim();
      }
    }

    if (Array.isArray(payload)) {
      const sourceName = payload.find((item: any) => typeof item?.apiName === "string" && item.apiName.trim())?.apiName;
      if (typeof sourceName === "string" && sourceName.trim()) return sourceName.trim();
    }

    return row.detectedType || "Unknown";
  };
  res.json({
    status: "success", items: rows.map(r => ({
      id: r.id,
      user: r.user,
      userName: r.user?.name ?? r.user?.email ?? "Unknown user",
      query: r.query,
      service: resolveServiceName(r),
      searchedService: resolveServiceName(r),
      status: r.status,
      ip: r.ip,
      createdAt: r.createdAt
    }))
  });
});

adminRouter.get(["/search-history", "/user-logs"], async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    prisma.searchHistory.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
        service: { select: { name: true } },
      },
    }),
    prisma.searchHistory.count(),
  ]);

  const resolveServiceName = (row: (typeof rows)[number]) => {
    const direct = row.service?.name?.trim();
    if (direct) return direct;

    const payload = row.results as any;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const explicit = [payload.serviceName, payload.service, payload.service_name].find((value) => typeof value === "string" && value.trim());
      if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
      if (Array.isArray(payload.results)) {
        const sourceName = payload.results.find((item: any) => typeof item?.apiName === "string" && item.apiName.trim())?.apiName;
        if (typeof sourceName === "string" && sourceName.trim()) return sourceName.trim();
      }
    }

    if (Array.isArray(payload)) {
      const sourceName = payload.find((item: any) => typeof item?.apiName === "string" && item.apiName.trim())?.apiName;
      if (typeof sourceName === "string" && sourceName.trim()) return sourceName.trim();
    }

    return row.detectedType || "Unknown";
  };

  res.json({
    status: "success",
    page,
    limit,
    total,
    items: rows.map((r) => ({
      id: r.id,
      user: r.user,
      userName: r.user?.name ?? r.user?.email ?? "Unknown user",
      userEmail: r.user?.email ?? null,
      query: r.query,
      detectedType: r.detectedType,
      status: r.status,
      cost: r.cost,
      ip: r.ip,
      service: resolveServiceName(r),
      searchedService: resolveServiceName(r),
      createdAt: r.createdAt,
      dateTime: r.createdAt,
    })),
  });
});

adminRouter.get("/top-users", async (_req: Request, res: Response) => {
  const grouped = await prisma.searchHistory.groupBy({
    by: ["userId"],
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
    take: 5
  });
  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map(g => g.userId) } },
    select: { id: true, name: true, email: true }
  });
  const byId = new Map(users.map(u => [u.id, u]));
  res.json({
    status: "success",
    items: grouped.map(g => ({
      user: byId.get(g.userId),
      searches: ((g._count && (g._count as any).id) ?? 0)
    }))
  });
});


function isArray(x: any): x is any[] { return Array.isArray(x); }


// ===== API delete/toggle (ensure exist) =====
adminRouter.delete("/apis/:id", async (req, res) => {
  const { id } = req.params;

  // FK fix: unlink service mappings first
  await prisma.$transaction([
    prisma.serviceApi.deleteMany({ where: { apiId: id } }),
    prisma.apiConfig.delete({ where: { id } })
  ]);

  res.json({ status: "success" });
});

adminRouter.post("/apis/:id/toggle", async (req, res) => {
  const { id } = req.params;
  const a = await prisma.apiConfig.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, "NOT_FOUND", "API not found");
  const item = await prisma.apiConfig.update({ where: { id }, data: { status: !a.status } });
  res.json({ status: "success", item });
});




// ===== Services: toggle + delete + matrix + mapping =====

// Toggle service status
adminRouter.post("/services/:id/toggle", async (req, res) => {
  const { id } = req.params;
  const s = await prisma.service.findUnique({ where: { id } });
  if (!s) throw new HttpError(404, "NOT_FOUND", "Service not found");
  const item = await prisma.service.update({ where: { id }, data: { status: !s.status } });
  res.json({ status: "success", item });
});

// Delete service safely (unlink dependencies first)
adminRouter.delete("/services/:id", async (req, res) => {
  const { id } = req.params;

  await prisma.$transaction([
    prisma.serviceApi.deleteMany({ where: { serviceId: id } }),
    prisma.userServiceAccess.deleteMany({ where: { serviceId: id } }),
    // keep history but detach service reference
    prisma.searchHistory.updateMany({ where: { serviceId: id }, data: { serviceId: null } }),
    prisma.service.delete({ where: { id } }),
  ]);

  res.json({ status: "success" });
});

// Matrix: services + apis + links (for UI)
adminRouter.get("/service-api-matrix", async (_req, res) => {
  const [services, apis, links] = await Promise.all([
    listServicesWithMetrics(),
    prisma.apiConfig.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.serviceApi.findMany(),
  ]);
  const hiddenApiIds = new Set(apis.filter((api) => isInternalApiConfig(api)).map((api) => api.id));
  res.json({
    status: "success",
    services,
    apis: apis.filter((api) => !hiddenApiIds.has(api.id)),
    links: links.filter((link) => !hiddenApiIds.has(link.apiId)),
  });
});

// Replace mappings for a service (supports enabled/priority)
adminRouter.put("/services/:id/apis", async (req, res) => {
  const { id } = req.params;
  const links = (req.body?.links ?? []) as Array<{ apiId: string; enabled?: boolean; priority?: number }>;

  // normalize
  const cleaned = links
    .filter((x) => x?.apiId)
    .map((x) => ({ apiId: x.apiId, enabled: x.enabled ?? true, priority: x.priority ?? 1 }));

  await prisma.$transaction(async (tx) => {
    // remove old
    await tx.serviceApi.deleteMany({ where: { serviceId: id } });
    // create new
    if (cleaned.length) {
      await tx.serviceApi.createMany({
        data: cleaned.map((x) => ({ serviceId: id, apiId: x.apiId, enabled: x.enabled, priority: x.priority })),
      });
    }
  });

  const service = await prisma.service.findUnique({
    where: { id },
    include: { serviceApis: { include: { api: true } } },
  });

  res.json({
    status: "success",
    service: service
      ? {
          ...service,
          serviceApis: service.serviceApis.filter((item) => !isInternalApiConfig(item.api)),
        }
      : null,
  });
});



// ===== Per-user Service Access (Admin) =====
adminRouter.get("/users/:id/services", async (req, res) => {
  const userId = req.params.id;

  const [services, overrides] = await Promise.all([
    prisma.service.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.userServiceAccess.findMany({ where: { userId } }),
  ]);

  const map = new Map(overrides.map(o => [o.serviceId, o.allowed]));
  const items = services.map(s => ({
    id: s.id,
    name: s.name,
    status: s.status,
    defaultAllowed: true,
    allowed: map.has(s.id) ? !!map.get(s.id) : true
  }));

  res.json({ status: "success", items });
});

// Save deny-list (recommended): only store overrides for denied services
adminRouter.put("/users/:id/services", async (req, res) => {
  const userId = req.params.id;
  const denied = (req.body?.deniedServiceIds ?? []) as string[];

  await prisma.$transaction(async (tx) => {
    await tx.userServiceAccess.deleteMany({ where: { userId } });
    if (denied.length) {
      await tx.userServiceAccess.createMany({
        data: denied.map((serviceId) => ({ userId, serviceId, allowed: false })),
      });
    }
  });

  res.json({ status: "success" });
});

adminRouter.get("/transactions", async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  const skip = (page - 1) * limit;
  const from = parseDateInput(req.query.from);
  const to = parseDateInput(req.query.to);
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  const resellerId = typeof req.query.resellerId === "string" ? req.query.resellerId : undefined;
  const billingType = typeof req.query.billingType === "string" ? req.query.billingType : undefined;

  const where = {
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(userId ? { userId } : {}),
    ...(resellerId || billingType
      ? {
        user: {
          ...(resellerId ? { resellerId } : {}),
          ...(billingType ? { billingType } : {}),
        },
      }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { user: { select: { id: true, email: true, name: true, role: true, billingType: true, revenueExcluded: true } } }
    }),
    prisma.transaction.count({ where })
  ]);

  res.json({ status: "success", page, limit, total, items });
});

adminRouter.get("/activity-logs", async (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 50);
  const items = await listActivityLogs({ limit });
  res.json({ status: "success", items });
});

adminRouter.get("/api-error-logs", async (_req: Request, res: Response) => {
  const payload = await getRealtimeErrorsSummary();
  const items = payload.items.filter((item) => item.scope === "api.execution");
  res.json({
    status: "success",
    summary: {
      total: items.length,
      errors: items.filter((item) => item.severity === "error").length,
      warnings: items.filter((item) => item.severity === "warn").length,
      windowMinutes: payload.summary.windowMinutes,
    },
    items,
    generatedAt: payload.generatedAt,
  });
});

adminRouter.get("/audit/admin-actions", async (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 50);
  const items = await listAdminActions({ limit });
  res.json({ status: "success", items });
});

adminRouter.get("/audit/security-events", async (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 50);
  const payload = await listSecurityEvents({ limit });
  res.json({ status: "success", ...payload });
});


adminRouter.get("/metrics/overview-v2", async (_req: Request, res: Response) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);

  const [usersTotal, usersActive, apisTotal, apisActive, svcsTotal, svcsActive, txAgg, coinsAgg] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.apiConfig.count(),
    prisma.apiConfig.count({ where: { status: true } }),
    prisma.service.count(),
    prisma.service.count({ where: { status: true } }),
    prisma.transaction.aggregate({
      where: { createdAt: { gte: start, lte: end }, user: buildRevenueEligibleUserWhere() },
      _sum: { amountPkr: true },
      _count: { id: true },
    }),
    prisma.transaction.aggregate({
      where: { createdAt: { gte: start, lte: end }, user: buildRevenueEligibleUserWhere() },
      _sum: { coins: true },
    }),
  ]);

  res.json({
    status: "success",
    users: { total: usersTotal, active: usersActive },
    apis: { total: apisTotal, active: apisActive },
    services: { total: svcsTotal, active: svcsActive },
    today: {
      transactionsCount: txAgg._count?.id ?? 0,
      revenuePkr: txAgg._sum?.amountPkr ?? 0,
      coinsSold: coinsAgg._sum?.coins ?? 0,
    },
  });
});

adminRouter.get("/users-full", async (_req: Request, res: Response) => {
  const items = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      credits: true,
      expireAt: true,
      resellerId: true,
      billingType: true,
      revenueExcluded: true,
      monthlyPackageCoins: true,
      createdAt: true
    }
  });
  res.json({ status: "success", items });
});

adminRouter.post("/users-full", async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const ip = (req as any).clientIp ?? "unknown";
  const body = z.object({
    email: z.string().email(),
    name: z.string().min(2).max(80),
    password: z.string().min(8).max(128).optional(),
    passwordHash: z.string().min(10).optional(),
    role: z.enum(["ADMIN", "RESELLER", "USER"]).default("USER"),
    status: z.enum(["ACTIVE", "SUSPENDED", "BLACKLISTED", "INACTIVE"]).default("ACTIVE"),
    credits: z.number().int().min(0).default(0),
    expireAt: z.string().datetime().optional(),
    resellerId: z.string().optional(),
    billingType: z.enum(["PAID", "FREE", "DEMO"]).default("PAID"),
    revenueExcluded: z.boolean().optional(),
    monthlyPackageCoins: z.number().int().min(0).default(0),
  }).parse(req.body);

  const passwordHash = body.passwordHash
    ? (body.passwordHash.startsWith("$2") ? body.passwordHash : await bcrypt.hash(body.passwordHash, 12))
    : (body.password ? await bcrypt.hash(body.password, 12) : null);

  if (!passwordHash) throw new HttpError(400, "BAD_REQUEST", "Password required");

  const billingType = normalizeBillingType(body.billingType);
  const revenueExcluded = resolveRevenueExcluded(billingType, body.revenueExcluded);
  const credits = getInitialCreditsForBillingType(billingType, body.credits);

  const item = await prisma.user.create({
    data: {
      email: body.email.toLowerCase(),
      name: body.name,
      passwordHash,
      role: body.role,
      status: body.status as any,
      credits,
      expireAt: body.expireAt ? new Date(body.expireAt) : null,
      resellerId: body.resellerId ?? null,
      billingType,
      revenueExcluded,
      monthlyPackageCoins: body.monthlyPackageCoins,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      credits: true,
      expireAt: true,
      resellerId: true,
      billingType: true,
      revenueExcluded: true,
      monthlyPackageCoins: true,
      createdAt: true,
    },
  });

  await recordAdminAction({
    actorId: auth.sub,
    action: "ADMIN_CREATE_USER_FULL",
    ip,
    meta: {
      userId: item.id,
      billingType,
      revenueExcluded,
      credits,
      monthlyPackageCoins: item.monthlyPackageCoins,
    },
  });

  res.json({ status: "success", item });
});

adminRouter.post("/users-full/:id/status", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const auth = (req as any).auth as { sub: string };
  const ip = (req as any).clientIp ?? "unknown";
  const current = await prisma.user.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!current) return res.status(404).json({ status: "error", message: "User not found" });
  const next = current.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  const item = await prisma.user.update({ where: { id }, data: { status: next as any } });
  await recordAdminAction({
    actorId: auth.sub,
    action: "ADMIN_SET_USER_STATUS",
    ip,
    meta: { userId: id, from: current.status, to: next },
  });
  res.json({ status: "success", item });
});

adminRouter.post("/users-full/:id/add-coins", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const auth = (req as any).auth as { sub: string };
  const ip = (req as any).clientIp ?? "unknown";
  const coins = Number(req.body?.coins || 0);
  const mode = String(req.body?.mode || "FREE").toUpperCase();
  if (coins <= 0) return res.status(400).json({ status: "error", message: "coins must be > 0" });

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, credits: true, revenueExcluded: true, billingType: true }
  });
  if (!user) return res.status(404).json({ status: "error", message: "User not found" });

  const item = await prisma.user.update({
    where: { id },
    data: { credits: (user.credits || 0) + coins }
  });

  if (mode === "PAID" && isRevenueEligibleUser(user)) {
    await prisma.transaction.create({
      data: { userId: id, amountPkr: coins * 10, coins, note: "PAID_COINS" }
    });
  }

  await prisma.creditLog.create({
    data: {
      userId: id,
      delta: coins,
      reason: `Admin add coins (${mode})`,
      actorId: auth.sub,
    },
  });
  await recordAdminAction({
    actorId: auth.sub,
    action: "ADMIN_ADD_COINS",
    ip,
    meta: { userId: id, coins, mode },
  });

  res.json({ status: "success", item });
});

adminRouter.post("/users-full/:id/extend-expiry", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const auth = (req as any).auth as { sub: string };
  const ip = (req as any).clientIp ?? "unknown";
  const days = Number(req.body?.days || 30);
  if (days <= 0) return res.status(400).json({ status: "error", message: "days must be > 0" });

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, expireAt: true } });
  if (!user) return res.status(404).json({ status: "error", message: "User not found" });

  const base = user.expireAt ? new Date(user.expireAt) : new Date();
  base.setDate(base.getDate() + days);

  const item = await prisma.user.update({ where: { id }, data: { expireAt: base } });
  await recordAdminAction({
    actorId: auth.sub,
    action: "ADMIN_EXTEND_EXPIRY",
    ip,
    meta: { userId: id, days, expireAt: base.toISOString() },
  });
  res.json({ status: "success", item });
});

adminRouter.post("/users-full/:id/renew-package", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const auth = (req as any).auth as { sub: string };
  const ip = (req as any).clientIp ?? "unknown";
  const body = z
    .object({
      packageCode: z.enum(["MONTHLY_30", "DAYS_15", "WEEKLY_7", "DEMO_1"]),
    })
    .parse(req.body ?? {});

  const pack = RENEW_PACKAGE_CONFIG[body.packageCode as RenewPackageCode];
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      credits: true,
      expireAt: true,
      billingType: true,
      revenueExcluded: true,
    },
  });
  if (!user) return res.status(404).json({ status: "error", message: "User not found" });

  const now = new Date();
  const hasActivePackage = !user.expireAt || user.expireAt.getTime() >= now.getTime();
  const renewalBase = hasActivePackage && user.expireAt ? new Date(user.expireAt) : now;
  const nextExpireAt = new Date(renewalBase.getTime() + pack.days * 24 * 60 * 60 * 1000);
  const nextCredits = hasActivePackage ? (user.credits ?? 0) + pack.coins : pack.coins;
  const nextBillingType = body.packageCode === "DEMO_1" ? "DEMO" : "PAID";
  const nextRevenueExcluded = resolveRevenueExcluded(nextBillingType, false);

  const item = await prisma.$transaction(async (tx) => {
    if (!hasActivePackage && (user.credits ?? 0) > 0) {
      await tx.creditLog.create({
        data: {
          userId: id,
          delta: -(user.credits ?? 0),
          reason: "Old coins expired before package renewal",
          actorId: auth.sub,
        },
      });
    }

    const updated = await tx.user.update({
      where: { id },
      data: {
        credits: nextCredits,
        expireAt: nextExpireAt,
        status: "ACTIVE",
        billingType: nextBillingType,
        revenueExcluded: nextRevenueExcluded,
        monthlyPackageCoins: pack.coins,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        credits: true,
        expireAt: true,
        resellerId: true,
        billingType: true,
        revenueExcluded: true,
        monthlyPackageCoins: true,
        createdAt: true,
      },
    });

    await tx.creditLog.create({
      data: {
        userId: id,
        delta: pack.coins,
        reason: `Package renewed (${pack.label})`,
        actorId: auth.sub,
      },
    });

    if (nextBillingType === "PAID" && isRevenueEligibleUser(updated)) {
      await tx.transaction.create({
        data: {
          userId: id,
          amountPkr: pack.coins * 10,
          coins: pack.coins,
          note: `PACKAGE_RENEWAL_${body.packageCode}`,
        },
      });
    }

    return updated;
  });

  await recordAdminAction({
    actorId: auth.sub,
    action: "ADMIN_RENEW_PACKAGE",
    ip,
    meta: {
      userId: id,
      packageCode: body.packageCode,
      packageDays: pack.days,
      packageCoins: pack.coins,
      carryForward: hasActivePackage,
      previousCredits: user.credits ?? 0,
      nextCredits: item.credits ?? 0,
      nextExpireAt: item.expireAt ? item.expireAt.toISOString() : null,
    },
  });

  res.json({ status: "success", item });
});

adminRouter.post("/notifications/send", async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const ip = (req as any).clientIp ?? "unknown";
  const body = z.object({
    targetType: z.enum(["USER", "ROLE", "ALL_USERS"]),
    userId: z.string().optional(),
    role: z.enum(["ADMIN", "RESELLER", "USER"]).optional(),
    category: z.enum(["UPDATE", "BONUS", "MESSAGE"]).default("MESSAGE"),
    title: z.string().min(2).max(120),
    message: z.string().min(2).max(1000),
  }).parse(req.body);

  let users: Array<{ id: string }> = [];

  if (body.targetType === "USER") {
    if (!body.userId) throw new HttpError(400, "BAD_REQUEST", "userId is required");
    users = await prisma.user.findMany({
      where: { id: body.userId },
      select: { id: true },
      take: 1,
    });
  } else if (body.targetType === "ROLE") {
    if (!body.role) throw new HttpError(400, "BAD_REQUEST", "role is required");
    users = await prisma.user.findMany({
      where: { role: body.role as any },
      select: { id: true },
    });
  } else {
    users = await prisma.user.findMany({
      where: { role: { in: ["USER", "RESELLER"] } },
      select: { id: true },
    });
  }

  if (!users.length) {
    return res.status(404).json({ status: "error", message: "No users found for this target." });
  }

  await Promise.all(
    users.map((user) =>
      notifyUser({
        userId: user.id,
        category: `ADMIN_${body.category}`,
        title: body.title,
        message: body.message,
        meta: {
          category: body.category,
          targetType: body.targetType,
          actorId: auth.sub,
        },
      })
    )
  );

  await recordAdminAction({
    actorId: auth.sub,
    action: "ADMIN_SEND_NOTIFICATION",
    ip,
    meta: {
      targetType: body.targetType,
      userId: body.userId ?? null,
      role: body.role ?? null,
      category: body.category,
      title: body.title,
      recipients: users.length,
    },
  });

  res.json({ status: "success", recipients: users.length });
});

adminRouter.delete("/users-full/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const auth = (req as any).auth as { sub: string };
  const ip = (req as any).clientIp ?? "unknown";
  if (auth.sub === id) {
    throw new HttpError(400, "BAD_REQUEST", "You cannot delete your own account");
  }

  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.deleteMany({ where: { userId: id } });
    await tx.apiKey.deleteMany({ where: { userId: id } });
    await tx.searchHistory.deleteMany({ where: { userId: id } });
    await tx.accessLog.deleteMany({ where: { userId: id } });
    await tx.creditLog.deleteMany({ where: { userId: id } });
    await tx.transaction.deleteMany({ where: { userId: id } });
    await tx.notification.deleteMany({ where: { userId: id } });
    await tx.userServiceAccess.deleteMany({ where: { userId: id } });
    await tx.adminAudit.deleteMany({ where: { actorId: id } });
    await tx.user.delete({ where: { id } });
  });
  await recordAdminAction({
    actorId: auth.sub,
    action: "ADMIN_DELETE_USER",
    ip,
    meta: { userId: id },
  });
  res.json({ status: "success" });
});

adminRouter.get("/security/summary", async (_req: Request, res: Response) => {
  const summary = await getSecuritySummary();
  res.json({ status: "success", ...summary });
});

adminRouter.post("/security/users/:id/suspend", async (req: Request, res: Response) => {
  const body = z.object({ reason: z.string().max(300).optional() }).parse(req.body ?? {});
  const item = await suspendUser({
    userId: req.params.id,
    actorId: ((req as any).auth as { sub: string }).sub,
    ip: (req as any).clientIp ?? "unknown",
    reason: body.reason,
  });
  res.json({ status: "success", item });
});

adminRouter.post("/security/users/:id/blacklist", async (req: Request, res: Response) => {
  const body = z.object({ reason: z.string().max(300).optional() }).parse(req.body ?? {});
  const item = await blacklistUser({
    userId: req.params.id,
    actorId: ((req as any).auth as { sub: string }).sub,
    ip: (req as any).clientIp ?? "unknown",
    reason: body.reason,
  });
  res.json({ status: "success", item });
});

adminRouter.post("/security/users/:id/whitelist", async (req: Request, res: Response) => {
  const body = z.object({ reason: z.string().max(300).optional() }).parse(req.body ?? {});
  const item = await whitelistUser({
    userId: req.params.id,
    actorId: ((req as any).auth as { sub: string }).sub,
    ip: (req as any).clientIp ?? "unknown",
    reason: body.reason,
  });
  res.json({ status: "success", item });
});

adminRouter.post("/security/users/:id/reset-device", async (req: Request, res: Response) => {
  const item = await resetUserDevice({
    userId: req.params.id,
    actorId: ((req as any).auth as { sub: string }).sub,
    ip: (req as any).clientIp ?? "unknown",
  });
  res.json({ status: "success", item });
});

adminRouter.get("/security/ip-abuse", async (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 50);
  const payload = await listIpAbuse(limit);
  res.json({ status: "success", ...payload });
});

adminRouter.get("/security/blocked-ips", async (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 50);
  const page = Number(req.query.page ?? 1);
  const [blocked, tempBlocked] = await Promise.all([
    listBlockedIps(limit, page),
    getTempBlockedIps(limit * 3),
  ]);
  res.json({ status: "success", ...blocked, tempBlocked });
});

adminRouter.get("/security/auth-failures", async (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 50);
  const page = Number(req.query.page ?? 1);
  const payload = await listAuthFailures(limit, page);
  res.json({ status: "success", ...payload });
});

adminRouter.post("/security/ip/:ip/blacklist", async (req: Request, res: Response) => {
  const ip = decodeURIComponent(String(req.params.ip ?? "")).trim();
  const body = z.object({ reason: z.string().max(300).optional() }).parse(req.body ?? {});
  const item = await setIpListType({
    ip,
    type: "BLACKLIST",
    reason: body.reason ?? "Blocked by admin",
  });
  res.json({ status: "success", item });
});

adminRouter.post("/security/ip/:ip/whitelist", async (req: Request, res: Response) => {
  const ip = decodeURIComponent(String(req.params.ip ?? "")).trim();
  const body = z.object({ reason: z.string().max(300).optional() }).parse(req.body ?? {});
  const item = await setIpListType({
    ip,
    type: "WHITELIST",
    reason: body.reason ?? "Whitelisted by admin",
  });
  res.json({ status: "success", item });
});

adminRouter.post("/security/ip/:ip/unblock", async (req: Request, res: Response) => {
  const ip = decodeURIComponent(String(req.params.ip ?? "")).trim();
  const item = await removeIpFromList(ip);
  await clearTempIpBlock(ip);
  res.json({ status: "success", item });
});

adminRouter.post("/security/ip/:ip/clear-temp", async (req: Request, res: Response) => {
  const ip = decodeURIComponent(String(req.params.ip ?? "")).trim();
  const item = await clearTempIpBlock(ip);
  res.json({ status: "success", item });
});
