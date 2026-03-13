import type { Request, Response, NextFunction } from "express";
import { enforceIpSecurity } from "../../modules/security/security.service.js";

export async function ipGate(req: Request, _res: Response, next: NextFunction) {
  const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] ?? req.ip ?? "").trim();
  (req as any).clientIp = ip || "unknown";
  await enforceIpSecurity((req as any).clientIp);
  next();
}
