import { prisma } from "../../shared/prisma.js";

type ListParams = {
  limit?: number;
};

const SUSPICIOUS_REASONS = new Set([
  "BAD_PASSWORD",
  "EMAIL_NOT_FOUND",
  "DEVICE_MISMATCH",
  "OTP_INVALID",
  "OTP_EXPIRED",
  "BLACKLISTED",
]);

function toLimit(value?: number) {
  return Math.min(200, Math.max(1, value ?? 50));
}

function buildSuspiciousContext(
  rows: Array<{ ip: string; email: string | null; reason: string | null; success: boolean }>
) {
  const ipFailures = new Map<string, number>();
  const emailFailures = new Map<string, number>();

  for (const row of rows) {
    if (row.success) continue;
    ipFailures.set(row.ip, (ipFailures.get(row.ip) ?? 0) + 1);
    if (row.email) {
      emailFailures.set(row.email, (emailFailures.get(row.email) ?? 0) + 1);
    }
  }

  return { ipFailures, emailFailures };
}

function isSuspiciousEvent(
  row: { ip: string; email: string | null; reason: string | null; success: boolean },
  context: { ipFailures: Map<string, number>; emailFailures: Map<string, number> }
) {
  if (row.success) return false;
  if (row.reason && SUSPICIOUS_REASONS.has(row.reason)) return true;
  if ((context.ipFailures.get(row.ip) ?? 0) >= 3) return true;
  if (row.email && (context.emailFailures.get(row.email) ?? 0) >= 3) return true;
  return false;
}

export async function recordAdminAction(input: {
  actorId: string;
  action: string;
  ip: string;
  meta?: Record<string, unknown> | null;
}) {
  return prisma.adminAudit.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      ip: input.ip,
      meta: (input.meta ?? undefined) as any,
    },
  });
}

export async function recordSecurityEvent(input: {
  userId?: string | null;
  email?: string | null;
  ip: string;
  success: boolean;
  reason?: string | null;
}) {
  return prisma.accessLog.create({
    data: {
      userId: input.userId ?? null,
      email: input.email ?? null,
      ip: input.ip,
      success: input.success,
      reason: input.reason ?? null,
    },
  });
}

export async function listAdminActions(params: ListParams = {}) {
  const limit = toLimit(params.limit);
  const items = await prisma.adminAudit.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      actor: {
        select: { id: true, email: true, name: true, role: true },
      },
    },
  });

  return items.map((item) => ({
    id: item.id,
    action: item.action,
    actor: item.actor,
    ip: item.ip,
    meta: item.meta,
    createdAt: item.createdAt,
    category: item.action.startsWith("RESELLER_") ? "reseller" : "admin",
  }));
}

export async function listSecurityEvents(params: ListParams = {}) {
  const limit = toLimit(params.limit);
  const rows = await prisma.accessLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: {
        select: { id: true, email: true, name: true, role: true, status: true },
      },
    },
  });

  const context = buildSuspiciousContext(rows);
  const items = rows.map((row) => ({
    id: row.id,
    type: row.success ? "LOGIN_SUCCESS" : "SECURITY_EVENT",
    reason: row.reason ?? (row.success ? "LOGIN_SUCCESS" : "AUTH_EVENT"),
    success: row.success,
    ip: row.ip,
    email: row.email,
    user: row.user,
    suspicious: isSuspiciousEvent(row, context),
    createdAt: row.createdAt,
  }));

  return {
    summary: {
      total: items.length,
      suspicious: items.filter((item) => item.suspicious).length,
      failed: items.filter((item) => !item.success).length,
      successful: items.filter((item) => item.success).length,
    },
    items,
  };
}

export async function listActivityLogs(params: ListParams = {}) {
  const limit = toLimit(params.limit);

  const [adminActions, securityEvents, creditLogs, searches] = await Promise.all([
    prisma.adminAudit.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { actor: { select: { id: true, email: true, name: true, role: true } } },
    }),
    prisma.accessLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { id: true, email: true, name: true, role: true, status: true } } },
    }),
    prisma.creditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
        actor: { select: { id: true, email: true, name: true, role: true } },
      },
    }),
    prisma.searchHistory.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
        service: { select: { id: true, name: true } },
      },
    }),
  ]);

  const securityContext = buildSuspiciousContext(securityEvents);

  const items = [
    ...adminActions.map((item) => ({
      id: `admin:${item.id}`,
      type: "ADMIN_ACTION",
      category: item.action.startsWith("RESELLER_") ? "reseller" : "admin",
      action: item.action,
      actor: item.actor,
      ip: item.ip,
      suspicious: false,
      meta: item.meta,
      createdAt: item.createdAt,
    })),
    ...securityEvents.map((item) => ({
      id: `security:${item.id}`,
      type: item.success ? "LOGIN_EVENT" : "SECURITY_EVENT",
      category: "security",
      action: item.reason ?? (item.success ? "LOGIN_SUCCESS" : "AUTH_EVENT"),
      actor: item.user,
      ip: item.ip,
      suspicious: isSuspiciousEvent(item, securityContext),
      meta: { email: item.email, success: item.success },
      createdAt: item.createdAt,
    })),
    ...creditLogs.map((item) => ({
      id: `credit:${item.id}`,
      type: "COIN_ADJUSTMENT",
      category: item.reason.toLowerCase().includes("expiry") ? "package" : "billing",
      action: item.reason,
      actor: item.actor ?? item.user,
      ip: null,
      suspicious: false,
      meta: { user: item.user, delta: item.delta },
      createdAt: item.createdAt,
    })),
    ...searches.map((item) => ({
      id: `search:${item.id}`,
      type: "USER_SEARCH",
      category: item.status === "blocked" ? "security" : "search",
      action: item.status === "blocked" ? "SEARCH_BLOCKED" : "SEARCH_EXECUTED",
      actor: item.user,
      ip: item.ip,
      suspicious: item.status === "blocked",
      meta: {
        service: item.service,
        query: item.query,
        detectedType: item.detectedType,
        status: item.status,
        cost: item.cost,
      },
      createdAt: item.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);

  return items;
}
