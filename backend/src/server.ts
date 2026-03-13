import "express-async-errors";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
dotenv.config();
import { prisma } from "./shared/prisma.js";
import { ipGate } from "./shared/security/ipGate.js";
import { errorHandler, notFound } from "./shared/http/errors.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { meRouter } from "./modules/me/me.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { searchRouter } from "./modules/search/search.routes.js";
import { exportRouter } from "./modules/export/export.routes.js";
import { resellerRouter } from "./modules/reseller/reseller.routes.js";
import { apiRouter } from "./modules/api/api.routes.js";
import { supportRouter } from "./modules/support/support.routes.js";
import { sessionReader } from "./shared/security/session.js";
import { startApiHealthScheduler } from "./modules/health/healthCheck.scheduler.js";
import { logInfo } from "./shared/observability/logger.js";
import { getOrCreateRequestId, requestContext } from "./shared/observability/requestContext.js";

const app = express();

app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: false // CSP should be tuned per deployment / reverse proxy
}));

const origins = (process.env.CORS_ORIGINS ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return cb(null, true);
    if (origins.length === 0) return cb(null, true);
    if (origins.includes(origin)) return cb(null, true);
    return cb(new Error("CORS blocked"), false);
  },
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));
app.use(requestContext);
app.use(
  morgan((tokens, req, res) =>
    JSON.stringify({
      scope: "http",
      event: "request",
      requestId: getOrCreateRequestId(req),
      method: tokens.method(req, res),
      path: tokens.url(req, res),
      status: Number(tokens.status(req, res) ?? 0),
      durationMs: Number(tokens["response-time"](req, res) ?? 0),
      contentLength: Number(tokens.res(req, res, "content-length") ?? 0),
      ip: (req as any).clientIp ?? req.ip,
      userAgent: tokens.req(req, res, "user-agent"),
    })
  )
);

// Session cookie auth (USER/RESELLER web sessions)
app.use(sessionReader());

app.use(ipGate);

app.use(rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
}));

app.get("/health", async (_req: express.Request, res: express.Response) => {
  const db = await prisma.$queryRaw`SELECT 1 as ok`;
  res.json({ ok: true, db });
});

app.use("/auth", authRouter);
app.use("/me", meRouter);
app.use("/admin", adminRouter);
app.use("/reseller", resellerRouter);
app.use("/search", searchRouter);
app.use("/export", exportRouter);
app.use("/support", supportRouter);

// Production-safe aliases when reverse proxy forwards /api/* without stripping the prefix.
app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/admin", adminRouter);
app.use("/api/reseller", resellerRouter);
app.use("/api/search", searchRouter);
app.use("/api/export", exportRouter);
app.use("/api/support", supportRouter);
app.use("/api", apiRouter);

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT ?? 8080);
startApiHealthScheduler();
app.listen(port, () => {
  logInfo({
    scope: "server",
    event: "started",
    port,
  });
});
