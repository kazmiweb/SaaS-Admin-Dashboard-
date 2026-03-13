import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireApiKeyJwt } from "../../shared/security/apiKeyAuth.js";
import { runServiceSearch, type Role } from "../search/search.service.js";
import { HttpError } from "../../shared/http/errors.js";
import { runOrchestratedSearch } from "../search/orchestrator/searchOrchestrator.service.js";
import { getOrCreateRequestId } from "../../shared/observability/requestContext.js";

export const apiRouter = Router();

function extractRequestParams(query: Request["query"]) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (key === "query" || key === "service" || key === "serviceName") continue;
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
}

// Programmatic access via API key JWT (Bearer)
apiRouter.get("/search/unified", requireApiKeyJwt, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string; role: Role };
  const ip = (req as any).clientIp ?? "unknown";
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

apiRouter.get("/search/family-tree", requireApiKeyJwt, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string; role: Role };
  const ip = (req as any).clientIp ?? "unknown";
  const cnic = z.string().min(13).max(13).parse(req.query.cnic);
  if (!/^\d{13}$/.test(cnic)) throw new HttpError(400, "BAD_REQUEST", "CNIC must be 13 digits");
  const payload = await runServiceSearch({ auth, ip, query: cnic, serviceName: "Mix Family Tree" });
  res.json(payload);
});

apiRouter.post("/search/orchestrated", requireApiKeyJwt, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string; role: Role };
  const ip = (req as any).clientIp ?? "unknown";

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
