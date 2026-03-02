import { Router, type Request, type Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../shared/prisma.js";
import { requireAuth, requireRole } from "../../shared/security/authMiddleware.js";
import { HttpError } from "../../shared/http/errors.js";

export const resellerRouter = Router();

resellerRouter.use(requireAuth, requireRole("RESELLER"));

// List users created/owned by this reseller
resellerRouter.get("/users", async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const users = await prisma.user.findMany({
    where: { resellerId: auth.sub },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      credits: true,
      expireAt: true,
      createdAt: true
    }
  });
  res.json({ status: "success", users });
});

// Create a USER account (only USER role allowed) and optionally assign coins and expiry
resellerRouter.post("/users", async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const ip = (req as any).clientIp ?? "unknown";

  const body = z.object({
    email: z.string().email().max(255),
    name: z.string().min(2).max(80),
    password: z.string().min(8).max(128),
    coins: z.number().int().min(0).default(0),
    expireAt: z.string().datetime().optional()
  }).parse(req.body);

  const reseller = await prisma.user.findUnique({ where: { id: auth.sub } });
  if (!reseller) throw new HttpError(404, "NOT_FOUND", "Reseller not found");
  if (reseller.status !== "ACTIVE") throw new HttpError(403, "FORBIDDEN", "Reseller not active");
  if (reseller.expireAt && reseller.expireAt.getTime() < Date.now()) {
    // reseller expired -> wipe credits
    if (reseller.credits !== 0) await prisma.user.update({ where: { id: reseller.id }, data: { credits: 0 } });
    throw new HttpError(403, "EXPIRED", "Reseller account expired");
  }

  const email = body.email.toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new HttpError(409, "EMAIL_EXISTS", "Email already registered");

  if (body.coins > 0 && reseller.credits < body.coins) {
    throw new HttpError(402, "INSUFFICIENT_CREDITS", `Insufficient coins. You have ${reseller.credits}.`);
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  const expireAt = body.expireAt ? new Date(body.expireAt) : null;

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: body.name,
        passwordHash,
        role: "USER",
        status: "ACTIVE",
        credits: body.coins,
        expireAt,
        resellerId: auth.sub,
        theme: "dark"
      },
      select: { id: true }
    });

    if (body.coins > 0) {
      // Deduct reseller coins immediately (non-refundable)
      await tx.user.update({ where: { id: auth.sub }, data: { credits: { decrement: body.coins } } });
      await tx.creditLog.create({ data: { userId: auth.sub, delta: -body.coins, reason: `Create user (${email})`, actorId: auth.sub } });
      await tx.creditLog.create({ data: { userId: user.id, delta: body.coins, reason: `Initial coins via reseller`, actorId: auth.sub } });
    }

    await tx.adminAudit.create({
      data: {
        actorId: auth.sub,
        action: "RESELLER_CREATE_USER",
        ip,
        meta: { email, coins: body.coins, expireAt: expireAt?.toISOString() ?? null, createdUserId: user.id }
      }
    });

    return user;
  });

  res.json({ status: "success", user: created });
});

// Update a created user (name/status/expiry) - cannot change role
resellerRouter.put("/users/:id", async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const ip = (req as any).clientIp ?? "unknown";
  const id = req.params.id;

  const body = z.object({
    name: z.string().min(2).max(80).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE"]).optional(),
    expireAt: z.string().datetime().nullable().optional()
  }).parse(req.body);

  const user = await prisma.user.findFirst({ where: { id, resellerId: auth.sub } });
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");
  if (user.role !== "USER") throw new HttpError(403, "FORBIDDEN", "Only USER accounts are allowed");

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name } : {}),
      ...(body.status ? { status: body.status as any } : {}),
      ...(body.expireAt !== undefined ? { expireAt: body.expireAt ? new Date(body.expireAt) : null } : {})
    },
    select: { id: true }
  });

  await prisma.adminAudit.create({
    data: { actorId: auth.sub, action: "RESELLER_UPDATE_USER", ip, meta: { userId: id, patch: body } }
  });

  res.json({ status: "success", user: updated });
});

// Delete a created user
resellerRouter.delete("/users/:id", async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const ip = (req as any).clientIp ?? "unknown";
  const id = req.params.id;

  const user = await prisma.user.findFirst({ where: { id, resellerId: auth.sub } });
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");
  if (user.role !== "USER") throw new HttpError(403, "FORBIDDEN", "Only USER accounts are allowed");

  await prisma.$transaction([
    prisma.adminAudit.create({ data: { actorId: auth.sub, action: "RESELLER_DELETE_USER", ip, meta: { userId: id, email: user.email } } }),
    prisma.user.delete({ where: { id } })
  ]);

  res.json({ status: "success" });
});

// Add coins & optionally set/extend expiry
resellerRouter.post("/users/:id/add-coins", async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const ip = (req as any).clientIp ?? "unknown";
  const id = req.params.id;
  const body = z.object({
    coins: z.number().int().min(1),
    expireAt: z.string().datetime().optional() // package upgrade may extend expiry
  }).parse(req.body);

  const reseller = await prisma.user.findUnique({ where: { id: auth.sub } });
  if (!reseller) throw new HttpError(404, "NOT_FOUND", "Reseller not found");
  if (reseller.credits < body.coins) throw new HttpError(402, "INSUFFICIENT_CREDITS", `Insufficient coins. You have ${reseller.credits}.`);

  const user = await prisma.user.findFirst({ where: { id, resellerId: auth.sub } });
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");
  if (user.role !== "USER") throw new HttpError(403, "FORBIDDEN", "Only USER accounts are allowed");

  const now = Date.now();
  const userExpired = !!(user.expireAt && user.expireAt.getTime() < now);

  const nextExpireAt = body.expireAt ? new Date(body.expireAt) : user.expireAt;
  const willBeActive = !nextExpireAt || nextExpireAt.getTime() >= now;

  await prisma.$transaction(async (tx) => {
    // Deduct reseller immediately (non-refundable)
    await tx.user.update({ where: { id: auth.sub }, data: { credits: { decrement: body.coins } } });
    await tx.creditLog.create({ data: { userId: auth.sub, delta: -body.coins, reason: `Top-up user (${user.email})`, actorId: auth.sub } });

    // If user is expired, their coins are considered 0; new package sets fresh coins.
    await tx.user.update({
      where: { id },
      data: {
        credits: userExpired ? body.coins : { increment: body.coins },
        ...(body.expireAt ? { expireAt: nextExpireAt } : {}),
        ...(willBeActive ? { status: "ACTIVE" as any } : {})
      }
    });
    await tx.creditLog.create({ data: { userId: id, delta: body.coins, reason: `Top-up via reseller`, actorId: auth.sub } });
    await tx.adminAudit.create({ data: { actorId: auth.sub, action: "RESELLER_ADD_COINS", ip, meta: { userId: id, coins: body.coins, expireAt: body.expireAt ?? null } } });
  });

  res.json({ status: "success" });
});

// Reset a user's bound device (requires the user to complete email verification reset to log in again)
resellerRouter.post("/users/:id/reset-device", async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string };
  const ip = (req as any).clientIp ?? "unknown";
  const id = req.params.id;

  const user = await prisma.user.findFirst({ where: { id, resellerId: auth.sub } });
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");
  if (user.role !== "USER") throw new HttpError(403, "FORBIDDEN", "Only USER accounts are allowed");

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { deviceId: null, deviceBoundAt: null } }),
    prisma.adminAudit.create({ data: { actorId: auth.sub, action: "RESELLER_RESET_DEVICE", ip, meta: { userId: id } } })
  ]);

  res.json({ status: "success" });
});
