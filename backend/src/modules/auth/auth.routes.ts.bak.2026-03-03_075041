import { Router, type Request, type Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../shared/prisma.js";
import { HttpError } from "../../shared/http/errors.js";
import { sendOtpEmail } from "../../shared/mail/mailer.js";
import { signAccessToken, signRefreshToken, signSignupToken, verifyRefresh, verifySignup } from "../../shared/security/jwt.js";
import { syncExpiredCredits } from "../../shared/security/expiry.js";
import { createSession, destroySession } from "../../shared/security/session.js";

export const authRouter = Router();

const emailSchema = z.string().email().max(255);

function genOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOtp(otp: string) {
  // slow hash (bcrypt) to avoid OTP DB leakage risk
  return bcrypt.hash(otp, 10);
}

authRouter.post("/request-otp", async (req: Request, res: Response) => {
  const body = z.object({ email: emailSchema }).parse(req.body);
  const email = body.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, "EMAIL_EXISTS", "Email already registered.");

  const otp = genOtp();
  const codeHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.oTPVerification.create({
    data: { email, codeHash, purpose: "SIGNUP", expiresAt }
  });

  // Send email
  await sendOtpEmail(email, otp);

  res.json({ status: "success", message: "OTP sent" });
});

authRouter.post("/verify-otp", async (req: Request, res: Response) => {
  const body = z.object({ email: emailSchema, otp: z.string().regex(/^\d{6}$/) }).parse(req.body);
  const email = body.email.toLowerCase();

  const record = await prisma.oTPVerification.findFirst({
    where: { email, purpose: "SIGNUP", usedAt: null },
    orderBy: { createdAt: "desc" }
  });

  if (!record) throw new HttpError(400, "OTP_INVALID", "OTP not found.");
  if (record.expiresAt.getTime() < Date.now()) throw new HttpError(400, "OTP_EXPIRED", "OTP expired.");

  const ok = await bcrypt.compare(body.otp, record.codeHash);
  if (!ok) throw new HttpError(400, "OTP_INVALID", "Invalid OTP.");

  await prisma.oTPVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  const signupToken = signSignupToken(email);
  res.json({ status: "success", signupToken });
});

authRouter.post("/complete-signup", async (req: Request, res: Response) => {
  const body = z.object({
    signupToken: z.string().min(10),
    name: z.string().min(2).max(80),
    password: z.string().min(8).max(128),
    deviceId: z.string().min(8).max(80).optional()
  }).parse(req.body);

  const payload = verifySignup(body.signupToken);
  if (payload.type !== "signup") throw new HttpError(401, "UNAUTHORIZED", "Invalid signup token");
  const email = payload.sub.toLowerCase();

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new HttpError(409, "EMAIL_EXISTS", "Email already registered.");

  const passwordHash = await bcrypt.hash(body.password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      name: body.name,
      passwordHash,
      role: "USER",
      credits: 0,
      status: "ACTIVE",
      theme: "light"
    }
  });

  // Bind device on first signup/login (USER)
  if (body.deviceId) {
    await prisma.user.update({ where: { id: user.id }, data: { deviceId: body.deviceId, deviceBoundAt: new Date() } });
  }

  // Return tokens
  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id, user.role);

  // store refresh hash
  const refreshHash = await bcrypt.hash(refreshToken, 10);
  const refreshPayload = verifyRefresh(refreshToken);
  const expiresAt = new Date((refreshPayload as any).exp * 1000);

  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: refreshHash, expiresAt }
  });

  // Create session cookie for USER web app
  await createSession(res, user.id, user.role);

  res.json({ status: "success", accessToken, refreshToken, role: user.role });
});

authRouter.post("/login", async (req: Request, res: Response) => {
  const body = z.object({
    email: emailSchema,
    password: z.string().min(1).max(128),
    deviceId: z.string().min(8).max(80).optional()
  }).parse(req.body);

  const ip = (req as any).clientIp ?? "unknown";
  const email = body.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await prisma.accessLog.create({ data: { email, ip, success: false, reason: "EMAIL_NOT_FOUND" } });
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials");
  }

  if (user.status === "BLACKLISTED") {
    await prisma.accessLog.create({ data: { userId: user.id, email, ip, success: false, reason: "BLACKLISTED" } });
    throw new HttpError(403, "BLACKLISTED", "Account is blacklisted.");
  }

  if (user.status !== "ACTIVE") {
    await prisma.accessLog.create({ data: { userId: user.id, email, ip, success: false, reason: "NOT_ACTIVE" } });
    throw new HttpError(403, "SUSPENDED", "Account is not active.");
  }

  if (user.expireAt && user.expireAt.getTime() < Date.now()) {
    await syncExpiredCredits(user);
    await prisma.accessLog.create({ data: { userId: user.id, email, ip, success: false, reason: "EXPIRED" } });
    throw new HttpError(403, "EXPIRED", "Account expired. Contact admin.");
  }

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) {
    await prisma.accessLog.create({ data: { userId: user.id, email, ip, success: false, reason: "BAD_PASSWORD" } });
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials");
  }

  await prisma.accessLog.create({ data: { userId: user.id, email, ip, success: true } });

  // Single-device enforcement for USER/RESELLER
  if (user.role === "USER" || user.role === "RESELLER") {
    if (!body.deviceId) throw new HttpError(400, "DEVICE_ID_REQUIRED", "Missing device id");
    if (user.deviceId && user.deviceId !== body.deviceId) {
      throw new HttpError(403, "DEVICE_MISMATCH", "This account is already logged in on another device. Reset device to continue.");
    }
    if (!user.deviceId) {
      await prisma.user.update({ where: { id: user.id }, data: { deviceId: body.deviceId, deviceBoundAt: new Date() } });
    }
  }

  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id, user.role);
  const refreshHash = await bcrypt.hash(refreshToken, 10);
  const refreshPayload = verifyRefresh(refreshToken);
  const expiresAt = new Date((refreshPayload as any).exp * 1000);

  await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: refreshHash, expiresAt } });

  // Session-based auth for USER/RESELLER web app
  if (user.role === "USER" || user.role === "RESELLER") {
    await createSession(res, user.id, user.role);
  }

  res.json({ status: "success", accessToken, refreshToken, role: user.role });
});

// Device reset (email verification)
authRouter.post("/device-reset/request", async (req: Request, res: Response) => {
  const body = z.object({ email: emailSchema }).parse(req.body);
  const email = body.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // don't leak user existence
    return res.json({ status: "success", message: "If the account exists, an OTP was sent." });
  }

  const otp = genOtp();
  const codeHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.oTPVerification.create({ data: { email, codeHash, purpose: "DEVICE_RESET", expiresAt } });
  await sendOtpEmail(email, otp);
  res.json({ status: "success", message: "OTP sent" });
});

authRouter.post("/device-reset/verify", async (req: Request, res: Response) => {
  const body = z
    .object({
      email: emailSchema,
      otp: z.string().regex(/^\d{6}$/),
      newDeviceId: z.string().min(8).max(80),
    })
    .parse(req.body);

  const email = body.email.toLowerCase();
  const record = await prisma.oTPVerification.findFirst({
    where: { email, purpose: "DEVICE_RESET", usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record) throw new HttpError(400, "OTP_INVALID", "OTP not found.");
  if (record.expiresAt.getTime() < Date.now()) throw new HttpError(400, "OTP_EXPIRED", "OTP expired.");
  const ok = await bcrypt.compare(body.otp, record.codeHash);
  if (!ok) throw new HttpError(400, "OTP_INVALID", "Invalid OTP.");
  await prisma.oTPVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");

  await prisma.user.update({ where: { id: user.id }, data: { deviceId: body.newDeviceId, deviceBoundAt: new Date() } });
  res.json({ status: "success" });
});

authRouter.post("/refresh", async (req: Request, res: Response) => {
  const body = z.object({ refreshToken: z.string().min(10) }).parse(req.body);
  const payload = verifyRefresh(body.refreshToken);
  if (payload.type !== "refresh") throw new HttpError(401, "UNAUTHORIZED", "Wrong token type");

  const userId = payload.sub;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(401, "UNAUTHORIZED", "Invalid refresh token");

  const candidates = await prisma.refreshToken.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 10
  });

  // Refresh token rotation: revoke the presented refresh token, issue a new pair
  let matchedId: string | null = null;
  for (const c of candidates) {
    if (await bcrypt.compare(body.refreshToken, c.tokenHash)) {
      matchedId = c.id;
      break;
    }
  }
  if (!matchedId) throw new HttpError(401, "UNAUTHORIZED", "Refresh token revoked");

  const accessToken = signAccessToken(user.id, user.role);
  const newRefreshToken = signRefreshToken(user.id, user.role);
  const newRefreshHash = await bcrypt.hash(newRefreshToken, 10);
  const newRefreshPayload = verifyRefresh(newRefreshToken);
  const newExpiresAt = new Date((newRefreshPayload as any).exp * 1000);

  await prisma.$transaction([
    prisma.refreshToken.update({ where: { id: matchedId }, data: { revokedAt: new Date() } }),
    prisma.refreshToken.create({ data: { userId: user.id, tokenHash: newRefreshHash, expiresAt: newExpiresAt } })
  ]);

  res.json({ status: "success", accessToken, refreshToken: newRefreshToken, role: user.role });
});

authRouter.post("/logout", async (req: Request, res: Response) => {
  // Best-effort revoke by refresh token
  const body = z.object({ refreshToken: z.string().min(10).optional() }).parse(req.body ?? {});
  if (body.refreshToken) {
    try {
      const payload = verifyRefresh(body.refreshToken);
      if (payload.type === "refresh") {
        const userId = payload.sub;
        const candidates = await prisma.refreshToken.findMany({
          where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          take: 20
        });
        for (const c of candidates) {
          if (await bcrypt.compare(body.refreshToken, c.tokenHash)) {
            await prisma.refreshToken.update({ where: { id: c.id }, data: { revokedAt: new Date() } });
            break;
          }
        }
      }
    } catch {
      // ignore
    }
  }
  await destroySession(req, res);
  res.json({ status: "success" });
});
