import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { HttpError } from "../http/errors.js";

export type JwtPayload = {
  sub: string;
  role: "ADMIN" | "RESELLER" | "USER";
  type: "access" | "refresh" | "signup" | "api_key";
};

const accessSecret = process.env.JWT_ACCESS_SECRET ?? "dev_access";
const refreshSecret = process.env.JWT_REFRESH_SECRET ?? "dev_refresh";
const apiKeySecret = process.env.JWT_API_KEY_SECRET ?? "dev_api_key";

export function signAccessToken(userId: string, role: JwtPayload["role"]) {
  const ttl = Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900);
  return jwt.sign({ sub: userId, role, type: "access" } satisfies JwtPayload, accessSecret, { expiresIn: ttl, jwtid: nanoid() });
}

export function signRefreshToken(userId: string, role: JwtPayload["role"]) {
  const ttl = Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 1209600);
  return jwt.sign({ sub: userId, role, type: "refresh" } satisfies JwtPayload, refreshSecret, { expiresIn: ttl, jwtid: nanoid() });
}

export function signSignupToken(email: string) {
  return jwt.sign({ sub: email, role: "USER", type: "signup" } satisfies JwtPayload, accessSecret, { expiresIn: 15 * 60, jwtid: nanoid() });
}

export function verifyAccess(token: string): JwtPayload {
  try {
    return jwt.verify(token, accessSecret) as JwtPayload;
  } catch {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid or expired token");
  }
}

export function verifyRefresh(token: string): JwtPayload {
  try {
    return jwt.verify(token, refreshSecret) as JwtPayload;
  } catch {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid or expired token");
  }
}

export function verifySignup(token: string): JwtPayload {
  try {
    return jwt.verify(token, accessSecret) as JwtPayload;
  } catch {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid or expired signup token");
  }
}

export function signApiKeyJwt(userId: string, role: JwtPayload["role"], jti: string, scopes: string) {
  const ttl = Number(process.env.JWT_API_KEY_TTL_SECONDS ?? 60 * 60 * 24 * 365); // 1 year default
  return jwt.sign({ sub: userId, role, type: "api_key" } satisfies JwtPayload, apiKeySecret, {
    expiresIn: ttl,
    jwtid: jti,
    audience: scopes
  });
}

export function verifyApiKeyJwt(token: string): { payload: JwtPayload; jti: string; scopes: string } {
  try {
    const decoded = jwt.verify(token, apiKeySecret, { complete: true }) as any;
    const payload = decoded.payload as JwtPayload;
    const jti = decoded.payload?.jti ?? decoded.header?.jti;
    const scopes = decoded.payload?.aud ?? decoded.payload?.audience ?? decoded.payload?.aud ?? "";
    return { payload, jti: String(jti ?? ""), scopes: String(scopes ?? "") };
  } catch {
    throw new HttpError(401, "UNAUTHORIZED", "Invalid or expired API key JWT");
  }
}
