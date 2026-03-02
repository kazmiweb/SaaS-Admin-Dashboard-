import type { Request, Response, NextFunction } from "express";
import { verifyApiKeyJwt } from "./jwt.js";
import { prisma } from "../prisma.js";
import { HttpError } from "../http/errors.js";

export async function requireApiKeyJwt(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "UNAUTHORIZED", "Missing API key JWT bearer token");

  const { payload, jti } = verifyApiKeyJwt(token);
  if (payload.type !== "api_key") throw new HttpError(401, "UNAUTHORIZED", "Wrong token type");
  if (!jti) throw new HttpError(401, "UNAUTHORIZED", "Missing jti");

  const row = await prisma.apiKey.findUnique({ where: { jti } });
  if (!row || row.revokedAt) throw new HttpError(401, "UNAUTHORIZED", "API key revoked");

  await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });

  (req as any).auth = { sub: payload.sub, role: payload.role, type: "api_key" };
  next();
}
