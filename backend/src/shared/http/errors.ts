import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logError, logWarn } from "../observability/logger.js";
import { getOrCreateRequestId } from "../observability/requestContext.js";

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, "NOT_FOUND", "Route not found"));
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const requestId = getOrCreateRequestId(req);
  // Zod validation errors -> 400
  if (err instanceof ZodError) {
    return res.status(400).json({
      status: "error",
      code: "VALIDATION_ERROR",
      message: "Invalid request",
      requestId,
      issues: err.issues
    });
  }

  const status = err?.status ?? 500;
  const code = err?.code ?? "INTERNAL_ERROR";
  const message = status === 500 ? "Server error" : (err?.message ?? "Error");
  const logPayload = {
    scope: "http",
    event: "request-failed",
    requestId,
    method: req.method,
    path: req.originalUrl,
    status,
    code,
    error: err,
  };
  if (status >= 500) {
    logError(logPayload);
  } else {
    logWarn(logPayload);
  }
  return res.status(status).json({ status: "error", code, message, requestId });
}
