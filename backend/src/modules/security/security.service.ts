import { HttpError } from "../../shared/http/errors.js";
import { prisma } from "../../shared/prisma.js";
import { redis } from "../../shared/redis.js";
import { recordAdminAction, recordSecurityEvent } from "../audit/audit.service.js";
import { recordRealtimeError } from "../realtime/realtime.service.js";

const AUTH_FAILURE_THRESHOLD = Math.max(3, Number(process.env.SECURITY_AUTH_FAILURE_THRESHOLD ?? 5));
const AUTH_FAILURE_TTL_SECONDS = Math.max(60, Number(process.env.SECURITY_AUTH_FAILURE_TTL_SECONDS ?? 15 * 60));
const TEMP_BLOCK_SECONDS = Math.max(60, Number(process.env.SECURITY_TEMP_BLOCK_SECONDS ?? 15 * 60));
const REQUEST_BUCKET_TTL_SECONDS = Math.max(120, Number(process.env.SECURITY_REQUEST_BUCKET_TTL_SECONDS ?? 2 * 60));
const REDIS_TIMEOUT_MS = Math.max(25, Number(process.env.SECURITY_REDIS_TIMEOUT_MS ?? 150));

function ipRequestKey(ip: string) {
  const bucket = new Date().toISOString().slice(0, 16);
  return `security:req:${bucket}:${ip}`;
}

function authFailureIpKey(ip: string) {
  return `security:auth-failure:ip:${ip}`;
}

function authFailureEmailKey(email: string) {
  return `security:auth-failure:email:${email}`;
}

function tempBlockKey(ip: string) {
  return `security:temp-block:${ip}`;
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

export async function trackIpRequest(ip: string) {
  if (!ip || ip === "unknown" || process.env.NODE_ENV === "test") return 0;
  const key = ipRequestKey(ip);
  const count = await withRedisTimeout(redis.incr(key), 0);
  if (count <= 1) {
    await withRedisTimeout(redis.expire(key, REQUEST_BUCKET_TTL_SECONDS), 0);
  }
  return count;
}

export async function enforceIpSecurity(ip: string) {
  if (!ip || ip === "unknown") return;

  const wl = await prisma.iPList.findFirst({ where: { ip, type: "WHITELIST" } });
  if (wl) {
    await trackIpRequest(ip);
    return;
  }

  const bl = await prisma.iPList.findFirst({ where: { ip, type: "BLACKLIST" } });
  if (bl) throw new HttpError(403, "IP_BLOCKED", "Your IP is blocked.");

  const ttl = await withRedisTimeout(redis.ttl(tempBlockKey(ip)), -1);
  if (ttl > 0) {
    throw new HttpError(429, "IP_TEMP_BLOCKED", "Too many suspicious attempts from this IP. Try again later.");
  }

  await trackIpRequest(ip);
}

export async function noteAuthFailure(input: {
  ip: string;
  email?: string | null;
  userId?: string | null;
  reason: string;
}) {
  await recordSecurityEvent({
    userId: input.userId ?? null,
    email: input.email ?? null,
    ip: input.ip,
    success: false,
    reason: input.reason,
  });
  await recordRealtimeError({
    scope: "auth",
    code: input.reason,
    message: input.reason,
    severity: "warn",
    ip: input.ip,
    userId: input.userId ?? undefined,
  });

  if (!input.ip || input.ip === "unknown" || process.env.NODE_ENV === "test") return;

  const ipKey = authFailureIpKey(input.ip);
  const ipFailures = await withRedisTimeout(redis.incr(ipKey), 0);
  if (ipFailures <= 1) {
    await withRedisTimeout(redis.expire(ipKey, AUTH_FAILURE_TTL_SECONDS), 0);
  }

  if (input.email) {
    const emailKey = authFailureEmailKey(input.email);
    const emailFailures = await withRedisTimeout(redis.incr(emailKey), 0);
    if (emailFailures <= 1) {
      await withRedisTimeout(redis.expire(emailKey, AUTH_FAILURE_TTL_SECONDS), 0);
    }
  }

  if (ipFailures >= AUTH_FAILURE_THRESHOLD) {
    await withRedisTimeout(redis.set(tempBlockKey(input.ip), "1", "EX", TEMP_BLOCK_SECONDS), "OK");
  }
}

export async function noteAuthSuccess(input: {
  ip: string;
  email?: string | null;
  userId?: string | null;
  reason?: string;
}) {
  await recordSecurityEvent({
    userId: input.userId ?? null,
    email: input.email ?? null,
    ip: input.ip,
    success: true,
    reason: input.reason ?? "LOGIN_SUCCESS",
  });

  if (!input.ip || input.ip === "unknown" || process.env.NODE_ENV === "test") return;
  await withRedisTimeout(redis.del(authFailureIpKey(input.ip)), 0);
  await withRedisTimeout(redis.del(tempBlockKey(input.ip)), 0);
  if (input.email) {
    await withRedisTimeout(redis.del(authFailureEmailKey(input.email)), 0);
  }
}

export async function suspendUser(input: { userId: string; actorId: string; ip: string; reason?: string }) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, status: true, email: true, deviceId: true },
  });
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: input.userId },
      data: { status: "SUSPENDED" },
      select: { id: true, email: true, name: true, role: true, status: true },
    });
    await tx.refreshToken.updateMany({
      where: { userId: input.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return row;
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: "ADMIN_SUSPEND_USER",
    ip: input.ip,
    meta: { userId: input.userId, reason: input.reason ?? null, previousStatus: user.status },
  });

  return updated;
}

export async function blacklistUser(input: { userId: string; actorId: string; ip: string; reason?: string }) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, status: true, email: true },
  });
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: input.userId },
      data: { status: "BLACKLISTED" },
      select: { id: true, email: true, name: true, role: true, status: true },
    });
    await tx.refreshToken.updateMany({
      where: { userId: input.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return row;
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: "ADMIN_BLACKLIST_USER",
    ip: input.ip,
    meta: { userId: input.userId, reason: input.reason ?? null, previousStatus: user.status },
  });

  return updated;
}

export async function resetUserDevice(input: { userId: string; actorId: string; ip: string }) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, deviceId: true, deviceBoundAt: true },
  });
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");

  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: { deviceId: null, deviceBoundAt: null },
    select: { id: true, email: true, name: true, role: true, status: true },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: "ADMIN_RESET_DEVICE",
    ip: input.ip,
    meta: { userId: input.userId, previousDeviceId: user.deviceId ?? null },
  });
  await recordSecurityEvent({
    userId: input.userId,
    email: user.email,
    ip: input.ip,
    success: true,
    reason: "ADMIN_DEVICE_RESET",
  });

  return updated;
}

export async function getSecuritySummary() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [activeUsers, suspendedUsers, blacklistedUsers, recentLogins, authFailures24h, deviceResets24h, ipBlocks] =
    await Promise.all([
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.user.count({ where: { status: "SUSPENDED" } }),
      prisma.user.count({ where: { status: "BLACKLISTED" } }),
      prisma.accessLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { id: true, email: true, name: true, role: true, status: true } } },
      }),
      prisma.accessLog.count({ where: { success: false, createdAt: { gte: since24h } } }),
      prisma.adminAudit.count({
        where: { action: { in: ["ADMIN_RESET_DEVICE", "RESELLER_RESET_DEVICE"] }, createdAt: { gte: since24h } },
      }),
      prisma.iPList.count({ where: { type: "BLACKLIST" } }),
    ]);

  const suspiciousRecent = recentLogins.filter(
    (item) =>
      !item.success &&
      ["BAD_PASSWORD", "EMAIL_NOT_FOUND", "DEVICE_MISMATCH", "OTP_INVALID", "BLACKLISTED"].includes(item.reason ?? "")
  ).length;

  return {
    activeUsers,
    suspendedUsers,
    blacklistedUsers,
    authFailures24h,
    deviceResets24h,
    blockedIps: ipBlocks,
    suspiciousRecent,
    recentLogins: recentLogins.map((item) => ({
      id: item.id,
      userId: item.userId,
      createdAt: item.createdAt,
      success: item.success,
      reason: item.reason ?? (item.success ? "LOGIN_SUCCESS" : "AUTH_EVENT"),
      ip: item.ip || "unknown",
      email: item.email ?? item.user?.email ?? null,
      user: item.user,
    })),
  };
}

export async function listIpAbuse(limit = 50) {
  const take = Math.min(2000, Math.max(100, limit * 10));
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [logs, blacklistedIps] = await Promise.all([
    prisma.accessLog.findMany({
      where: { createdAt: { gte: since24h } },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.iPList.findMany({ where: { type: "BLACKLIST" }, select: { ip: true, reason: true } }),
  ]);

  const blockedMap = new Map(blacklistedIps.map((item) => [item.ip, item.reason ?? null]));
  const byIp = new Map<
    string,
    {
      ip: string;
      total: number;
      failed: number;
      successful: number;
      lastSeenAt: Date;
      reasons: Record<string, number>;
    }
  >();

  for (const log of logs) {
    const current = byIp.get(log.ip) ?? {
      ip: log.ip,
      total: 0,
      failed: 0,
      successful: 0,
      lastSeenAt: log.createdAt,
      reasons: {},
    };
    current.total += 1;
    current.failed += log.success ? 0 : 1;
    current.successful += log.success ? 1 : 0;
    if (log.createdAt > current.lastSeenAt) current.lastSeenAt = log.createdAt;
    if (log.reason) current.reasons[log.reason] = (current.reasons[log.reason] ?? 0) + 1;
    byIp.set(log.ip, current);
  }

  const items = Array.from(byIp.values())
    .map((item) => ({
      ...item,
      blacklisted: blockedMap.has(item.ip),
      blacklistReason: blockedMap.get(item.ip) ?? null,
      suspicious: item.failed >= AUTH_FAILURE_THRESHOLD || Object.keys(item.reasons).some((reason) => reason.includes("OTP") || reason === "DEVICE_MISMATCH"),
      tempBlocked: false,
    }))
    .sort((a, b) => b.failed - a.failed || b.total - a.total)
    .slice(0, Math.min(200, Math.max(1, limit)));

  return { items };
}

export async function listAuthFailures(limit = 50) {
  const take = Math.min(200, Math.max(1, limit));
  const rows = await prisma.accessLog.findMany({
    where: { success: false },
    orderBy: { createdAt: "desc" },
    take,
    include: { user: { select: { id: true, email: true, name: true, role: true, status: true } } },
  });

  return rows.map((item) => ({
    id: item.id,
    ip: item.ip,
    email: item.email,
    reason: item.reason,
    createdAt: item.createdAt,
    user: item.user,
    suspicious: ["BAD_PASSWORD", "EMAIL_NOT_FOUND", "DEVICE_MISMATCH", "OTP_INVALID", "BLACKLISTED"].includes(item.reason ?? ""),
  }));
}
