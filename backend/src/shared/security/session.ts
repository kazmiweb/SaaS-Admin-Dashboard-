import type { Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";
import { redis } from "../redis.js";

export type SessionData = {
  id: string;
  userId: string;
  role: "ADMIN" | "RESELLER" | "USER";
};

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "elookup.sid";
const PREFIX = process.env.SESSION_REDIS_PREFIX ?? "sess:";
const TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 12); // 12h

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function setCookie(res: Response, sid: string | null) {
  const isProd = (process.env.NODE_ENV ?? "development") === "production";
  const base = [
    `${COOKIE_NAME}=${sid ? encodeURIComponent(sid) : ""}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (isProd) base.push("Secure");
  if (!sid) base.push("Max-Age=0");
  else base.push(`Max-Age=${TTL_SECONDS}`);
  res.setHeader("Set-Cookie", base.join("; "));
}

export async function createSession(res: Response, userId: string, role: SessionData["role"]) {
  const r = redis;
  const id = nanoid(32);
  const key = `${PREFIX}${id}`;
  const value: SessionData = { id, userId, role };
  await redis.set(key, JSON.stringify(value), "EX", TTL_SECONDS);
  setCookie(res, id);
  return value;
}

export async function destroySession(req: Request, res: Response) {
  const sid = (req as any).session?.id as string | undefined;
  if (sid) {
    await redis.del(`${PREFIX}${sid}`);
  }
  setCookie(res, null);
  (req as any).session = undefined;
}

export function sessionReader() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const cookies = parseCookies(req.headers.cookie);
      const sid = cookies[COOKIE_NAME];
      if (!sid) return next();
      const raw = await redis.get(`${PREFIX}${sid}`);
      if (!raw) return next();
      const session = JSON.parse(raw) as SessionData;
      // rolling refresh
      await redis.expire(`${PREFIX}${sid}`, TTL_SECONDS);
      (req as any).session = session;
      return next();
    } catch {
      return next();
    }
  };
}
