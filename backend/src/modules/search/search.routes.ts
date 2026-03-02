import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../shared/security/authMiddleware.js";
import { HttpError } from "../../shared/http/errors.js";
import { runServiceSearch, type Role } from "./search.service.js";

export const searchRouter = Router();

searchRouter.get("/unified", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string; role: Role };
  const ip = (req as any).clientIp ?? "unknown";

  const query = z.string().min(1).max(80).parse(req.query.query);
  const serviceName = z.string().min(2).max(80).optional().parse(req.query.service);
  const payload = await runServiceSearch({ auth, ip, query, serviceName: serviceName || "Elookup Search" });
  res.json(payload);
});

searchRouter.get("/family-tree", requireAuth, async (req: Request, res: Response) => {
  const auth = (req as any).auth as { sub: string; role: Role };
  const ip = (req as any).clientIp ?? "unknown";
  const cnic = z.string().min(13).max(13).parse(req.query.cnic);
  if (!/^\d{13}$/.test(cnic)) throw new HttpError(400, "BAD_REQUEST", "CNIC must be 13 digits");

  const payload = await runServiceSearch({ auth, ip, query: cnic, serviceName: "Mix Family Tree" });
  res.json(payload);
});
