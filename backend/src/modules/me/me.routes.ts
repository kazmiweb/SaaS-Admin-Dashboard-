import { Router, type Request, type Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../shared/prisma.js";
import { requireAuth } from "../../shared/security/authMiddleware.js";
import { HttpError } from "../../shared/http/errors.js";
import { syncExpiredCredits } from "../../shared/security/expiry.js";
import { ensureSystemNotifications } from "../../shared/notifications.js";
import { signSearchRequestToken } from "../../shared/security/jwt.js";

export const meRouter = Router();

type DashboardRole = "ADMIN" | "RESELLER" | "USER";

function buildDashboardSearchItems(role: DashboardRole) {
  if (role === "ADMIN") {
    return [
      { label: "Dashboard", description: "Admin overview and stats", to: "/admin/dashboard" },
      { label: "API Management", description: "Manage APIs and service mapping", to: "/admin/api-management" },
      { label: "User Management", description: "Manage users, coins, and expiry", to: "/admin/user-management" },
      { label: "Transactions", description: "Revenue and transaction records", to: "/admin/transactions" },
      { label: "Security", description: "Authentication and IP controls", to: "/admin/security" },
      { label: "Profile", description: "Account settings and theme", to: "/admin/profile" },
      { label: "Emails", description: "Inbox and reply workspace", to: "/admin/emails" },
      { label: "Activity Logs", description: "Recent admin actions", to: "/admin/activity" },
    ];
  }

  const base = role === "RESELLER" ? "/reseller" : "/user";
  const items = [
    { label: "Dashboard", description: "Overview and recent activity", to: `${base}/dashboard` },
    { label: "CNIC Lookup", description: "Search by CNIC", to: `${base}/cnic-intelligence` },
    { label: "Mobile Lookup", description: "Search by mobile number", to: `${base}/mobile-intelligence` },
    { label: "Mix Family Tree", description: "Render family tree graph", to: `${base}/family-tree` },
    { label: "Punjab Excise", description: "Vehicle search", to: `${base}/vehicle/punjab` },
    { label: "Islamabad Excise", description: "Vehicle search", to: `${base}/vehicle/islamabad` },
    { label: "Sindh Excise", description: "Vehicle search", to: `${base}/vehicle/sindh` },
    { label: "Balochistan Excise", description: "Vehicle search", to: `${base}/vehicle/balochistan` },
    { label: "KPK Excise", description: "Vehicle search", to: `${base}/vehicle/kpk` },
    { label: "Kashmir Excise", description: "Vehicle search", to: `${base}/vehicle/kashmir` },
    { label: "Stolen Vehicle Record", description: "Check stolen vehicle data", to: `${base}/vehicle/stolen` },
    { label: "Profile", description: "Account settings and theme", to: `${base}/profile` },
    { label: "Contact Admin", description: "Support inbox and live chat", to: `${base}/emails` },
    { label: "My Searches", description: "Search history", to: `${base}/settings/searches` },
    { label: "Transactions", description: "Coins and billing history", to: `${base}/settings/transactions` },
    { label: "Reset Password", description: "Update account password", to: `${base}/settings/change-password` },
  ];

  if (role === "RESELLER") {
    items.push({ label: "Manage Team", description: "Manage reseller users", to: "/reseller/users" });
  }

  return items;
}

function parseTake(input: unknown, fallback: number, max: number) {
  const raw = Number(input);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.floor(raw), max);
}

meRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const meRaw = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { id: true, email: true, name: true, role: true, credits: true, expireAt: true, acceptedDisclaimerAt: true, theme: true, status: true, createdAt: true }
  });
  if (!meRaw) throw new HttpError(404, "NOT_FOUND", "User not found");
  await syncExpiredCredits({ id: meRaw.id, expireAt: meRaw.expireAt, credits: meRaw.credits } as any);
  await ensureSystemNotifications({ id: meRaw.id, expireAt: meRaw.expireAt, credits: meRaw.expireAt && meRaw.expireAt.getTime() < Date.now() ? 0 : meRaw.credits });
  // re-read credits if changed
  const me = meRaw.expireAt && meRaw.expireAt.getTime() < Date.now() ? { ...meRaw, credits: 0 } : meRaw;
  res.json({ status: "success", me });
});

meRouter.post("/accept-disclaimer", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  await prisma.user.update({ where: { id: auth.sub }, data: { acceptedDisclaimerAt: new Date() } });
  res.json({ status: "success" });
});

meRouter.post("/theme", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const body = z.object({ theme: z.enum(["light","dark"]) }).parse(req.body);
  await prisma.user.update({ where: { id: auth.sub }, data: { theme: body.theme } });
  res.json({ status: "success" });
});

meRouter.get("/search-token", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string; role: DashboardRole };
  const session = (req as any).session as { id?: string } | undefined;
  const token = signSearchRequestToken(auth.sub, auth.role, session?.id);
  res.json({
    status: "success",
    token,
    expiresInSeconds: Math.max(20, Number(process.env.SEARCH_REQUEST_TOKEN_TTL_SECONDS ?? 90)),
  });
});

meRouter.post("/change-password", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const body = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128)
  }).parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: auth.sub } });
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");
  const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!ok) throw new HttpError(400, "BAD_PASSWORD", "Current password incorrect");

  const passwordHash = await bcrypt.hash(body.newPassword, 12);
  await prisma.user.update({ where: { id: auth.sub }, data: { passwordHash } });
  res.json({ status: "success" });
});

// ===== Services list for sidebar (USER/RESELLER) =====
meRouter.get("/services", requireAuth, async (req, res) => {
  // Try multiple common auth shapes (middleware-dependent)
  const auth = (req as any).auth || (res.locals as any).auth || (req as any).user || (res.locals as any).user || (req as any).session;
  const userId = auth?.sub || auth?.id || auth?.userId;
  const role = auth?.role;

  if (!userId) {
    return res.status(401).json({ status: "error", code: "UNAUTHORIZED", message: "Unauthorized" });
  }

  // Active services only
  const services = await prisma.service.findMany({
    where: { status: true },
    orderBy: { name: "asc" },
    include: {
      userServiceAccesses: {
        where: { userId },
        select: { allowed: true }
      }
    }
  });

  const items = services
    .map(s => {
      const override = s.userServiceAccesses?.[0];
      const allowed = override ? !!override.allowed : true;
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        icon: s.icon,
        type: s.type,
        status: s.status,
        defaultCost: s.defaultCost,
        allowed
      };
    })
    .filter(x => role === "ADMIN" ? true : x.allowed);

  // NOTE: For USER/RESELLER we only return allowed services
  const filtered = role === "ADMIN" ? items : items.filter(x => x.allowed);

  return res.json({ status: "success", items: filtered });
});




meRouter.get("/search-history", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const take = parseTake(req.query.limit, 10, 100);
  const rows = await prisma.searchHistory.findMany({
    where: { userId: auth.sub },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, query: true, detectedType: true, status: true, cost: true, createdAt: true, service: { select: { name: true } } }
  });
  res.json({ status: "success", items: rows.map(r => ({
    id: r.id,
    query: r.query,
    service: r.service?.name ?? "—",
    detectedType: r.detectedType,
    status: r.status,
    cost: r.cost,
    createdAt: r.createdAt
  })) });
});

meRouter.get("/transactions", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const take = parseTake(req.query.limit, 10, 100);
  const rows = await prisma.transaction.findMany({
    where: { userId: auth.sub },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, amountPkr: true, coins: true, note: true, createdAt: true }
  });
  res.json({ status: "success", items: rows });
});

meRouter.get("/notifications", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const take = parseTake(req.query.limit, 12, 100);

  const me = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { id: true, credits: true, expireAt: true },
  });
  if (!me) throw new HttpError(404, "NOT_FOUND", "User not found");

  await ensureSystemNotifications(me);

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        userId: auth.sub,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
      take,
      select: {
        id: true,
        category: true,
        title: true,
        message: true,
        isRead: true,
        createdAt: true,
        expiresAt: true,
      },
    }),
    prisma.notification.count({
      where: {
        userId: auth.sub,
        isRead: false,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
    }),
  ]);

  res.json({ status: "success", unreadCount, items });
});

meRouter.post("/notifications/read-all", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  await prisma.notification.updateMany({
    where: {
      userId: auth.sub,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
  res.json({ status: "success" });
});

meRouter.get("/dashboard-search", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { role?: DashboardRole };
  const role = auth?.role;
  if (!role || !["ADMIN", "RESELLER", "USER"].includes(role)) {
    throw new HttpError(403, "FORBIDDEN", "Role not allowed");
  }

  const query = String(req.query.q ?? "").trim().toLowerCase();
  const take = parseTake(req.query.limit, 8, 20);
  const allowedItems = buildDashboardSearchItems(role);
  const filtered = query
    ? allowedItems.filter((item) =>
        [item.label, item.description, item.to].join(" ").toLowerCase().includes(query)
      )
    : allowedItems;

  res.json({ status: "success", items: filtered.slice(0, take) });
});
