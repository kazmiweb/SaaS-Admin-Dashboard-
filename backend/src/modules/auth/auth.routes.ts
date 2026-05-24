import { Router, type Request, type Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../../shared/prisma.js";
import { HttpError } from "../../shared/http/errors.js";
import { sendOtpEmail } from "../../shared/mail/mailer.js";
import {
  signAccessToken,
  signLogin2faToken,
  signRefreshToken,
  signSignupToken,
  verifyLogin2fa,
  verifyRefresh,
  verifySignup,
} from "../../shared/security/jwt.js";
import { syncExpiredCredits } from "../../shared/security/expiry.js";
import { createSession, destroySession } from "../../shared/security/session.js";
import { noteAuthFailure, noteAuthSuccess } from "../security/security.service.js";

export const authRouter = Router();

const emailSchema = z.string().trim().email().max(255);
const otpSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{6}$/));

function parseBoundedInt(input: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  return Math.min(max, Math.max(min, rounded));
}

const OTP_EXPIRY_SECONDS = parseBoundedInt(process.env.OTP_EXPIRY_SECONDS, 600, 60, 3600);
const OTP_EXPIRY_MS = OTP_EXPIRY_SECONDS * 1000;
const OTP_COOLDOWN_SECONDS = parseBoundedInt(process.env.OTP_REQUEST_COOLDOWN_SECONDS, 45, 20, 600);
const SIGNUP_LIMIT_PER_IP = Math.max(1, Number(process.env.SIGNUP_LIMIT_PER_IP ?? 3));

function genOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOtp(otp: string) {
  // slow hash (bcrypt) to avoid OTP DB leakage risk
  return bcrypt.hash(otp, 10);
}

function login2faPurpose(userId: string) {
  return `LOGIN_2FA:${userId}`;
}

function normalizeEmail(input: string) {
  return input.trim().toLowerCase();
}

function otpSentPayload(message = "OTP sent") {
  return {
    status: "success" as const,
    message,
    cooldownSeconds: OTP_COOLDOWN_SECONDS,
    expiresInSeconds: OTP_EXPIRY_SECONDS,
  };
}

function otpCooldownError(waitSeconds: number) {
  return new HttpError(429, "OTP_COOLDOWN", `Please wait ${waitSeconds}s before requesting another OTP.`, {
    details: {
      retryAfterSeconds: waitSeconds,
      cooldownSeconds: OTP_COOLDOWN_SECONDS,
    },
    headers: { "Retry-After": waitSeconds },
  });
}

function maskEmail(email: string) {
  const [localPart, domainPart] = email.toLowerCase().split("@");
  if (!localPart || !domainPart) return "your email";
  if (localPart.length <= 2) return `${localPart[0] ?? "*"}*@${domainPart}`;
  return `${localPart.slice(0, 2)}***@${domainPart}`;
}

async function issueLoginTokens(
  req: Request,
  res: Response,
  user: { id: string; role: "ADMIN" | "RESELLER" | "USER" }
) {
  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id, user.role);
  const refreshHash = await bcrypt.hash(refreshToken, 10);
  const refreshPayload = verifyRefresh(refreshToken);
  const expiresAt = new Date((refreshPayload as any).exp * 1000);

  await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: refreshHash, expiresAt } });

  if (user.role === "USER" || user.role === "RESELLER") {
    await createSession(res, user.id, user.role);
  } else {
    await destroySession(req, res);
  }

  return { accessToken, refreshToken, role: user.role };
}

async function sendLogin2faChallenge(user: { id: string; role: "ADMIN" | "RESELLER" | "USER"; email: string }) {
  const purpose = login2faPurpose(user.id);
  const email = normalizeEmail(user.email);

  const latestPending = await prisma.oTPVerification.findFirst({
    where: { email, purpose, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (latestPending) {
    const cooldownUntil = latestPending.createdAt.getTime() + OTP_COOLDOWN_SECONDS * 1000;
    const remainingMs = cooldownUntil - Date.now();
    if (remainingMs > 0) {
      const waitSeconds = Math.ceil(remainingMs / 1000);
      throw otpCooldownError(waitSeconds);
    }
  }

  await prisma.oTPVerification.updateMany({
    where: { email, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });

  const otp = genOtp();
  const codeHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  const created = await prisma.oTPVerification.create({
    data: { email, codeHash, purpose, expiresAt },
  });

  try {
    await sendOtpEmail(email, otp, OTP_EXPIRY_SECONDS);
  } catch {
    await prisma.oTPVerification.delete({ where: { id: created.id } }).catch(() => void 0);
    throw new HttpError(503, "OTP_DELIVERY_FAILED", "2FA OTP delivery failed. Please try again shortly.");
  }

  return {
    challengeToken: signLogin2faToken(user.id, user.role),
    cooldownSeconds: OTP_COOLDOWN_SECONDS,
    expiresInSeconds: OTP_EXPIRY_SECONDS,
  };
}

async function assertSignupIpAllowed(ip: string) {
  if (!ip || ip === "unknown") return;

  const whitelist = await prisma.iPList.findFirst({ where: { ip, type: "WHITELIST" } });
  if (whitelist) return;

  const existingBlacklist = await prisma.iPList.findFirst({ where: { ip, type: "BLACKLIST" } });
  if (existingBlacklist) {
    throw new HttpError(403, "IP_BLOCKED", "This IP has been blocked due to suspicious registrations.");
  }

  const successfulSignups = await prisma.accessLog.count({
    where: {
      ip,
      success: true,
      reason: "SIGNUP_COMPLETED",
    },
  });

  if (successfulSignups >= SIGNUP_LIMIT_PER_IP) {
    await prisma.iPList.upsert({
      where: { ip },
      update: {
        type: "BLACKLIST",
        reason: `Auto blocked: more than ${SIGNUP_LIMIT_PER_IP} signups from same IP`,
      },
      create: {
        ip,
        type: "BLACKLIST",
        reason: `Auto blocked: more than ${SIGNUP_LIMIT_PER_IP} signups from same IP`,
      },
    });
    throw new HttpError(403, "IP_BLOCKED", "This IP has been blocked due to suspicious registrations.");
  }
}

async function recordSignupAttempt(input: { ip: string; email: string; success: boolean; reason: string }) {
  if (!input.ip || input.ip === "unknown") return;
  await prisma.accessLog.create({
    data: {
      ip: input.ip,
      email: input.email,
      success: input.success,
      reason: input.reason,
    },
  });
}

authRouter.post("/request-otp", async (req: Request, res: Response) => {
  const body = z.object({ email: emailSchema }).parse(req.body);
  const email = normalizeEmail(body.email);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, "EMAIL_EXISTS", "Email already registered.");

  const latestPending = await prisma.oTPVerification.findFirst({
    where: { email, purpose: "SIGNUP", usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (latestPending) {
    const cooldownUntil = latestPending.createdAt.getTime() + OTP_COOLDOWN_SECONDS * 1000;
    const remainingMs = cooldownUntil - Date.now();
    if (remainingMs > 0) {
      const waitSeconds = Math.ceil(remainingMs / 1000);
      throw otpCooldownError(waitSeconds);
    }
  }

  await prisma.oTPVerification.updateMany({
    where: { email, purpose: "SIGNUP", usedAt: null },
    data: { usedAt: new Date() },
  });

  const otp = genOtp();
  const codeHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  const created = await prisma.oTPVerification.create({
    data: { email, codeHash, purpose: "SIGNUP", expiresAt },
  });

  try {
    await sendOtpEmail(email, otp, OTP_EXPIRY_SECONDS);
  } catch {
    await prisma.oTPVerification.delete({ where: { id: created.id } }).catch(() => void 0);
    throw new HttpError(503, "OTP_DELIVERY_FAILED", "OTP delivery failed. Please try again shortly.");
  }

  res.json(otpSentPayload());
});

authRouter.post("/verify-otp", async (req: Request, res: Response) => {
  const body = z.object({ email: emailSchema, otp: otpSchema }).parse(req.body);
  const email = normalizeEmail(body.email);
  const ip = (req as any).clientIp ?? "unknown";

  const record = await prisma.oTPVerification.findFirst({
    where: { email, purpose: "SIGNUP", usedAt: null },
    orderBy: { createdAt: "desc" }
  });

  if (!record) {
    await noteAuthFailure({ email, ip, reason: "OTP_INVALID" });
    throw new HttpError(400, "OTP_INVALID", "OTP not found.");
  }
  if (record.expiresAt.getTime() < Date.now()) {
    await noteAuthFailure({ email, ip, reason: "OTP_EXPIRED" });
    throw new HttpError(400, "OTP_EXPIRED", "OTP expired.");
  }

  const ok = await bcrypt.compare(body.otp, record.codeHash);
  if (!ok) {
    await noteAuthFailure({ email, ip, reason: "OTP_INVALID" });
    throw new HttpError(400, "OTP_INVALID", "Invalid OTP.");
  }

  await prisma.oTPVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  await noteAuthSuccess({ email, ip, reason: "OTP_VERIFIED" });

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
  const ip = (req as any).clientIp ?? "unknown";

  const payload = verifySignup(body.signupToken);
  if (payload.type !== "signup") throw new HttpError(401, "UNAUTHORIZED", "Invalid signup token");
  const email = payload.sub.toLowerCase();

  await assertSignupIpAllowed(ip);

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new HttpError(409, "EMAIL_EXISTS", "Email already registered.");

  const passwordHash = await bcrypt.hash(body.password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      name: body.name,
      passwordHash,
      role: "USER",
      credits: 1,
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
  await recordSignupAttempt({
    ip,
    email,
    success: true,
    reason: "SIGNUP_COMPLETED",
  });

  // Create session cookie for USER web app
  await createSession(res, user.id, user.role);

  res.json({ status: "success", accessToken, refreshToken, role: user.role });
});

authRouter.post("/login", async (req: Request, res: Response) => {
  const body = z.object({
    identifier: z.string().trim().min(1).max(255).optional(),
    email: z.string().trim().email().max(255).optional(),
    password: z.string().min(1).max(128),
    deviceId: z.string().min(8).max(80).optional()
  }).parse(req.body);

  const ip = (req as any).clientIp ?? "unknown";
  const identifier = (body.identifier ?? body.email ?? "").trim();
  if (!identifier) throw new HttpError(400, "BAD_REQUEST", "Email or username is required.");
  const emailInput = identifier.toLowerCase();
  const user = identifier.includes("@")
    ? await prisma.user.findUnique({ where: { email: emailInput } })
    : await prisma.user.findFirst({
        where: {
          OR: [
            { email: { equals: emailInput, mode: "insensitive" } },
            { name: { equals: identifier, mode: "insensitive" } },
          ],
        },
      });
  const email = user?.email?.toLowerCase() ?? emailInput;

  if (!user) {
    await noteAuthFailure({ email, ip, reason: "EMAIL_NOT_FOUND" });
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials");
  }

  if (user.status === "BLACKLISTED") {
    await noteAuthFailure({ userId: user.id, email, ip, reason: "BLACKLISTED" });
    throw new HttpError(403, "BLACKLISTED", "Account is blacklisted.");
  }

  if (user.status !== "ACTIVE") {
    await noteAuthFailure({ userId: user.id, email, ip, reason: "NOT_ACTIVE" });
    throw new HttpError(403, "SUSPENDED", "Account is not active.");
  }

  if (user.expireAt && user.expireAt.getTime() < Date.now()) {
    await syncExpiredCredits(user);
    await noteAuthFailure({ userId: user.id, email, ip, reason: "EXPIRED" });
    throw new HttpError(403, "EXPIRED", "Account expired. Contact admin.");
  }

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) {
    await noteAuthFailure({ userId: user.id, email, ip, reason: "BAD_PASSWORD" });
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid credentials");
  }

  // Single-device enforcement for USER/RESELLER
  if (user.role === "USER" || user.role === "RESELLER") {
    if (!body.deviceId) throw new HttpError(400, "DEVICE_ID_REQUIRED", "Missing device id");
    if (user.deviceId && user.deviceId !== body.deviceId) {
      await noteAuthFailure({ userId: user.id, email, ip, reason: "DEVICE_MISMATCH" });
      throw new HttpError(403, "DEVICE_MISMATCH", "This account is already logged in on another device. Reset device to continue.");
    }
    if (!user.deviceId) {
      await prisma.user.update({ where: { id: user.id }, data: { deviceId: body.deviceId, deviceBoundAt: new Date() } });
    }
  }

  if (user.twoFactorEnabled) {
    const challenge = await sendLogin2faChallenge({ id: user.id, role: user.role, email: user.email });
    return res.json({
      status: "2fa_required",
      code: "2FA_REQUIRED",
      challengeToken: challenge.challengeToken,
      cooldownSeconds: challenge.cooldownSeconds,
      expiresInSeconds: challenge.expiresInSeconds,
      role: user.role,
      message: `OTP sent to ${maskEmail(user.email)}.`,
    });
  }

  await noteAuthSuccess({ userId: user.id, email, ip, reason: "LOGIN_SUCCESS" });
  const tokens = await issueLoginTokens(req, res, { id: user.id, role: user.role });
  res.json({ status: "success", ...tokens });
});

authRouter.post("/login/2fa/verify", async (req: Request, res: Response) => {
  const body = z
    .object({
      challengeToken: z.string().min(20),
      otp: otpSchema,
    })
    .parse(req.body);

  const ip = (req as any).clientIp ?? "unknown";
  const payload = verifyLogin2fa(body.challengeToken);
  if (payload.type !== "login_2fa") throw new HttpError(401, "UNAUTHORIZED", "Invalid 2FA challenge token");

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    await noteAuthFailure({ ip, reason: "2FA_USER_NOT_FOUND" });
    throw new HttpError(401, "UNAUTHORIZED", "Invalid 2FA challenge.");
  }

  const email = normalizeEmail(user.email);

  if (user.status === "BLACKLISTED") {
    await noteAuthFailure({ userId: user.id, email, ip, reason: "BLACKLISTED" });
    throw new HttpError(403, "BLACKLISTED", "Account is blacklisted.");
  }
  if (user.status !== "ACTIVE") {
    await noteAuthFailure({ userId: user.id, email, ip, reason: "NOT_ACTIVE" });
    throw new HttpError(403, "SUSPENDED", "Account is not active.");
  }
  if (user.expireAt && user.expireAt.getTime() < Date.now()) {
    await syncExpiredCredits(user);
    await noteAuthFailure({ userId: user.id, email, ip, reason: "EXPIRED" });
    throw new HttpError(403, "EXPIRED", "Account expired. Contact admin.");
  }

  const record = await prisma.oTPVerification.findFirst({
    where: { email, purpose: login2faPurpose(user.id), usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record) {
    await noteAuthFailure({ userId: user.id, email, ip, reason: "OTP_INVALID" });
    throw new HttpError(400, "OTP_INVALID", "OTP not found.");
  }
  if (record.expiresAt.getTime() < Date.now()) {
    await noteAuthFailure({ userId: user.id, email, ip, reason: "OTP_EXPIRED" });
    throw new HttpError(400, "OTP_EXPIRED", "OTP expired.");
  }

  const ok = await bcrypt.compare(body.otp, record.codeHash);
  if (!ok) {
    await noteAuthFailure({ userId: user.id, email, ip, reason: "OTP_INVALID" });
    throw new HttpError(400, "OTP_INVALID", "Invalid OTP.");
  }

  await prisma.oTPVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  await noteAuthSuccess({ userId: user.id, email, ip, reason: "LOGIN_SUCCESS_2FA" });
  const tokens = await issueLoginTokens(req, res, { id: user.id, role: user.role });
  res.json({ status: "success", ...tokens });
});

authRouter.post("/login/2fa/resend", async (req: Request, res: Response) => {
  const body = z.object({ challengeToken: z.string().min(20) }).parse(req.body);
  const payload = verifyLogin2fa(body.challengeToken);
  if (payload.type !== "login_2fa") throw new HttpError(401, "UNAUTHORIZED", "Invalid 2FA challenge token");

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, email: true, status: true, twoFactorEnabled: true },
  });
  if (!user) throw new HttpError(401, "UNAUTHORIZED", "Invalid 2FA challenge.");
  if (!user.twoFactorEnabled) throw new HttpError(400, "2FA_DISABLED", "2FA is not enabled for this account.");
  if (user.status !== "ACTIVE") throw new HttpError(403, "SUSPENDED", "Account is not active.");

  const challenge = await sendLogin2faChallenge({ id: user.id, role: user.role, email: user.email });
  res.json({
    status: "2fa_required",
    code: "2FA_REQUIRED",
    challengeToken: challenge.challengeToken,
    cooldownSeconds: challenge.cooldownSeconds,
    expiresInSeconds: challenge.expiresInSeconds,
    role: user.role,
    message: `OTP sent to ${maskEmail(user.email)}.`,
  });
});

// Device reset (email verification)
authRouter.post("/device-reset/request", async (req: Request, res: Response) => {
  const body = z.object({ email: emailSchema }).parse(req.body);
  const email = normalizeEmail(body.email);
  const ip = (req as any).clientIp ?? "unknown";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // don't leak user existence
    await noteAuthFailure({ email, ip, reason: "DEVICE_RESET_REQUEST_UNKNOWN_EMAIL" });
    return res.json(otpSentPayload("If the account exists, an OTP was sent."));
  }

  const latestPending = await prisma.oTPVerification.findFirst({
    where: { email, purpose: "DEVICE_RESET", usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (latestPending) {
    const cooldownUntil = latestPending.createdAt.getTime() + OTP_COOLDOWN_SECONDS * 1000;
    const remainingMs = cooldownUntil - Date.now();
    if (remainingMs > 0) {
      const waitSeconds = Math.ceil(remainingMs / 1000);
      throw otpCooldownError(waitSeconds);
    }
  }

  await prisma.oTPVerification.updateMany({
    where: { email, purpose: "DEVICE_RESET", usedAt: null },
    data: { usedAt: new Date() },
  });

  const otp = genOtp();
  const codeHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  const created = await prisma.oTPVerification.create({ data: { email, codeHash, purpose: "DEVICE_RESET", expiresAt } });
  await noteAuthSuccess({ userId: user.id, email, ip, reason: "DEVICE_RESET_REQUESTED" });

  try {
    await sendOtpEmail(email, otp, OTP_EXPIRY_SECONDS);
  } catch {
    await prisma.oTPVerification.delete({ where: { id: created.id } }).catch(() => void 0);
    throw new HttpError(503, "OTP_DELIVERY_FAILED", "OTP delivery failed. Please try again shortly.");
  }
  res.json(otpSentPayload());
});

authRouter.post("/device-reset/verify", async (req: Request, res: Response) => {
  const body = z
    .object({
      email: emailSchema,
      otp: otpSchema,
      newDeviceId: z.string().min(8).max(80),
    })
    .parse(req.body);

  const email = normalizeEmail(body.email);
  const ip = (req as any).clientIp ?? "unknown";
  const record = await prisma.oTPVerification.findFirst({
    where: { email, purpose: "DEVICE_RESET", usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record) {
    await noteAuthFailure({ email, ip, reason: "OTP_INVALID" });
    throw new HttpError(400, "OTP_INVALID", "OTP not found.");
  }
  if (record.expiresAt.getTime() < Date.now()) {
    await noteAuthFailure({ email, ip, reason: "OTP_EXPIRED" });
    throw new HttpError(400, "OTP_EXPIRED", "OTP expired.");
  }
  const ok = await bcrypt.compare(body.otp, record.codeHash);
  if (!ok) {
    await noteAuthFailure({ email, ip, reason: "OTP_INVALID" });
    throw new HttpError(400, "OTP_INVALID", "Invalid OTP.");
  }
  await prisma.oTPVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");

  await prisma.user.update({ where: { id: user.id }, data: { deviceId: body.newDeviceId, deviceBoundAt: new Date() } });
  await noteAuthSuccess({ userId: user.id, email, ip, reason: "DEVICE_RESET_VERIFIED" });
  res.json({ status: "success" });
});

authRouter.post("/password-reset/request", async (req: Request, res: Response) => {
  const body = z.object({ email: emailSchema }).parse(req.body);
  const email = normalizeEmail(body.email);
  const ip = (req as any).clientIp ?? "unknown";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await noteAuthFailure({ email, ip, reason: "PASSWORD_RESET_REQUEST_UNKNOWN_EMAIL" });
    return res.json(otpSentPayload("If the account exists, an OTP was sent."));
  }

  const latestPending = await prisma.oTPVerification.findFirst({
    where: { email, purpose: "PASSWORD_RESET", usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (latestPending) {
    const cooldownUntil = latestPending.createdAt.getTime() + OTP_COOLDOWN_SECONDS * 1000;
    const remainingMs = cooldownUntil - Date.now();
    if (remainingMs > 0) {
      const waitSeconds = Math.ceil(remainingMs / 1000);
      throw otpCooldownError(waitSeconds);
    }
  }

  await prisma.oTPVerification.updateMany({
    where: { email, purpose: "PASSWORD_RESET", usedAt: null },
    data: { usedAt: new Date() },
  });

  const otp = genOtp();
  const codeHash = await hashOtp(otp);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
  const created = await prisma.oTPVerification.create({ data: { email, codeHash, purpose: "PASSWORD_RESET", expiresAt } });
  await noteAuthSuccess({ userId: user.id, email, ip, reason: "PASSWORD_RESET_REQUESTED" });

  try {
    await sendOtpEmail(email, otp, OTP_EXPIRY_SECONDS);
  } catch {
    await prisma.oTPVerification.delete({ where: { id: created.id } }).catch(() => void 0);
    throw new HttpError(503, "OTP_DELIVERY_FAILED", "OTP delivery failed. Please try again shortly.");
  }

  res.json(otpSentPayload());
});

authRouter.post("/password-reset/verify", async (req: Request, res: Response) => {
  const body = z
    .object({
      email: emailSchema,
      otp: otpSchema,
      newPassword: z.string().min(8).max(128),
    })
    .parse(req.body);

  const email = normalizeEmail(body.email);
  const ip = (req as any).clientIp ?? "unknown";
  const record = await prisma.oTPVerification.findFirst({
    where: { email, purpose: "PASSWORD_RESET", usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record) {
    await noteAuthFailure({ email, ip, reason: "OTP_INVALID" });
    throw new HttpError(400, "OTP_INVALID", "OTP not found.");
  }
  if (record.expiresAt.getTime() < Date.now()) {
    await noteAuthFailure({ email, ip, reason: "OTP_EXPIRED" });
    throw new HttpError(400, "OTP_EXPIRED", "OTP expired.");
  }
  const ok = await bcrypt.compare(body.otp, record.codeHash);
  if (!ok) {
    await noteAuthFailure({ email, ip, reason: "OTP_INVALID" });
    throw new HttpError(400, "OTP_INVALID", "Invalid OTP.");
  }
  await prisma.oTPVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new HttpError(404, "NOT_FOUND", "User not found");

  const passwordHash = await bcrypt.hash(body.newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await noteAuthSuccess({ userId: user.id, email, ip, reason: "PASSWORD_RESET_VERIFIED" });
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
