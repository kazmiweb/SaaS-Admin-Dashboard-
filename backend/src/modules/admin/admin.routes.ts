import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../shared/prisma.js";
import { requireAuth, requireRole } from "../../shared/security/authMiddleware.js";
import { HttpError } from "../../shared/http/errors.js";
import { runApiCall } from "../search/runApiCall.js";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { signApiKeyJwt } from "../../shared/security/jwt.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("ADMIN"));

adminRouter.get("/stats", async (_req: Request, res: Response) => {
  const since = new Date();
  since.setHours(0,0,0,0);

  const [totalUsers, activeUsers, activeApis, searchesToday, revenueToday] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.apiConfig.count({ where: { status: true } }),
    prisma.searchHistory.count({ where: { createdAt: { gte: since } } }),
    prisma.transaction.aggregate({ where: { createdAt: { gte: since } }, _sum: { amountPkr: true } })
  ]);

  // last 12 months revenue (PKR)
  const now = new Date();
  const months: { label: string; value: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const sum = await prisma.transaction.aggregate({ where: { createdAt: { gte: start, lt: end } }, _sum: { amountPkr: true } });
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
  since.setHours(0,0,0,0);

  const [totalUsers, activeUsers, activeServices, revenueToday] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.service.count({ where: { status: true } }),
    prisma.transaction.aggregate({ where: { createdAt: { gte: since } }, _sum: { amountPkr: true } })
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
      where: { createdAt: { gte: start, lt: end } },
      _sum: { amountPkr: true }
    });
    const label = start.toLocaleString("en-US", { month: "short" });
    const isoMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    months.push({ label, isoMonth, value: Number(sum._sum.amountPkr ?? 0) });
  }
  res.json({ status: "success", months });
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
    role: z.enum(["ADMIN","RESELLER","USER"]),
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
  const id = req.params.id;
  const ip = (req as any).clientIp ?? "unknown";
  await prisma.user.update({ where: { id }, data: { deviceId: null, deviceBoundAt: null } });
  const auth = (req as any).auth as { sub: string };
  await prisma.adminAudit.create({ data: { actorId: auth.sub, action: "ADMIN_RESET_DEVICE", ip, meta: { userId: id } } });
  res.json({ status: "success" });
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
  const apis = await prisma.apiConfig.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ status: "success", apis });
});

adminRouter.post("/apis", async (req: Request, res: Response) => {
  const body = z.object({
    name: z.string().min(2),
    method: z.enum(["GET","POST"]),
    baseUrl: z.string().url(),
    endpoint: z.string().min(1),
    queryParam: z.string().min(1),
    description: z.string().optional(),
    authType: z.enum(["NONE","API_KEY_HEADER","BEARER_TOKEN","BASIC_AUTH","SESSION_LOGIN","OAUTH2"]).default("NONE"),
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
    sampleQuery: z.string().optional()
  }).parse(req.body);

  const api = await prisma.apiConfig.create({ data: body });
  res.json({ status: "success", api });
});

adminRouter.put("/apis/:id", async (req: Request, res: Response) => {
  const id = req.params.id;
  const body = z.record(z.any()).parse(req.body);
  const api = await prisma.apiConfig.update({ where: { id }, data: body });
  res.json({ status: "success", api });
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
  const services = await prisma.service.findMany({
    orderBy: { createdAt: "desc" },
    include: { serviceApis: true }
  });
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
    apiIds: z.array(z.string()).default([])
  }).parse(req.body);

  const service = await prisma.service.create({
    data: {
      name: body.name,
      description: body.description,
      icon: body.icon,
      type: body.type,
      status: body.status,
      defaultCost: body.defaultCost,
      serviceApis: { create: body.apiIds.map((apiId, idx) => ({ apiId, priority: idx+1, enabled: true })) }
    },
    include: { serviceApis: true }
  });

  res.json({ status: "success", service });
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
    })
    .parse(req.body);

  const existing = await prisma.service.findUnique({ where: { id }, include: { serviceApis: true } });
  if (!existing) throw new HttpError(404, "NOT_FOUND", "Service not found");

  const apiIds = body.apiIds;

  const updated = await prisma.$transaction(async (tx) => {
    if (Array.isArray(apiIds)) {
      // Replace assignments deterministically
      await tx.serviceApi.deleteMany({ where: { serviceId: id } });
      if (apiIds.length) {
        await tx.serviceApi.createMany({
          data: apiIds.map((apiId, idx) => ({ serviceId: id, apiId, priority: idx + 1, enabled: true })),
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
      include: { serviceApis: true },
    });
  });

  res.json({ status: "success", service: updated });
});


adminRouter.get("/recent-searches", async (_req: Request, res: Response) => {
  const rows = await prisma.searchHistory.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { user: { select: { id: true, email: true, name: true } }, service: { select: { name: true } } }
  });
  res.json({ status: "success", items: rows.map(r => ({
    id: r.id,
    user: r.user,
    query: r.query,
    service: r.service?.name ?? "—",
    status: r.status,
    createdAt: r.createdAt
  })) });
});

adminRouter.get("/top-users", async (_req: Request, res: Response) => {
  const grouped = await prisma.searchHistory.groupBy({
    by: ["userId"],
    _count: { _all: true },
    orderBy: { _count: { _all: "desc" } },
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
      searches: g._count._all
    }))
  });
});
