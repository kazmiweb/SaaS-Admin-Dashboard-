import type { Request, Response, NextFunction } from "express";
import { verifyAccess, JwtPayload } from "./jwt.js";
import { HttpError } from "../http/errors.js";

export type AuthContext = {
  sub: string;
  role: JwtPayload["role"];
  type: "access" | "session";
};

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  // 1) Session cookie (preferred for USER/RESELLER web sessions)
  const sess = (req as any).session as { userId: string; role: JwtPayload["role"] } | undefined;
  if (sess?.userId && sess?.role) {
    (req as any).auth = { sub: sess.userId, role: sess.role, type: "session" } satisfies AuthContext;
    return next();
  }

  // 2) Bearer access token
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "UNAUTHORIZED", "Missing bearer token");

  const payload = verifyAccess(token);
  if (payload.type !== "access") throw new HttpError(401, "UNAUTHORIZED", "Wrong token type");
  (req as any).auth = payload as any;
  next();
}

export function requireRole(...roles: JwtPayload["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = (req as any).auth as (JwtPayload | AuthContext) | undefined;
    if (!auth) throw new HttpError(401, "UNAUTHORIZED", "Not authenticated");
    if (!roles.includes(auth.role)) throw new HttpError(403, "FORBIDDEN", "Insufficient permissions");
    next();
  };
}
