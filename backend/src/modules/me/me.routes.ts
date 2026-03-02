import { Router, type Request, type Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../shared/prisma.js";
import { requireAuth } from "../../shared/security/authMiddleware.js";
import { HttpError } from "../../shared/http/errors.js";
import { syncExpiredCredits } from "../../shared/security/expiry.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const meRaw = await prisma.user.findUnique({
    where: { id: auth.sub },
    select: { id: true, email: true, name: true, role: true, credits: true, expireAt: true, acceptedDisclaimerAt: true, theme: true, status: true, createdAt: true }
  });
  if (!meRaw) throw new HttpError(404, "NOT_FOUND", "User not found");
  await syncExpiredCredits({ id: meRaw.id, expireAt: meRaw.expireAt, credits: meRaw.credits } as any);
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


meRouter.get("/search-history", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const rows = await prisma.searchHistory.findMany({
    where: { userId: auth.sub },
    orderBy: { createdAt: "desc" },
    take: 10,
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
  const rows = await prisma.transaction.findMany({
    where: { userId: auth.sub },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, amountPkr: true, coins: true, note: true, createdAt: true }
  });
  res.json({ status: "success", items: rows });
});
