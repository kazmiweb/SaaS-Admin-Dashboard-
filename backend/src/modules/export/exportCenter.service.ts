import type { Response } from "express";
import { prisma } from "../../shared/prisma.js";
import { listApiHealth } from "../health/apiHealth.service.js";
import { buildRevenueEligibleUserWhere } from "../../shared/billing/billingRules.js";

type DateRangeFilter = {
  from?: Date;
  to?: Date;
};

export type UsersExportFilters = DateRangeFilter & {
  role?: string;
  status?: string;
  billingType?: string;
  resellerId?: string;
};

export type TransactionsExportFilters = DateRangeFilter & {
  userId?: string;
  resellerId?: string;
  billingType?: string;
};

export type ActivityExportFilters = DateRangeFilter & {
  userId?: string;
  resellerId?: string;
  billingType?: string;
  service?: string;
  type?: string;
};

export type RevenueExportFilters = TransactionsExportFilters & {
  groupBy?: "transaction" | "day" | "month";
};

type CsvColumn<T> = {
  header: string;
  value: (row: T) => unknown;
};

function formatDate(value: Date | null | undefined) {
  return value ? value.toISOString() : "";
}

function escapeCsvValue(value: unknown): string {
  if (value == null) return "";
  const normalized =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }

  return normalized;
}

function writeCsvRow(res: Response, values: unknown[]) {
  res.write(`${values.map(escapeCsvValue).join(",")}\n`);
}

function createdAtWhere(filter: DateRangeFilter) {
  if (!filter.from && !filter.to) return undefined;
  return {
    ...(filter.from ? { gte: filter.from } : {}),
    ...(filter.to ? { lte: filter.to } : {}),
  };
}

function buildFilename(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}

async function streamCsv<T>(
  res: Response,
  filename: string,
  columns: CsvColumn<T>[],
  rows: T[],
) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");

  writeCsvRow(res, columns.map((column) => column.header));
  for (const row of rows) {
    writeCsvRow(
      res,
      columns.map((column) => column.value(row)),
    );
  }
  res.end();
}

export async function exportUsersCsv(res: Response, filters: UsersExportFilters) {
  const rows = await prisma.user.findMany({
    where: {
      ...(filters.role ? { role: filters.role as any } : {}),
      ...(filters.status ? { status: filters.status as any } : {}),
      ...(filters.billingType ? { billingType: filters.billingType } : {}),
      ...(filters.resellerId ? { resellerId: filters.resellerId } : {}),
      ...(createdAtWhere(filters) ? { createdAt: createdAtWhere(filters) } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      reseller: { select: { id: true, email: true, name: true } },
    },
  });

  await streamCsv(
    res,
    buildFilename("users-export"),
    [
      { header: "id", value: (row) => row.id },
      { header: "email", value: (row) => row.email },
      { header: "name", value: (row) => row.name },
      { header: "role", value: (row) => row.role },
      { header: "status", value: (row) => row.status },
      { header: "billingType", value: (row) => row.billingType },
      { header: "revenueExcluded", value: (row) => row.revenueExcluded },
      { header: "monthlyPackageCoins", value: (row) => row.monthlyPackageCoins },
      { header: "credits", value: (row) => row.credits },
      { header: "expireAt", value: (row) => formatDate(row.expireAt) },
      { header: "resellerId", value: (row) => row.resellerId },
      { header: "resellerEmail", value: (row) => row.reseller?.email ?? "" },
      { header: "createdAt", value: (row) => formatDate(row.createdAt) },
      { header: "updatedAt", value: (row) => formatDate(row.updatedAt) },
    ],
    rows,
  );
}

export async function exportTransactionsCsv(res: Response, filters: TransactionsExportFilters) {
  const rows = await prisma.transaction.findMany({
    where: {
      ...(createdAtWhere(filters) ? { createdAt: createdAtWhere(filters) } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.resellerId || filters.billingType
        ? {
            user: {
              ...(filters.resellerId ? { resellerId: filters.resellerId } : {}),
              ...(filters.billingType ? { billingType: filters.billingType } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          billingType: true,
          resellerId: true,
        },
      },
    },
  });

  await streamCsv(
    res,
    buildFilename("transactions-export"),
    [
      { header: "id", value: (row) => row.id },
      { header: "userId", value: (row) => row.userId },
      { header: "userEmail", value: (row) => row.user.email },
      { header: "userName", value: (row) => row.user.name },
      { header: "userRole", value: (row) => row.user.role },
      { header: "billingType", value: (row) => row.user.billingType },
      { header: "resellerId", value: (row) => row.user.resellerId ?? "" },
      { header: "amountPkr", value: (row) => row.amountPkr },
      { header: "coins", value: (row) => row.coins },
      { header: "note", value: (row) => row.note ?? "" },
      { header: "createdAt", value: (row) => formatDate(row.createdAt) },
    ],
    rows,
  );
}

export async function exportActivityCsv(res: Response, filters: ActivityExportFilters) {
  const [adminActions, accessLogs, creditLogs, searchHistory] = await Promise.all([
    prisma.adminAudit.findMany({
      where: {
        ...(createdAtWhere(filters) ? { createdAt: createdAtWhere(filters) } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { id: true, email: true, name: true, role: true } } },
    }),
    prisma.accessLog.findMany({
      where: {
        ...(createdAtWhere(filters) ? { createdAt: createdAtWhere(filters) } : {}),
        ...(filters.userId ? { userId: filters.userId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { id: true, email: true, name: true, role: true, billingType: true, resellerId: true },
        },
      },
    }),
    prisma.creditLog.findMany({
      where: {
        ...(createdAtWhere(filters) ? { createdAt: createdAtWhere(filters) } : {}),
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.resellerId || filters.billingType
          ? {
              user: {
                ...(filters.resellerId ? { resellerId: filters.resellerId } : {}),
                ...(filters.billingType ? { billingType: filters.billingType } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, email: true, name: true, role: true, billingType: true, resellerId: true } },
        actor: { select: { id: true, email: true, name: true, role: true } },
      },
    }),
    prisma.searchHistory.findMany({
      where: {
        ...(createdAtWhere(filters) ? { createdAt: createdAtWhere(filters) } : {}),
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.service
          ? {
              OR: [
                { serviceId: filters.service },
                { service: { name: filters.service } },
              ],
            }
          : {}),
        ...(filters.resellerId || filters.billingType
          ? {
              user: {
                ...(filters.resellerId ? { resellerId: filters.resellerId } : {}),
                ...(filters.billingType ? { billingType: filters.billingType } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, email: true, name: true, role: true, billingType: true, resellerId: true } },
        service: { select: { id: true, name: true } },
      },
    }),
  ]);

  const rows = [
    ...adminActions.map((item) => ({
      source: "admin_audit",
      type: "ADMIN_ACTION",
      action: item.action,
      actorId: item.actor.id,
      actorEmail: item.actor.email,
      actorName: item.actor.name,
      actorRole: item.actor.role,
      targetUserId: "",
      targetUserEmail: "",
      billingType: "",
      resellerId: "",
      ip: item.ip,
      details: item.meta,
      createdAt: item.createdAt,
    })),
    ...accessLogs.map((item) => ({
      source: "access_log",
      type: item.success ? "LOGIN_EVENT" : "SECURITY_EVENT",
      action: item.reason ?? (item.success ? "LOGIN_SUCCESS" : "AUTH_EVENT"),
      actorId: item.user?.id ?? "",
      actorEmail: item.user?.email ?? item.email ?? "",
      actorName: item.user?.name ?? "",
      actorRole: item.user?.role ?? "",
      targetUserId: item.user?.id ?? "",
      targetUserEmail: item.user?.email ?? item.email ?? "",
      billingType: item.user?.billingType ?? "",
      resellerId: item.user?.resellerId ?? "",
      ip: item.ip,
      details: { success: item.success },
      createdAt: item.createdAt,
    })),
    ...creditLogs.map((item) => ({
      source: "credit_log",
      type: "COIN_ADJUSTMENT",
      action: item.reason,
      actorId: item.actor?.id ?? "",
      actorEmail: item.actor?.email ?? "",
      actorName: item.actor?.name ?? "",
      actorRole: item.actor?.role ?? "",
      targetUserId: item.user.id,
      targetUserEmail: item.user.email,
      billingType: item.user.billingType,
      resellerId: item.user.resellerId ?? "",
      ip: "",
      details: { delta: item.delta },
      createdAt: item.createdAt,
    })),
    ...searchHistory.map((item) => ({
      source: "search_history",
      type: "USER_SEARCH",
      action: item.status === "blocked" ? "SEARCH_BLOCKED" : "SEARCH_EXECUTED",
      actorId: item.user.id,
      actorEmail: item.user.email,
      actorName: item.user.name,
      actorRole: item.user.role,
      targetUserId: item.user.id,
      targetUserEmail: item.user.email,
      billingType: item.user.billingType,
      resellerId: item.user.resellerId ?? "",
      ip: item.ip,
      details: {
        service: item.service?.name ?? "",
        query: item.query,
        detectedType: item.detectedType,
        cost: item.cost,
        status: item.status,
      },
      createdAt: item.createdAt,
    })),
  ]
    .filter((row) => !filters.type || row.type === filters.type)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  await streamCsv(
    res,
    buildFilename("activity-export"),
    [
      { header: "source", value: (row) => row.source },
      { header: "type", value: (row) => row.type },
      { header: "action", value: (row) => row.action },
      { header: "actorId", value: (row) => row.actorId },
      { header: "actorEmail", value: (row) => row.actorEmail },
      { header: "actorName", value: (row) => row.actorName },
      { header: "actorRole", value: (row) => row.actorRole },
      { header: "targetUserId", value: (row) => row.targetUserId },
      { header: "targetUserEmail", value: (row) => row.targetUserEmail },
      { header: "billingType", value: (row) => row.billingType },
      { header: "resellerId", value: (row) => row.resellerId },
      { header: "ip", value: (row) => row.ip },
      { header: "details", value: (row) => row.details },
      { header: "createdAt", value: (row) => formatDate(row.createdAt) },
    ],
    rows,
  );
}

export async function exportApiPerformanceCsv(res: Response) {
  const rows = await listApiHealth();

  await streamCsv(
    res,
    buildFilename("api-performance-export"),
    [
      { header: "apiId", value: (row) => row.id },
      { header: "name", value: (row) => row.name },
      { header: "status", value: (row) => row.status },
      { header: "apiEnabled", value: (row) => row.apiEnabled },
      { header: "method", value: (row) => row.method },
      { header: "endpoint", value: (row) => row.endpoint },
      { header: "rollingLatencyMs", value: (row) => row.rollingLatencyMs ?? "" },
      { header: "timeoutCount", value: (row) => row.timeoutCount },
      { header: "uptimePercent24h", value: (row) => row.uptime.percent24h ?? "" },
      { header: "checks24h", value: (row) => row.uptime.totalChecks24h },
      { header: "lastSuccessAt", value: (row) => row.lastSuccess?.checkedAt ?? "" },
      { header: "lastSuccessLatencyMs", value: (row) => row.lastSuccess?.latencyMs ?? "" },
      { header: "lastErrorAt", value: (row) => row.lastError?.checkedAt ?? "" },
      { header: "lastErrorCode", value: (row) => row.lastError?.errorCode ?? "" },
      { header: "lastErrorMessage", value: (row) => row.lastError?.errorMessage ?? "" },
      { header: "serviceMappings", value: (row) => row.serviceMappings },
    ],
    rows,
  );
}

export async function exportRevenueCsv(res: Response, filters: RevenueExportFilters) {
  const groupBy = filters.groupBy ?? "day";
  const rows = await prisma.transaction.findMany({
    where: {
      ...(createdAtWhere(filters) ? { createdAt: createdAtWhere(filters) } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      user: buildRevenueEligibleUserWhere({
        ...(filters.resellerId ? { resellerId: filters.resellerId } : {}),
        ...(filters.billingType ? { billingType: filters.billingType } : {}),
      }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          billingType: true,
          resellerId: true,
          revenueExcluded: true,
        },
      },
    },
  });

  if (groupBy === "transaction") {
    await streamCsv(
      res,
      buildFilename("revenue-export"),
      [
        { header: "transactionId", value: (row) => row.id },
        { header: "createdAt", value: (row) => formatDate(row.createdAt) },
        { header: "userId", value: (row) => row.user.id },
        { header: "userEmail", value: (row) => row.user.email },
        { header: "userName", value: (row) => row.user.name },
        { header: "billingType", value: (row) => row.user.billingType },
        { header: "resellerId", value: (row) => row.user.resellerId ?? "" },
        { header: "coins", value: (row) => row.coins },
        { header: "amountPkr", value: (row) => row.amountPkr },
        { header: "note", value: (row) => row.note ?? "" },
      ],
      rows,
    );
    return;
  }

  const grouped = new Map<
    string,
    {
      period: string;
      transactions: number;
      coins: number;
      amountPkr: number;
    }
  >();

  for (const row of rows) {
    const period =
      groupBy === "month"
        ? row.createdAt.toISOString().slice(0, 7)
        : row.createdAt.toISOString().slice(0, 10);
    const current = grouped.get(period) ?? { period, transactions: 0, coins: 0, amountPkr: 0 };
    current.transactions += 1;
    current.coins += row.coins;
    current.amountPkr += row.amountPkr;
    grouped.set(period, current);
  }

  await streamCsv(
    res,
    buildFilename("revenue-export"),
    [
      { header: "period", value: (row) => row.period },
      { header: "transactions", value: (row) => row.transactions },
      { header: "coins", value: (row) => row.coins },
      { header: "amountPkr", value: (row) => row.amountPkr },
    ],
    Array.from(grouped.values()).sort((a, b) => a.period.localeCompare(b.period)),
  );
}
