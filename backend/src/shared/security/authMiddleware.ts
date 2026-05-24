import type { Request, Response, NextFunction } from "express";
import { verifyAccess, JwtPayload } from "./jwt.js";
import { HttpError } from "../http/errors.js";

export type AuthContext = {
  sub: string;
  role: JwtPayload["role"];
  type: "access" | "session";
};

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const sess = (req as any).session as { userId: string; role: JwtPayload["role"] } | undefined;

  // 1) Prefer explicit bearer token when present.
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) {
    try {
      const payload = verifyAccess(token);
      if (payload.type !== "access") throw new HttpError(401, "UNAUTHORIZED", "Wrong token type");
      (req as any).auth = payload as any;
      return next();
    } catch (error) {
      // If a valid web session exists, keep USER/RESELLER flows working even with stale bearer tokens.
      if (!(sess?.userId && sess?.role)) throw error;
    }
  }

  // 2) Fallback to session cookie (USER/RESELLER web sessions).
  if (sess?.userId && sess?.role) {
    (req as any).auth = { sub: sess.userId, role: sess.role, type: "session" } satisfies AuthContext;
    return next();
  }

  throw new HttpError(401, "UNAUTHORIZED", "Missing bearer token");
}

export function requireRole(...roles: JwtPayload["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = (req as any).auth as (JwtPayload | AuthContext) | undefined;
    if (!auth) throw new HttpError(401, "UNAUTHORIZED", "Not authenticated");
    if (!roles.includes(auth.role)) throw new HttpError(403, "FORBIDDEN", "Insufficient permissions");
    next();
  };
}
