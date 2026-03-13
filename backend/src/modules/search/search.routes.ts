import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../shared/security/authMiddleware.js";
import { HttpError } from "../../shared/http/errors.js";
import { redis } from "../../shared/redis.js";
import { verifySearchRequestToken } from "../../shared/security/jwt.js";
import { runServiceSearch, type Role } from "./search.service.js";
import { runOrchestratedSearch } from "./orchestrator/searchOrchestrator.service.js";
import { getOrCreateRequestId } from "../../shared/observability/requestContext.js";

export const searchRouter = Router();

function extractRequestParams(query: Request["query"]) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key === "query" || key === "service" || key === "serviceName") continue;
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
}

async function consumeSearchToken(req: Request, auth: { sub: string; role: Role }) {
  const token = String(req.headers["x-search-token"] ?? "").trim();
  if (!token) {
    throw new HttpError(403, "SEARCH_TOKEN_REQUIRED", "Unauthorized client request. Dashboard search token is required.");
  }

  const { payload, jti } = verifySearchRequestToken(token);
  if (payload.sub !== auth.sub || payload.role !== auth.role) {
    throw new HttpError(403, "SEARCH_TOKEN_MISMATCH", "Search token does not belong to this user session.");
  }

  const sid = payload.sid;
  if (sid) {
    const session = (req as any).session as { id?: string } | undefined;
    if (!session?.id || session.id !== sid) {
      throw new HttpError(403, "SEARCH_TOKEN_SESSION_MISMATCH", "Search token is not valid for this active session.");
    }
  }

  const ttl = Math.max(30, Number(process.env.SEARCH_REQUEST_TOKEN_TTL_SECONDS ?? 90));
  const key = `search:req:jti:${jti}`;
  const stored = await redis.set(key, auth.sub, "EX", ttl, "NX");
  if (stored !== "OK") {
    throw new HttpError(409, "SEARCH_TOKEN_REPLAY", "Search token already used. Fetch a new token and retry.");
  }
}

searchRouter.get("/unified", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string; role: Role };
  const ip = (req as any).clientIp ?? "unknown";
  await consumeSearchToken(req, auth);

  const query = z.string().min(1).max(80).parse(req.query.query);
  const serviceName = z
    .string()
    .min(2)
    .max(80)
    .optional()
    .parse(req.query.serviceName ?? req.query.service);
  const payload = await runServiceSearch({
    auth,
    ip,
    query,
    serviceName: serviceName || "Elookup Search",
    requestParams: extractRequestParams(req.query),
  });
  res.json(payload);
});

searchRouter.get("/family-tree", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string; role: Role };
  const ip = (req as any).clientIp ?? "unknown";
  await consumeSearchToken(req, auth);
  const cnic = z.string().min(13).max(13).parse(req.query.cnic);
  if (!/^\d{13}$/.test(cnic)) throw new HttpError(400, "BAD_REQUEST", "CNIC must be 13 digits");

  const payload = await runServiceSearch({ auth, ip, query: cnic, serviceName: "Mix Family Tree" });
  res.json(payload);
});

searchRouter.post("/orchestrated", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string; role: Role };
  const ip = (req as any).clientIp ?? "unknown";
  await consumeSearchToken(req, auth);

  const body = z.object({
    query: z.string().trim().min(1).max(80),
    sources: z.array(z.string().min(1).max(80)).optional().default([]),
    forceRefresh: z.boolean().optional().default(false),
    serviceName: z.string().min(2).max(80).optional().default("Elookup Search"),
  }).parse(req.body);

  const payload = await runOrchestratedSearch({
    auth,
    ip,
    query: body.query,
    sources: body.sources,
    forceRefresh: body.forceRefresh,
    serviceName: body.serviceName,
    requestId: getOrCreateRequestId(req),
  });

  res.json(payload);
});
