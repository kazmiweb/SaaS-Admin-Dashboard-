import type { Request, Response, NextFunction } from "express";
import { prisma } from "../prisma.js";
import { HttpError } from "../http/errors.js";

export async function ipGate(req: Request, _res: Response, next: NextFunction) {
  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.ip ?? "").trim();
  (req as any).clientIp = ip || "unknown";

  // Whitelist bypass
  const wl = await prisma.iPList.findFirst({ where: { ip, type: "WHITELIST" } });
  if (wl) return next();

  const bl = await prisma.iPList.findFirst({ where: { ip, type: "BLACKLIST" } });
  if (bl) throw new HttpError(403, "IP_BLOCKED", "Your IP is blocked.");
  next();
}
